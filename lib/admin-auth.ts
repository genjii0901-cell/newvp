import crypto from "crypto";
import { NextResponse } from "next/server";

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
