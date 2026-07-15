import { NextResponse } from "next/server";
import {
  activatePendingAdminTotpSecret,
  AdminAuthStorageError,
  checkAdminRateLimit,
  clearAdminSessionCookie,
  consumeTotp,
  getPendingTotpSecret,
  recordAdminAuthFailure,
  requireAdmin,
  resetAdminAuthFailures,
} from "@/lib/admin-auth";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };
const RATE_BUCKET = "totp-setup";

export async function POST(request: Request) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    const currentLimit = await checkAdminRateLimit(request, RATE_BUCKET);
    if (currentLimit.locked) {
      return NextResponse.json(
        { ok: false, message: "確認コードの試行回数が上限に達しました。しばらく待って再試行してください。" },
        {
          status: 429,
          headers: {
            ...NO_STORE_HEADERS,
            "Retry-After": String(Math.max(1, Math.ceil(currentLimit.remainingSeconds))),
          },
        }
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const code = typeof body.code === "string" ? body.code : "";
    const secret = await getPendingTotpSecret();
    if (!secret) {
      return NextResponse.json(
        { ok: false, message: "先に2段階認証の設定を開始してください。" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (!(await consumeTotp(code, secret))) {
      const limit = await recordAdminAuthFailure(request, RATE_BUCKET);
      return NextResponse.json(
        {
          ok: false,
          message: limit.locked
            ? "確認コードの試行回数が上限に達しました。しばらく待って再試行してください。"
            : "認証コードが正しくありません。",
        },
        {
          status: limit.locked ? 429 : 400,
          headers: limit.locked
            ? { ...NO_STORE_HEADERS, "Retry-After": String(Math.max(1, Math.ceil(limit.remainingSeconds))) }
            : NO_STORE_HEADERS,
        }
      );
    }

    await activatePendingAdminTotpSecret(secret);
    await resetAdminAuthFailures(request, RATE_BUCKET);
    const response = NextResponse.json(
      { ok: true, reauthenticationRequired: true },
      { headers: NO_STORE_HEADERS }
    );
    // Any pre-MFA session must not survive activation. The next login must prove
    // possession of the newly registered factor.
    clearAdminSessionCookie(response);
    return response;
  } catch (error) {
    console.error("Failed to confirm admin 2FA", error);
    const message =
      error instanceof AdminAuthStorageError
        ? error.message
        : "2段階認証を安全に有効化できませんでした。";
    return NextResponse.json({ ok: false, message }, { status: 503, headers: NO_STORE_HEADERS });
  }
}
