import { NextResponse } from "next/server";
import {
  requireAdmin,
  getAdminTotpSecret,
  saveAdminTotpSecret,
  generateBase32Secret,
} from "@/lib/admin-auth";

// 現在の2FA設定状況を返す
export async function GET(request: Request) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;

  const secret = await getAdminTotpSecret();
  const viaEnv = Boolean(process.env.ADMIN_TOTP_SECRET);
  return NextResponse.json({ ok: true, enabled: Boolean(secret), viaEnv });
}

// 新しい秘密鍵を生成してDBに保存し、登録用の情報を返す（管理者の画面でのみ表示）
export async function POST(request: Request) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;

  // 環境変数で固定設定されている場合はそちらが優先なので変更不可
  if (process.env.ADMIN_TOTP_SECRET) {
    return NextResponse.json(
      { ok: false, message: "2FAは環境変数 ADMIN_TOTP_SECRET で設定済みです。" },
      { status: 400 }
    );
  }

  const secret = generateBase32Secret();
  const saved = await saveAdminTotpSecret(secret);
  if (!saved) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "保存に失敗しました。Supabaseに app_settings テーブル（key text primary key, value text）があるか確認してください。",
      },
      { status: 500 }
    );
  }

  const label = encodeURIComponent("Vocab Print Pro (Admin)");
  const issuer = encodeURIComponent("VocabPrintPro");
  const otpauth = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;

  return NextResponse.json({ ok: true, secret, otpauth });
}
