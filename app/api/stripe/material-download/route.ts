import { NextResponse } from "next/server";
import { recordMaterialPurchase } from "@/lib/material-purchases";
import {
  createPdfAssetSignedUrl,
  readPdfAssetById,
  readPdfAssetsByWordbookId,
  type PdfAsset,
} from "@/lib/pdf-assets";
import { optionalSupabaseUser, readableError } from "@/lib/supabase/admin";

// 教材購入の完了後、Stripeのセッション（session_id）からダウンロードURLを発行する。
// ログイン不要（ゲスト購入対応）。session_id は購入者だけがリダイレクトで受け取る値なので、
// 支払い済みを確認できた場合のみ、有効期限つきの署名URLを返す。
export async function POST(request: Request) {
  try {
    const { sessionId } = (await request.json().catch(() => ({}))) as { sessionId?: unknown };
    if (typeof sessionId !== "string" || !sessionId.startsWith("cs_")) {
      return NextResponse.json({ ok: false, message: "決済情報を確認できません。" }, { status: 400 });
    }
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) return NextResponse.json({ ok: false, message: "決済設定が未完了です。" }, { status: 500 });

    const response = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
      { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
    );
    const session = (await response.json()) as {
      payment_status?: string;
      status?: string;
      metadata?: Record<string, string>;
      amount_total?: number;
    };
    const metadata = session.metadata ?? {};
    if (!response.ok || metadata.kind !== "pdf_material") {
      return NextResponse.json({ ok: false, message: "この決済の教材が見つかりません。" }, { status: 404 });
    }

    // コンビニ払い・銀行振込など後払いは、この時点で "unpaid" のことがある。
    if (session.payment_status !== "paid") {
      return NextResponse.json({
        ok: true,
        paid: false,
        pending: session.payment_status === "unpaid" && session.status !== "expired",
        message:
          session.status === "expired"
            ? "お支払い期限が切れました。お手数ですがもう一度ご購入ください。"
            : "お支払いの確定を待っています。コンビニ・銀行振込の場合は、支払い完了後にこのページを再度開くとダウンロードできます。",
      });
    }

    // 支払い済み → 購入対象の教材を集めて署名URLを発行する。
    const purchaseType = metadata.purchase_type === "wordbook" ? "wordbook" : "asset";
    let saleAssets: PdfAsset[] = [];
    if (purchaseType === "asset") {
      const asset = metadata.asset_id ? await readPdfAssetById(metadata.asset_id) : undefined;
      if (asset && asset.visibility === "sale") saleAssets = [asset];
    } else if (metadata.wordbook_id) {
      saleAssets = (await readPdfAssetsByWordbookId(metadata.wordbook_id)).filter(
        (asset) => asset.visibility === "sale"
      );
    }
    if (saleAssets.length === 0) {
      return NextResponse.json(
        { ok: false, message: "購入された教材が見つかりませんでした。お問い合わせから決済番号をお知らせください。" },
        { status: 404 }
      );
    }

    const items = await Promise.all(
      saleAssets.map(async (asset) => ({
        id: asset.id,
        title: asset.title,
        fileName: asset.fileName,
        url: await createPdfAssetSignedUrl(asset.storagePath, 600, asset.storageProvider ?? "supabase"),
      }))
    );

    // ログイン済みで、かつ本人の購入なら、アカウントにも購入履歴を残して後から再取得できるようにする（任意）。
    const auth = await optionalSupabaseUser(request);
    if (auth.user && (!metadata.user_id || metadata.user_id === auth.user.id)) {
      await recordMaterialPurchase({
        userId: auth.user.id,
        stripeSessionId: sessionId,
        purchaseType,
        assetId: metadata.asset_id || null,
        wordbookId: metadata.wordbook_id || null,
        amountJpy: Math.max(1, Math.floor(Number(metadata.amount_jpy) || Number(session.amount_total) || 0)),
      }).catch(() => undefined);
    }

    return NextResponse.json({ ok: true, paid: true, items });
  } catch (error) {
    return NextResponse.json({ ok: false, message: readableError(error) }, { status: 500 });
  }
}
