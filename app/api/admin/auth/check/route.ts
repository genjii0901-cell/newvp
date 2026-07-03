import { NextResponse } from "next/server";
import {
  getAdminTotpSecret,
  isLockedOut,
  issueAdminToken,
  lockRemainingSeconds,
  recordFail,
  resetAttempts,
  verifyTotp,
} from "@/lib/admin-auth";

export async function POST(request: Request) {
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "管理者ログイン用の環境変数 `ADMIN_PASSWORD` が未設定です。ローカルなら `.env.local`、公開版なら Vercel の Environment Variables に設定してください。",
      },
      { status: 500 }
    );
  }

  if (isLockedOut()) {
    const sec = lockRemainingSeconds();
    return NextResponse.json(
      {
        ok: false,
        locked: true,
        message: `ログイン試行回数の上限に達しました。約${Math.ceil(sec / 60)}分後にもう一度お試しください。`,
      },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";
  const code = typeof body.code === "string" ? body.code : "";

  const totpSecret = await getAdminTotpSecret();
  const passwordOk = password === adminPassword;
  const totpOk = totpSecret ? verifyTotp(code, totpSecret) : true;

  if (!passwordOk || !totpOk) {
    recordFail();
    const message = !passwordOk
      ? "管理者パスワードが違います。"
      : "認証コードが正しくありません。認証アプリの6桁コードを入力してください。";
    return NextResponse.json({ ok: false, message }, { status: 401 });
  }

  resetAttempts();
  const token = issueAdminToken();
  return NextResponse.json({
    ok: true,
    token,
    twoFactorEnabled: Boolean(totpSecret),
  });
}
