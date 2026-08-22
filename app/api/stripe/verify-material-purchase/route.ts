import { NextResponse } from "next/server";
import { isMaterialPurchaseSchemaError, recordMaterialPurchase } from "@/lib/material-purchases";
import { readableError, requireSupabaseUser } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const auth = await requireSupabaseUser(request);
    if (auth.response) return auth.response;
    const { sessionId } = (await request.json().catch(() => ({}))) as { sessionId?: unknown };
    if (typeof sessionId !== "string" || !sessionId.startsWith("cs_")) {
      return NextResponse.json({ ok: false, message: "決済情報を確認できません。" }, { status: 400 });
    }
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) return NextResponse.json({ ok: false, message: "決済設定が未完了です。" }, { status: 500 });
    const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${stripeSecretKey}` },
    });
    const session = await response.json() as { payment_status?: string; metadata?: Record<string, string>; amount_total?: number };
    const metadata = session.metadata ?? {};
    if (!response.ok || session.payment_status !== "paid" || metadata.kind !== "pdf_material" || metadata.user_id !== auth.user.id) {
      return NextResponse.json({ ok: true, paid: false });
    }
    await recordMaterialPurchase({
      userId: auth.user.id,
      stripeSessionId: sessionId,
      purchaseType: metadata.purchase_type === "wordbook" ? "wordbook" : "asset",
      assetId: metadata.asset_id || null,
      wordbookId: metadata.wordbook_id || null,
      amountJpy: Math.max(1, Math.floor(Number(metadata.amount_jpy) || Number(session.amount_total) || 0)),
    });
    return NextResponse.json({ ok: true, paid: true });
  } catch (error) {
    const message = isMaterialPurchaseSchemaError(error)
      ? "教材購入テーブルが未作成です。管理者にお問い合わせください。"
      : readableError(error);
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

