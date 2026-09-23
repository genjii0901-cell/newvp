import { NextResponse } from "next/server";
import { readPdfAssetById, readPdfAssetsByWordbookId } from "@/lib/pdf-assets";
import { optionalSupabaseUser, readableError, tryEnsureProfile } from "@/lib/supabase/admin";

function isProductionHost(appUrl: string) {
  try {
    return ["vocabprint.com", "www.vocabprint.com"].includes(new URL(appUrl).hostname.toLowerCase());
  } catch {
    return false;
  }
}

function withDatabaseDeadline<T>(promise: Promise<T>) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("DATABASE_TIMEOUT")), 10_000)),
  ]);
}

export async function POST(request: Request) {
  try {
    // ログインは任意。ゲストでも購入できるようにする（ログイン済みなら購入をアカウントへ紐づける）。
    const auth = await withDatabaseDeadline(optionalSupabaseUser(request));
    const body = (await request.json().catch(() => ({}))) as { purchaseType?: unknown; assetId?: unknown; wordbookId?: unknown };
    const purchaseType = body.purchaseType === "wordbook" ? "wordbook" : body.purchaseType === "asset" ? "asset" : null;
    if (!purchaseType) return NextResponse.json({ ok: false, message: "購入方法を確認してください。" }, { status: 400 });

    const requestedAsset = purchaseType === "asset" ? await withDatabaseDeadline(readPdfAssetById(String(body.assetId ?? ""))) : null;
    const wordbookId = purchaseType === "wordbook" ? String(body.wordbookId ?? "") : requestedAsset?.wordbookId ?? "";
    const bookAssets = purchaseType === "wordbook"
      ? (await withDatabaseDeadline(readPdfAssetsByWordbookId(wordbookId))).filter((asset) => asset.visibility === "sale")
      : [];
    if ((purchaseType === "asset" && requestedAsset?.visibility !== "sale") || (purchaseType === "wordbook" && (!wordbookId || bookAssets.length === 0))) {
      return NextResponse.json({ ok: false, message: "購入できる教材が見つかりません。ページを再読み込みしてください。" }, { status: 404 });
    }

    const amount = purchaseType === "asset"
      ? Math.max(50, requestedAsset?.priceJpy ?? 500)
      : Math.max(100, bookAssets[0]?.bundlePriceJpy ?? 980);
    const title = purchaseType === "asset"
      ? requestedAsset!.title
      : `${bookAssets[0]?.wordbookTitle ?? "単語帳"} PDF教材セット`;
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const requestOrigin = new URL(request.url).origin;
    const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL ?? requestOrigin;
    const appUrl = isProductionHost(requestOrigin) ? requestOrigin : configuredAppUrl;
    if (!stripeSecretKey) return NextResponse.json({ ok: false, message: "決済設定が未完了です。" }, { status: 500 });
    if (isProductionHost(appUrl) && !stripeSecretKey.startsWith("sk_live_")) {
      return NextResponse.json({ ok: false, message: "本番決済の設定を確認してください。" }, { status: 503 });
    }

    // ログイン済みならプロフィール（Stripe顧客）を用意。ゲストは顧客なしで進める。
    const profile = auth.user ? await withDatabaseDeadline(tryEnsureProfile(auth.user)) : null;
    const returnQuery = wordbookId ? `&book=${encodeURIComponent(wordbookId)}` : "";
    const params = new URLSearchParams({
      mode: "payment",
      success_url: `${appUrl}/materials?checkout=success&session_id={CHECKOUT_SESSION_ID}${returnQuery}`,
      cancel_url: `${appUrl}/materials?checkout=cancel${returnQuery}`,
    });
    if (auth.user) params.append("client_reference_id", auth.user.id);
    // 決済手段はStripeダッシュボードで有効化したものを自動で全て表示する
    // （カード / PayPay / Link / コンビニ / 銀行振込 など）。payment_method_types は指定しない。
    params.append("line_items[0][price_data][currency]", "jpy");
    params.append("line_items[0][price_data][unit_amount]", String(amount));
    params.append("line_items[0][price_data][product_data][name]", title);
    params.append("line_items[0][quantity]", "1");
    params.append("metadata[kind]", "pdf_material");
    if (auth.user) params.append("metadata[user_id]", auth.user.id);
    params.append("metadata[purchase_type]", purchaseType);
    params.append("metadata[amount_jpy]", String(amount));
    if (requestedAsset) params.append("metadata[asset_id]", requestedAsset.id);
    if (wordbookId) params.append("metadata[wordbook_id]", wordbookId);
    if (profile?.stripe_customer_id) params.append("customer", profile.stripe_customer_id);
    else if (auth.user?.email) params.append("customer_email", auth.user.email);

    const createSession = async () => {
      const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: { Authorization: `Bearer ${stripeSecretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
      });
      const result = await response.json() as {
        url?: string;
        error?: { message?: string; code?: string; param?: string };
      };
      return { response, result };
    };

    let { response, result } = await createSession();
    if (!response.ok && profile?.stripe_customer_id && result.error?.param === "customer") {
      params.delete("customer");
      if (auth.user?.email) params.set("customer_email", auth.user.email);
      ({ response, result } = await createSession());
    }
    if (!response.ok || !result.url) {
      return NextResponse.json({
        ok: false,
        message: result.error?.message
          ? `購入画面を開けませんでした: ${result.error.message}`
          : "購入画面を開けませんでした。時間をおいてもう一度お試しください。",
      }, { status: response.status || 500 });
    }
    return NextResponse.json({ ok: true, url: result.url });
  } catch (error) {
    if (error instanceof Error && error.message === "DATABASE_TIMEOUT") {
      return NextResponse.json({
        ok: false,
        message: "購入用データベースは現在一時的に利用できません。復旧後にもう一度お試しください。",
      }, { status: 503 });
    }
    return NextResponse.json({ ok: false, message: readableError(error) }, { status: 500 });
  }
}
