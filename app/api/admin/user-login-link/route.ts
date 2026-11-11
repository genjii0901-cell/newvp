import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin, isSupabaseServerConfigured, readableError } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// 管理者が「お客さんのアカウントで不具合を確認する」ための、1回だけ使えるログイン用の値を作る。
// メールは送らない。値は管理画面にだけ返し、/support-login で使う（使うと管理者のログインは外れる）。
export async function POST(request: Request) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;
  if (!isSupabaseServerConfigured()) {
    return NextResponse.json({ ok: false, message: "Supabaseサーバー設定が未完了です。" }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as { email?: unknown };
  const email = (typeof body.email === "string" ? body.email : "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, message: "メールアドレスの形式で入力してください。" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: profiles } = await supabase.from("profiles").select("id,email,role").ilike("email", email).limit(2);
    const profile = profiles?.[0] ?? null;
    if (!profile) {
      return NextResponse.json({ ok: false, message: "このメールアドレスの会員が見つかりません。" }, { status: 404 });
    }
    if (profile.role === "admin") {
      return NextResponse.json({ ok: false, message: "管理者のアカウントには、この方法ではログインできません。" }, { status: 403 });
    }

    const { data, error } = await supabase.auth.admin.generateLink({ type: "magiclink", email });
    if (error) throw error;
    const tokenHash = data?.properties?.hashed_token;
    if (!tokenHash) throw new Error("ログイン用の値を作れませんでした。");

    // 誰の確認に入ったかを記録する（Vercelのログに残る。値そのものは書かない）。
    console.info(`[support-login] admin issued a one-time login for user ${profile.id}`);

    return NextResponse.json(
      { ok: true, email, tokenHash },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json({ ok: false, message: readableError(error) }, { status: 500 });
  }
}
