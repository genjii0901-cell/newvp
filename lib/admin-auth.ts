import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServerConfigured } from "@/lib/supabase/admin";

const TOTP_SETTING_KEY = "admin_totp_secret";
const TOTP_ENABLED_KEY = "admin_totp_enabled";
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_FAILS = 10;
const LOCK_MS = 15 * 60 * 1000;
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function hmacHex(data: string, key: string) {
  return crypto.createHmac("sha256", key).update(data).digest("hex");
}

export function isTwoFactorEnabled() {
  return Boolean(process.env.ADMIN_TOTP_SECRET);
}

async function readSetting(key: string): Promise<string | null> {
  if (!isSupabaseServerConfigured()) return null;
  try {
    const sb = getSupabaseAdmin();
    const { data } = await sb.from("app_settings").select("value").eq("key", key).maybeSingle();
    const value = (data as { value?: unknown } | null)?.value;
    return typeof value === "string" && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

async function writeSetting(key: string, value: string): Promise<boolean> {
  if (!isSupabaseServerConfigured()) return false;
  try {
    const sb = getSupabaseAdmin();
    const { error } = await sb.from("app_settings").upsert({ key, value }, { onConflict: "key" });
    return !error;
  } catch {
    return false;
  }
}

export async function getAdminTotpSecret(): Promise<string | null> {
  const envSecret = process.env.ADMIN_TOTP_SECRET;
  if (envSecret) return envSecret;
  const enabled = await readSetting(TOTP_ENABLED_KEY);
  if (enabled !== "1") return null;
  return await readSetting(TOTP_SETTING_KEY);
}

export async function getPendingTotpSecret(): Promise<string | null> {
  return readSetting(TOTP_SETTING_KEY);
}

export async function saveAdminTotpSecret(secret: string): Promise<boolean> {
  const ok1 = await writeSetting(TOTP_SETTING_KEY, secret);
  const ok2 = await writeSetting(TOTP_ENABLED_KEY, "0");
  return ok1 && ok2;
}

export async function enableAdminTotp(): Promise<boolean> {
  return writeSetting(TOTP_ENABLED_KEY, "1");
}

export function generateBase32Secret(bytes = 20): string {
  const buf = crypto.randomBytes(bytes);
  let out = "";
  let bits = 0;
  let value = 0;
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function issueAdminToken(): string {
  const key = process.env.ADMIN_PASSWORD ?? "";
  const exp = String(Date.now() + TOKEN_TTL_MS);
  return `${exp}.${hmacHex(exp, key)}`;
}

export function verifyAdminToken(token: string | null | undefined): boolean {
  if (!token) return false;
  const key = process.env.ADMIN_PASSWORD ?? "";
  if (!key) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const expStr = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = hmacHex(expStr, key);
  if (sig.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

async function resolveAdminUserFromBearerToken(request: Request) {
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
  if (error || !data.user) {
    return { ok: false as const, reason: "invalid" };
  }

  const supabase = getSupabaseAdmin();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role,email")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError) {
    return { ok: false as const, reason: "profile-error", message: profileError.message };
  }

  if ((profile?.role ?? "user") !== "admin") {
    return { ok: false as const, reason: "not-admin" };
  }

  return {
    ok: true as const,
    user: data.user,
    profile: {
      role: profile?.role ?? "admin",
      email:
        typeof profile?.email === "string" && profile.email.length > 0
          ? profile.email
          : data.user.email ?? null,
    },
  };
}

export async function requireAdmin(request: Request): Promise<NextResponse | null> {
  const supplied =
    request.headers.get("x-admin-password") ?? request.headers.get("x-admin-token") ?? "";

  if (supplied && verifyAdminToken(supplied)) {
    return null;
  }

  const bearerAdmin = await resolveAdminUserFromBearerToken(request);
  if (bearerAdmin.ok) {
    return null;
  }

  if (process.env.ADMIN_PASSWORD) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "管理者権限が確認できませんでした。管理者アカウントでログインするか、非常用の管理者ログインを使ってください。",
      },
      { status: 401 }
    );
  }

  return NextResponse.json(
    {
      ok: false,
      message:
        "管理者認証の設定が不足しています。`ADMIN_PASSWORD` を設定するか、Supabase の profiles.role を admin にしたアカウントでログインしてください。",
    },
    { status: 500 }
  );
}

function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, "").replace(/\s/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (bin % 1_000_000).toString().padStart(6, "0");
}

export function verifyTotp(code: string, secretBase32: string, window = 1): boolean {
  const clean = (code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  const secret = base32Decode(secretBase32);
  if (secret.length === 0) return false;
  const counter = Math.floor(Date.now() / 1000 / 30);
  for (let w = -window; w <= window; w++) {
    if (hotp(secret, counter + w) === clean) return true;
  }
  return false;
}

type Attempt = { fails: number; lockedUntil: number };
const attempts = new Map<string, Attempt>();

export function isLockedOut(key = "admin"): boolean {
  const a = attempts.get(key);
  if (!a) return false;
  if (a.lockedUntil && a.lockedUntil > Date.now()) return true;
  if (a.lockedUntil && a.lockedUntil <= Date.now()) {
    attempts.delete(key);
  }
  return false;
}

export function recordFail(key = "admin"): void {
  const a = attempts.get(key) ?? { fails: 0, lockedUntil: 0 };
  a.fails += 1;
  if (a.fails >= MAX_FAILS) {
    a.lockedUntil = Date.now() + LOCK_MS;
  }
  attempts.set(key, a);
}

export function resetAttempts(key = "admin"): void {
  attempts.delete(key);
}

export function lockRemainingSeconds(key = "admin"): number {
  const a = attempts.get(key);
  if (!a || !a.lockedUntil) return 0;
  return Math.max(0, Math.ceil((a.lockedUntil - Date.now()) / 1000));
}
