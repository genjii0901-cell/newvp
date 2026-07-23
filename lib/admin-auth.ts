import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServerConfigured } from "@/lib/supabase/admin";
import {
  decryptAdminSecret,
  encryptAdminSecret,
  findMatchingTotpCounter,
  fingerprintAdminValue,
  isAdminSessionSufficient,
  issueAdminSessionToken,
  safeEqualText,
  verifyAdminSessionToken,
  verifyTotp,
} from "@/lib/admin-auth-core";

const TOTP_SETTING_KEY = "admin_totp_secret";
const TOTP_PENDING_SETTING_KEY = "admin_totp_pending_secret";
const TOTP_ENABLED_KEY = "admin_totp_enabled";
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const MEMORY_LOCK_MS = 15 * 60 * 1000;
const MEMORY_WINDOW_MS = 15 * 60 * 1000;

export const ADMIN_SESSION_COOKIE = "vpp_admin_session";
export { verifyTotp };

export class AdminAuthStorageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AdminAuthStorageError";
  }
}

function getAdminServerKey(): string {
  const key =
    process.env.ADMIN_SESSION_SECRET ??
    process.env.ADMIN_PASSWORD ??
    "";
  if (!key) throw new Error("ADMIN_SESSION_SECRET or ADMIN_PASSWORD is required.");
  return key;
}

async function readSetting(key: string): Promise<string | null> {
  if (!isSupabaseServerConfigured()) return null;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error) throw error;
    const value = (data as { value?: unknown } | null)?.value;
    return typeof value === "string" && value.length > 0 ? value : null;
  } catch (error) {
    throw new AdminAuthStorageError("管理者認証設定を安全に読み取れませんでした。", { cause: error });
  }
}

async function writeSetting(key: string, value: string): Promise<void> {
  if (!isSupabaseServerConfigured()) {
    throw new AdminAuthStorageError("Supabase が未設定のため管理者認証設定を保存できません。");
  }
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("app_settings").upsert({ key, value }, { onConflict: "key" });
    if (error) throw error;
  } catch (error) {
    throw new AdminAuthStorageError("管理者認証設定を安全に保存できませんでした。", { cause: error });
  }
}

async function deleteSetting(key: string): Promise<void> {
  if (!isSupabaseServerConfigured()) return;
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("app_settings").delete().eq("key", key);
    if (error) throw error;
  } catch (error) {
    throw new AdminAuthStorageError("古い管理者認証設定を削除できませんでした。", { cause: error });
  }
}

function isPlausibleBase32Secret(value: string): boolean {
  const clean = value.replace(/\s/g, "").toUpperCase();
  return clean.length >= 16 && /^[A-Z2-7]+=*$/.test(clean);
}

async function readStoredTotpSecret(key: string): Promise<string | null> {
  const stored = await readSetting(key);
  if (!stored) return null;

  if (stored.startsWith("enc.")) {
    const decrypted = decryptAdminSecret(stored, getAdminServerKey());
    if (!decrypted || !isPlausibleBase32Secret(decrypted)) {
      throw new AdminAuthStorageError("保存済みの2段階認証シークレットを復号できませんでした。");
    }
    return decrypted;
  }

  // Older versions stored this value as plaintext. Accept it once, then immediately
  // migrate it to authenticated encryption without changing the active secret.
  if (!isPlausibleBase32Secret(stored)) {
    throw new AdminAuthStorageError("保存済みの2段階認証シークレットが不正です。");
  }
  await writeSetting(key, encryptAdminSecret(stored, getAdminServerKey()));
  return stored;
}

export async function getAdminTotpSecret(): Promise<string | null> {
  const envSecret = process.env.ADMIN_TOTP_SECRET;
  if (envSecret) {
    if (!isPlausibleBase32Secret(envSecret)) {
      throw new AdminAuthStorageError("ADMIN_TOTP_SECRET の形式が不正です。");
    }
    return envSecret.replace(/\s/g, "").toUpperCase();
  }
  const enabled = await readSetting(TOTP_ENABLED_KEY);
  if (enabled !== "1") return null;
  const secret = await readStoredTotpSecret(TOTP_SETTING_KEY);
  if (!secret) {
    // enabled=1 without a usable secret must never degrade to password-only auth.
    throw new AdminAuthStorageError("2段階認証は有効ですが、シークレットが見つかりません。");
  }
  return secret;
}

export async function getPendingTotpSecret(): Promise<string | null> {
  const pending = await readStoredTotpSecret(TOTP_PENDING_SETTING_KEY);
  if (pending) return pending;

  // Compatibility with the old setup flow, which placed a pending secret in the
  // active key while admin_totp_enabled was still 0.
  const enabled = await readSetting(TOTP_ENABLED_KEY);
  return enabled === "1" ? null : readStoredTotpSecret(TOTP_SETTING_KEY);
}

