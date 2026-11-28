import { NextResponse } from "next/server";
import { accountActionCookie, accountActionMaxAge, accountActionProof } from "@/lib/account-action-email";
import { getSupabaseAdmin, requireSupabaseUser } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const auth = await requireSupabaseUser(request);
  if (auth.response) return auth.response;
  const { action } = await request.json().catch(() => ({}));
  if (action !== "cancel" && action !== "delete") return NextResponse.json({ ok: false, error: "操作を確認してください。" }, { status: 400 });
  const email = auth.user.email;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? process.env.EMAIL_FROM;
  if (!email || !auth.user.email_confirmed_at || !apiKey || !from) {
    return NextResponse.json({ ok: false, error: "確認済みメールアドレスまたはメール送信設定がありません。" }, { status: 503 });
  }

  const cookieName = accountActionCookie(action);
  const previous = request.headers.get("cookie")?.split(/;\s*/).find((item) => item.startsWith(cookieName + "="));
  const previousExpiry = Number(previous?.split("=")[1]?.split(".")[0]);
  if (previousExpiry - Date.now() > (accountActionMaxAge - 60) * 1000) {
    return NextResponse.json({ ok: false, error: "コードの再送は1分後にお試しください。" }, { status: 429 });
  }

  try {
    const { data, error } = await getSupabaseAdmin().auth.admin.generateLink({ type: "magiclink", email });
    const code = data?.properties?.email_otp;
    if (error || data.user?.id !== auth.user.id || !code || !/^\d{6}$/.test(code)) throw new Error("OTP unavailable");
    const label = action === "cancel" ? "有料プランの解約" : "アカウント削除";
    const expiresAt = Date.now() + accountActionMaxAge * 1000;
    const signature = accountActionProof(auth.user, action, code, expiresAt);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [email], subject: `【Vocab Print Pro】${label}の確認コード`,
        text: `${label}の確認コードは ${code} です。10分以内に元の画面に入力してください。心当たりがない場合は入力しないでください。` }),
    });
    if (!response.ok) throw new Error("Email request failed");
    const result = NextResponse.json({ ok: true });
    result.cookies.set(cookieName, `${expiresAt}.${signature}`, {
      httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", maxAge: accountActionMaxAge, path: "/",
    });
    return result;
  } catch {
    return NextResponse.json({ ok: false, error: "確認メールを送信できませんでした。時間をおいて再度お試しください。" }, { status: 503 });
  }
}
