import { NextResponse } from "next/server";
import {
  issueAdminToken,
  verifyTotp,
  isTwoFactorEnabled,
  isLockedOut,
  recordFail,
  resetAttempts,
  lockRemainingSeconds,
} from "@/lib/admin-auth";

export async function POST(request: Request) {
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return NextResponse.json(
      { ok: false, message: "ADMIN_PASSWORD is not configured." },
      { status: 500 }
    );
  }

  // ロックアウト中は受け付けない
  if (isLockedOut()) {
    const sec = lockRemainingSeconds();
    return NextResponse.json(
      {
        ok: false,
        locked: true,
        message: `ログイン試行回数の上限に達しました。約${Math.ceil(sec / 60)}分後に再度お試しください。`,
      },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";
  const code = typeof body.code === "string" ? body.code : "";

  const totpSecret = process.env.ADMIN_TOTP_SECRET;
  const passwordOk = password === adminPassword;
  // TOTP未設定なら検証をスキップ（2FA無効＝要設定）
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
    twoFactorEnabled: isTwoFactorEnabled(),
  });
}