export async function savePendingAdminTotpSecret(secret: string): Promise<void> {
  if (!isPlausibleBase32Secret(secret)) throw new Error("Invalid TOTP secret.");
  await writeSetting(TOTP_PENDING_SETTING_KEY, encryptAdminSecret(secret, getAdminServerKey()));
}

export async function activatePendingAdminTotpSecret(secret: string): Promise<void> {
  if (!isPlausibleBase32Secret(secret)) throw new Error("Invalid TOTP secret.");
  await writeSetting(TOTP_SETTING_KEY, encryptAdminSecret(secret, getAdminServerKey()));
  await writeSetting(TOTP_ENABLED_KEY, "1");
  await deleteSetting(TOTP_PENDING_SETTING_KEY);
}

export function generateBase32Secret(bytes = 20): string {
  const buffer = crypto.randomBytes(bytes);
  let output = "";
  let bits = 0;
  let value = 0;
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

export function issueAdminToken(subject: string, mfa: boolean): string {
  return issueAdminSessionToken(getAdminServerKey(), { subject, mfa, ttlMs: SESSION_TTL_MS });
}

function requestCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const item of header.split(";")) {
    const index = item.indexOf("=");
    if (index < 0) continue;
    if (item.slice(0, index).trim() !== name) continue;
    try {
      return decodeURIComponent(item.slice(index + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function requestAdminToken(request: Request): string | null {
  return (
    requestCookie(request, ADMIN_SESSION_COOKIE) ??
    request.headers.get("x-admin-token") ??
    // Kept only for compatibility with the previous client. Raw passwords are
    // never accepted here; the value must be a valid signed v2 session token.
    request.headers.get("x-admin-password")
  );
}

export function setAdminSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/admin",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export function clearAdminSessionCookie(response: NextResponse): void {
  response.cookies.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/admin",
    maxAge: 0,
  });
}

export async function resolveAdminUserFromBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!token || !supabaseUrl || !anonKey || !isSupabaseServerConfigured()) {
    return { ok: false as const, reason: "missing" };
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) return { ok: false as const, reason: "invalid" };

  const supabase = getSupabaseAdmin();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role,email")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError) {
    return { ok: false as const, reason: "profile-error", message: profileError.message };
  }
  if ((profile?.role ?? "user") !== "admin") return { ok: false as const, reason: "not-admin" };

  return {
    ok: true as const,
    user: data.user,
    profile: {
      role: "admin" as const,
      email:
        typeof profile?.email === "string" && profile.email.length > 0
          ? profile.email
          : data.user.email ?? null,
    },
  };
}

export async function verifyPrimaryAdminCredential(request: Request, password: string) {
  const configuredPassword = process.env.ADMIN_PASSWORD ?? "";
  if (configuredPassword && password && safeEqualText(password, configuredPassword)) {
    return { ok: true as const, subject: "password" };
  }

  const bearerAdmin = await resolveAdminUserFromBearerToken(request);
  if (bearerAdmin.ok) {
    return { ok: true as const, subject: `user:${bearerAdmin.user.id}` };
  }
  return {
    ok: false as const,
    configured: Boolean(configuredPassword || isSupabaseServerConfigured()),
  };
}

