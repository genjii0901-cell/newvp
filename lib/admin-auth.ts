import crypto from "crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServerConfigured } from "@/lib/supabase/admin";

const TOTP_SETTING_KEY = "admin_totp_secret";
const TOTP_ENABLED_KEY = "admin_totp_enabled";

// 管理画面の認証：
// - ログイン時にパスワード＋TOTP(2要素)を検証し、署名付きトークンを発行
// - 各API は x-admin-password ヘッダーに入ったトークンを検証
// - ログイン失敗のロックアウト（しきい値を超えたら一時ロック）
//
// 署名鍵は ADMIN_PASSWORD を流用（新たな秘密を増やさない）。
// TOTP は ADMIN_TOTP_SECRET（Base32）。未設定ならTOTP検証はスキップ（=2FA無効・要設定）。

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8時間
const MAX_FAILS = 10;
const LOCK_MS = 15 * 60 * 1000; // 10回失敗で15分ロック

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

/**
 * ログイン認証で使う「有効な」TOTP秘密鍵。
 * 環境変数が最優先。DBの鍵は「有効化フラグ(=スマホ登録確認済み)」が立っている時だけ有効。
 * これにより、鍵を生成しただけ（未確認）の状態ではロックアウトしない。
 */
export async function getAdminTotpSecret(): Promise<string | null> {
  const envSecret = process.env.ADMIN_TOTP_SECRET;
  if (envSecret) return envSecret;
  const enabled = await readSetting(TOTP_ENABLED_KEY);
  if (enabled !== "1") return null;
  return await readSetting(TOTP_SETTING_KEY);
}

/** 設定中（未確認でも可）のTOTP秘密鍵を取得。確認コード照合用。 */
export async function getPendingTotpSecret(): Promise<string | null> {
  return readSetting(TOTP_SETTING_KEY);
}

/** 新しいTOTP秘密鍵を生成・保存（この時点では未有効＝まだロックしない）。 */
export async function saveAdminTotpSecret(secret: string): Promise<boolean> {
  const ok1 = await writeSetting(TOTP_SETTING_KEY, secret);
  const ok2 = await writeSetting(TOTP_ENABLED_KEY, "0");
  return ok1 && ok2;
}

/** スマホ登録の確認が取れたら2FAを有効化（以降ログインにコード必須）。 */
export async function enableAdminTotp(): Promise<boolean> {
  return writeSetting(TOTP_ENABLED_KEY, "1");
}

/** ランダムなBase32秘密鍵を生成（認証アプリ互換）。 */
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

/** 各API用：ヘッダーのトークンを検証。OKならnull、NGなら401レスポンス。 */
export function requireAdmin(request: Request): NextResponse | null {
  if (!process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ ok: false, message: "ADMIN_PASSWORD未設定" }, { status: 500 });
  }
  const supplied =
    request.headers.get("x-admin-password") ?? request.headers.get("x-admin-token") ?? "";
  if (!verifyAdminToken(supplied)) {
    return NextResponse.json(
      { ok: false, message: "認証の有効期限が切れました。ログインし直してください。" },
      { status: 401 }
    );
  }
  return null;
}

// ───────── TOTP (RFC 6238, SHA1/30秒/6桁。Google Authenticator等と互換) ─────────

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

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

/** 6桁コードを検証（前後1ステップの誤差を許容）。 */
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

// ───────── ログイン失敗ロックアウト（インメモリ・ベストエフォート） ─────────

type Attempt = { fails: number; lockedUntil: number };
const attempts = new Map<string, Attempt>();

export function isLockedOut(key = "admin"): boolean {
  const a = attempts.get(key);
  if (!a) return false;
  if (a.lockedUntil && a.lockedUntil > Date.now()) return true;
  // ロック期間が過ぎたらリセット
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
