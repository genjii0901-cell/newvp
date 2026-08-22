import { NextResponse } from "next/server";
import { readPdfAssetCatalog } from "@/lib/pdf-assets";
import { readableError, requireSupabaseUser, tryEnsureProfile } from "@/lib/supabase/admin";

function isProductionHost(appUrl: string) {
  try {
    return ["vocabprint.com", "www.vocabprint.com"].includes(new URL(appUrl).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireSupabaseUser(request);
    if (auth.response) return auth.response;
    const body = (await request.json().catch(() => ({}))) as { purchaseType?: unknown; assetId?: unknown; wordbookId?: unknown };
    const purchaseType = body.purchaseType === "wordbook" ? "wordbook" : body.purchaseType === "asset" ? "asset" : null;
    if (!purchaseType) return NextResponse.json({ ok: false, message: "購入方法を確認してください。" }, { status: 400 });

    const catalog = await readPdfAssetCatalog();
    const saleAssets = catalog.filter((asset) => asset.visibility === "sale");
    const requestedAsset = purchaseType === "asset" ? saleAssets.find((asset) => asset.id === String(body.assetId ?? "")) : null;
    const wordbookId = purchaseType === "wordbook" ? String(body.wordbookId ?? "") : requestedAsset?.wordbookId ?? "";
    const bookAssets = purchaseType === "wordbook" ? saleAssets.filter((asset) => asset.wordbookId === wordbookId) : [];
    if ((purchaseType === "asset" && !requestedAsset) || (purchaseType === "wordbook" && (!wordbookId || bookAssets.length === 0))) {
      return NextResponse.json({ ok: false, message: "購入できる教材が見つかりません。" }, { status: 404 });
    }

    const amount = purchaseType === "asset"
      ? Math.max(50, requestedAsset?.priceJpy ?? 500)
      : Math.max(100, bookAssets[0]?.bundlePriceJpy ?? 980);
    const title = purchaseType === "asset"
      ? requestedAsset!.title
      : `${bookAssets[0]?.wordbookTitle ?? "単語帳"} PDF教材セット`;
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
    if (!stripeSecretKey) return NextResponse.json({ ok: false, message: "決済設定が未完了です。" }, { status: 500 });
    if (isProductionHost(appUrl) && !stripeSecretKey.startsWith("sk_live_")) {
      return NextResponse.json({ ok: false, message: "本番決済の設定を確認してください。" }, { status: 503 });
    }

    const profile = await tryEnsureProfile(auth.user);
    const params = new URLSearchParams({
      mode: "payment",
      success_url: `${appUrl}/materials?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/materials?checkout=cancel`,
      client_reference_id: auth.user.id,
    });
    params.append("payment_method_types[]", "card");
    params.append("line_items[0][price_data][currency]", "jpy");
    params.append("line_items[0][price_data][unit_amount]", String(amount));
    params.append("line_items[0][price_data][product_data][name]", title);
    params.append("line_items[0][quantity]", "1");
    params.append("metadata[kind]", "pdf_material");
    params.append("metadata[user_id]", auth.user.id);
    params.append("metadata[purchase_type]", purchaseType);
    params.append("metadata[amount_jpy]", String(amount));
    if (requestedAsset) params.append("metadata[asset_id]", requestedAsset.id);
    if (wordbookId) params.append("metadata[wordbook_id]", wordbookId);
    if (profile?.stripe_customer_id) params.append("customer", profile.stripe_customer_id);
    else if (auth.user.email) params.append("customer_email", auth.user.email);

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${stripeSecretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    const result = await response.json() as { url?: string; error?: { message?: string } };
    if (!response.ok || !result.url) {
      return NextResponse.json({ ok: false, message: result.error?.message ?? "購入画面を開けませんでした。" }, { status: response.status || 500 });
    }
    return NextResponse.json({ ok: true, url: result.url });
  } catch (error) {
    return NextResponse.json({ ok: false, message: readableError(error) }, { status: 500 });
  }
}

