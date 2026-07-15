import { NextResponse } from "next/server";
import {
  AdminAuthStorageError,
  generateBase32Secret,
  getAdminTotpSecret,
  requireAdmin,
  savePendingAdminTotpSecret,
} from "@/lib/admin-auth";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    const secret = await getAdminTotpSecret();
    return NextResponse.json(
      { ok: true, enabled: Boolean(secret), viaEnv: Boolean(process.env.ADMIN_TOTP_SECRET) },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("Failed to read admin 2FA status", error);
    return NextResponse.json(
      { ok: false, message: "2段階認証の設定を安全に確認できませんでした。" },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}

export async function POST(request: Request) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  if (process.env.ADMIN_TOTP_SECRET) {
    return NextResponse.json(
      { ok: false, message: "2段階認証は環境変数 ADMIN_TOTP_SECRET で設定済みです。" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const secret = generateBase32Secret();
    // Store this separately from the active secret. Starting setup never disables
    // an already-active second factor if the operator closes the page halfway.
    await savePendingAdminTotpSecret(secret);

    const label = encodeURIComponent("Vocab Print Pro (Admin)");
    const issuer = encodeURIComponent("VocabPrintPro");
    const otpauth = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
    return NextResponse.json({ ok: true, secret, otpauth }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("Failed to create pending admin 2FA secret", error);
    const message =
      error instanceof AdminAuthStorageError
        ? error.message
        : "2段階認証の設定を保存できませんでした。";
    return NextResponse.json({ ok: false, message }, { status: 503, headers: NO_STORE_HEADERS });
  }
}