export async function requireAdmin(request: Request): Promise<NextResponse | null> {
  try {
    const totpSecret = await getAdminTotpSecret();
    const token = requestAdminToken(request);
    const claims = verifyAdminSessionToken(token, getAdminServerKey());
    if (isAdminSessionSufficient(claims, Boolean(totpSecret))) return null;

    // A verified Supabase admin session is a safe primary credential for initial
    // setup only. Once TOTP is active it must be exchanged for an MFA session.
    const bearerAdmin = await resolveAdminUserFromBearerToken(request);
    if (bearerAdmin.ok && !totpSecret) return null;

    return NextResponse.json(
      {
        ok: false,
        mfaRequired: Boolean(bearerAdmin.ok && totpSecret),
        message: totpSecret
          ? "管理者の2段階認証が必要です。認証コードを入力してログインしてください。"
          : "管理者認証を確認できませんでした。",
      },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Admin authorization failed closed", error);
    return NextResponse.json(
      { ok: false, message: "管理者認証設定を確認できないため、安全のためアクセスを拒否しました。" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}

type MemoryAttempt = { failures: number; windowStartedAt: number; lockedUntil: number };
const memoryAttempts = new Map<string, MemoryAttempt>();

type RateRule = { keyHash: string; maxFailures: number };

function requestIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    forwarded ||
    "unknown"
  ).slice(0, 200);
}

function rateRules(request: Request, bucket: string): RateRule[] {
  const key = getAdminServerKey();
  return [
    { keyHash: fingerprintAdminValue(`${bucket}:client:${requestIp(request)}`, key), maxFailures: 5 },
    { keyHash: fingerprintAdminValue(`${bucket}:global`, key), maxFailures: 25 },
  ];
}

function memoryRateLimit(rule: RateRule, action: "check" | "failure" | "success") {
  const now = Date.now();
  let state = memoryAttempts.get(rule.keyHash);
  if (state && state.lockedUntil <= now && now - state.windowStartedAt >= MEMORY_WINDOW_MS) {
    memoryAttempts.delete(rule.keyHash);
    state = undefined;
  }
  if (action === "success") {
    memoryAttempts.delete(rule.keyHash);
    return { locked: false, remainingSeconds: 0 };
  }
  if (action === "failure") {
    if (!state || now - state.windowStartedAt >= MEMORY_WINDOW_MS) {
      state = { failures: 0, windowStartedAt: now, lockedUntil: 0 };
    }
    state.failures += 1;
    if (state.failures >= rule.maxFailures) state.lockedUntil = now + MEMORY_LOCK_MS;
    memoryAttempts.set(rule.keyHash, state);
  }
  const locked = Boolean(state && state.lockedUntil > now);
  return {
    locked,
    remainingSeconds: locked ? Math.max(1, Math.ceil((state!.lockedUntil - now) / 1000)) : 0,
  };
}

async function persistentRateLimit(rule: RateRule, action: "check" | "failure" | "success") {
  if (!isSupabaseServerConfigured()) return memoryRateLimit(rule, action);
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("admin_auth_rate_limit", {
      p_key_hash: rule.keyHash,
      p_action: action,
      p_max_failures: rule.maxFailures,
      p_window_seconds: Math.floor(MEMORY_WINDOW_MS / 1000),
      p_lock_seconds: Math.floor(MEMORY_LOCK_MS / 1000),
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return {
      locked: Boolean((row as { locked?: unknown } | null)?.locked),
      remainingSeconds: Math.max(
        0,
        Number((row as { remaining_seconds?: unknown } | null)?.remaining_seconds ?? 0) || 0
      ),
    };
  } catch (error) {
    throw new AdminAuthStorageError(
      "管理者認証の試行回数制限を確認できません。セキュリティ用マイグレーションを適用してください。",
      { cause: error }
    );
  }
}

async function updateRateLimits(request: Request, bucket: string, action: "check" | "failure" | "success") {
  const results = await Promise.all(rateRules(request, bucket).map((rule) => persistentRateLimit(rule, action)));
  return results.reduce(
    (result, item) => ({
      locked: result.locked || item.locked,
      remainingSeconds: Math.max(result.remainingSeconds, item.remainingSeconds),
    }),
    { locked: false, remainingSeconds: 0 }
  );
}

export function checkAdminRateLimit(request: Request, bucket = "login") {
  return updateRateLimits(request, bucket, "check");
}

export function recordAdminAuthFailure(request: Request, bucket = "login") {
  return updateRateLimits(request, bucket, "failure");
}

export function resetAdminAuthFailures(request: Request, bucket = "login") {
  return updateRateLimits(request, bucket, "success");
}

const consumedTotpCounters = new Map<string, number>();

export async function consumeTotp(code: string, secret: string): Promise<boolean> {
  const counter = findMatchingTotpCounter(code, secret);
  if (counter === null) return false;

  const fingerprint = fingerprintAdminValue(secret, getAdminServerKey());
  const replayKey = `${fingerprint}:${counter}`;
  if (!isSupabaseServerConfigured()) {
    const currentCounter = Math.floor(Date.now() / 30_000);
    for (const [key, usedCounter] of consumedTotpCounters) {
      if (usedCounter < currentCounter - 2) consumedTotpCounters.delete(key);
    }
    if (consumedTotpCounters.has(replayKey)) return false;
    consumedTotpCounters.set(replayKey, counter);
    return true;
  }

  try {
    const supabase = getSupabaseAdmin();
    const expiresAt = new Date((counter + 3) * 30_000).toISOString();
    const { error } = await supabase.from("admin_totp_replay").insert({
      secret_fingerprint: fingerprint,
      totp_counter: counter,
      expires_at: expiresAt,
    });
    if (error) {
      if ((error as { code?: string }).code === "23505") return false;
      throw error;
    }
    // Opportunistic cleanup; failure here does not undo a successful atomic insert.
    await supabase.from("admin_totp_replay").delete().lt("expires_at", new Date().toISOString());
    return true;
  } catch (error) {
    throw new AdminAuthStorageError(
      "認証コードの再利用防止を確認できません。セキュリティ用マイグレーションを適用してください。",
      { cause: error }
    );
  }
}
