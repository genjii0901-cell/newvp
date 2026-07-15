import { NextResponse } from "next/server";
import { shouldRejectUnconfiguredTotpCode } from "@/lib/admin-auth-core";
import {
  AdminAuthStorageError,
  checkAdminRateLimit,
  clearAdminSessionCookie,
  consumeTotp,
  getAdminTotpSecret,
  issueAdminToken,
  recordAdminAuthFailure,
  requireAdmin,
  resetAdminAuthFailures,
  setAdminSessionCookie,
  verifyPrimaryAdminCredential,
} from "@/lib/admin-auth";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function rateLimitedResponse(remainingSeconds: number) {
  const retryAfter = Math.max(1, Math.ceil(remainingSeconds));
  return NextResponse.json(
    {
      ok: false,
      locked: true,
      message: `ログイン試行回数の上限に達しました。約${Math.max(1, Math.ceil(retryAfter / 60))}分後に再試行してください。`,
    },
    {
      status: 429,
      headers: { ...NO_STORE_HEADERS, "Retry-After": String(retryAfter) },
    }
  );
}

export async function GET(request: Request) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;
  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
  clearAdminSessionCookie(response);
  return response;
}

export async function POST(request: Request) {
  try {
    const currentLimit = await checkAdminRateLimit(request);
    if (currentLimit.locked) return rateLimitedResponse(currentLimit.remainingSeconds);

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const password = typeof body.password === "string" ? body.password : "";
    const code = typeof body.code === "string" ? body.code : "";

    const primary = await verifyPrimaryAdminCredential(request, password);
    if (!primary.ok) {
      const limit = await recordAdminAuthFailure(request);
      if (limit.locked) return rateLimitedResponse(limit.remainingSeconds);
      return NextResponse.json(
        {
          ok: false,
          message: primary.configured
            ? "管理者の認証情報または認証コードが正しくありません。"
            : "管理者認証が設定されていません。",
        },
        { status: primary.configured ? 401 : 500, headers: NO_STORE_HEADERS }
      );
    }

    const totpSecret = await getAdminTotpSecret();
    // Never silently ignore a supplied OTP. Before 2FA is activated there is no
    // code that can be valid, so accepting an arbitrary six-digit value would
    // make the login screen look as though a second factor had been verified.
    if (shouldRejectUnconfiguredTotpCode(code, Boolean(totpSecret))) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "2段階認証はまだ有効ではありません。認証コードを空欄にしてログインし、管理画面で2段階認証の設定を完了してください。",
        },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    // Fail closed: when TOTP is active, a valid and previously unused code is
    // mandatory regardless of whether the primary credential was a password or
    // a Supabase admin session.
    if (totpSecret && !(await consumeTotp(code, totpSecret))) {
      const limit = await recordAdminAuthFailure(request);
      if (limit.locked) return rateLimitedResponse(limit.remainingSeconds);
      return NextResponse.json(
        { ok: false, message: "管理者の認証情報または認証コードが正しくありません。" },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    await resetAdminAuthFailures(request);
    const token = issueAdminToken(primary.subject, Boolean(totpSecret));
    const response = NextResponse.json(
      { ok: true, twoFactorEnabled: Boolean(totpSecret) },
      { headers: NO_STORE_HEADERS }
    );
    setAdminSessionCookie(response, token);
    return response;
  } catch (error) {
    console.error("Admin login failed closed", error);
    const message =
      error instanceof AdminAuthStorageError
        ? error.message
        : "管理者認証を安全に確認できませんでした。";
    return NextResponse.json({ ok: false, message }, { status: 503, headers: NO_STORE_HEADERS });
  }
}
