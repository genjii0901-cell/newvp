import { createHmac, timingSafeEqual } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type AccountAction = "cancel" | "delete";
export const accountActionCookie = (action: AccountAction) => `vpp-confirm-${action}`;
export const accountActionMaxAge = 600;

export function accountActionProof(user: User, action: AccountAction, code: string, expiresAt: number) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("本人確認の設定がありません。");
  return createHmac("sha256", key).update(JSON.stringify(["account-action-v1", user.id, user.email, action, code, expiresAt])).digest("hex");
}

export async function requireAccountActionCode(request: Request, user: User, action: AccountAction, code: unknown) {
  const cookie = request.headers.get("cookie")?.split(/;\s*/).find((item) => item.startsWith(accountActionCookie(action) + "="));
  const [expiry, signature] = (cookie?.split("=")[1] ?? "").split(".");
  const expiresAt = Number(expiry);
  const invalid = () => NextResponse.json({ ok: false, error: "有効なメール認証コードが必要です。コードを確認するか、再送してください。" }, { status: 403 });
  if (!user.email || typeof code !== "string" || !/^\d{6}$/.test(code) || !Number.isSafeInteger(expiresAt)
    || expiresAt <= Date.now() || !signature || !/^[a-f0-9]{64}$/.test(signature)) return invalid();

  const expected = accountActionProof(user, action, code, expiresAt);
  if (!timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"))) return invalid();

  // Supabase consumes the OTP on verification. Use a fresh server client and discard its session.
  const { data, error } = await getSupabaseAdmin().auth.verifyOtp({ email: user.email, token: code, type: "email" });
  return error || data.user?.id !== user.id ? invalid() : null;
}
