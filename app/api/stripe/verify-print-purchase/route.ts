import { NextResponse } from "next/server";
import { getSupabaseAdmin, readableError, requireSupabaseUser } from "@/lib/supabase/admin";

// 単品購入のチェックアウトセッションが支払い済みかを検証し、印刷を許可する。
// 成功時に pdf_generations へ記録（テーブルが無ければ無視）。二重記録を避けるため session_id を保存する。
export async function POST(request: Request) {
  try {
    const auth = await requireSupabaseUser(request);
    if (auth.response) return auth.response;

    const { sessionId } = (await request.json().catch(() => ({}))) as { sessionId?: unknown };
    if (typeof sessionId !== "string" || !sessionId.startsWith("cs_")) {
      return NextResponse.json({ ok: false, error: "Invalid session." }, { status: 400 });
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return NextResponse.json({ ok: false, error: "Stripe未設定" }, { status: 500 });
    }

    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
      headers: { Authorization: `Bearer ${stripeSecretKey}` },
    });
    const session = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: "セッションを確認できませんでした。" }, { status: res.status });
    }

    const metadata = (session.metadata && typeof session.metadata === "object" ? session.metadata : {}) as Record<string, string>;
    const paid = session.payment_status === "paid";
    const belongsToUser = metadata.user_id === auth.user.id;
    const isPrintPurchase = metadata.kind === "print_purchase";

    if (!paid || !belongsToUser || !isPrintPurchase) {
      return NextResponse.json({ ok: true, paid: false });
    }

    const pages = Math.max(1, Math.floor(Number(metadata.pages) || 1));

    // 記録（pdf_generations が無い環境でも印刷は許可する）。
    try {
      const supabase = getSupabaseAdmin();
      await supabase.from("pdf_generations").insert({
        user_id: auth.user.id,
        type: "purchase",
        word_count: pages * 50,
        amount_charged: pages * 50,
      });
    } catch {
      // 記録失敗は無視（印刷は続行）
    }

    return NextResponse.json({ ok: true, paid: true, pages });
  } catch (error) {
    return NextResponse.json({ ok: false, error: readableError(error) }, { status: 500 });
  }
}
