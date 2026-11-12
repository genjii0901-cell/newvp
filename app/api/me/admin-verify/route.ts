import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/admin";
import { isAdminOwnerAccount } from "@/lib/plan-access";
import {
  AdminAuthStorageError,
  checkAdminRateLimit,
  consumeTotp,
  getAdminTotpSecret,
  issueAdminToken,
  recordAdminAuthFailure,
  resetAdminAuthFailures,
  setAdminSessionCookie,
} from "@/lib/admin-auth";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

// アカウント画面の「管理者としてプランを試す」用の2段階認証。
// 運営者本人のアカウント（確認済みメール）でログインしていて、認証アプリの6桁コードが正しいときだけ、
// 2段階認証済みの管理者セッションを発行する。お客さんのアカウントでは必ず拒否する。
export async function POST(request: Request) {
  const auth = await requireSupabaseUser(request);
  if (auth.response) return auth.response;

  if (!isAdminOwnerAccount(auth.user)) {
    return NextResponse.json(
      { ok: false, message: "このアカウントでは使えません。" },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const currentLimit = await checkAdminRateLimit(request);
    if (currentLimit.locked) {
      const retryAfter = Math.max(1, Math.ceil(currentLimit.remainingSeconds));
      return NextResponse.json(
        { ok: false, message: `試行回数の上限に達しました。約${Math.max(1, Math.ceil(retryAfter / 60))}分後にもう一度お試しください。` },
        { status: 429, headers: { ...NO_STORE_HEADERS, "Retry-After": String(retryAfter) } }
      );
    }

    const totpSecret = await getAdminTotpSecret();
    if (!totpSecret) {
      return NextResponse.json(
        { ok: false, message: "2段階認証がまだ設定されていません。先に管理画面（/admin）で2段階認証を設定してください。" },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const code = typeof body.code === "string" ? body.code.replace(/\s+/g, "") : "";
    if (!/^\d{6}$/.test(code) || !(await consumeTotp(code, totpSecret))) {
      await recordAdminAuthFailure(request);
      return NextResponse.json(
        { ok: false, message: "認証コードが正しくありません。認証アプリの最新の6桁を入れてください。" },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    await resetAdminAuthFailures(request);
    const response = NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
    setAdminSessionCookie(response, issueAdminToken(`user:${auth.user.id}`, true));
    console.info(`[admin-owner] owner verified 2FA for plan trial (user ${auth.user.id})`);
    return response;
  } catch (error) {
    console.error("Owner 2FA verification failed closed", error);
    const message = error instanceof AdminAuthStorageError ? error.message : "2段階認証を安全に確認できませんでした。";
    return NextResponse.json({ ok: false, message }, { status: 503, headers: NO_STORE_HEADERS });
  }
}
