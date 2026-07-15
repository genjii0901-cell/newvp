import crypto from "node:crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const SESSION_VERSION = "v2";
const MAX_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export type AdminSessionClaims = {
  version: 2;
  subject: string;
  mfa: boolean;
  issuedAt: number;
  expiresAt: number;
  sessionId: string;
};

function safeEqualBytes(left: Buffer, right: Buffer): boolean {
  if (left.length !== right.length) return false;
  try {
    return crypto.timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

export function safeEqualText(left: string, right: string): boolean {
  const leftDigest = crypto.createHash("sha256").update(left, "utf8").digest();
  const rightDigest = crypto.createHash("sha256").update(right, "utf8").digest();
  return safeEqualBytes(leftDigest, rightDigest);
}

function base32Decode(input: string): Buffer | null {
  const clean = input.replace(/\s/g, "").toUpperCase();
  if (!clean || !/^[A-Z2-7]+=*$/.test(clean)) return null;

  const withoutPadding = clean.replace(/=+$/, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of withoutPadding) {
    const index = BASE32.indexOf(ch);
    if (index < 0) return null;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return out.length > 0 ? Buffer.from(out) : null;
}

function hotp(secret: Buffer, counter: number): string {
  if (!Number.isSafeInteger(counter) || counter < 0) return "";
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", secret).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (binary % 1_000_000).toString().padStart(6, "0");
}

export function findMatchingTotpCounter(
  code: string,
  secretBase32: string,
  options: { nowMs?: number; window?: number } = {}
): number | null {
  const cleanCode = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(cleanCode)) return null;

  const secret = base32Decode(secretBase32);
  if (!secret) return null;

  const nowMs = options.nowMs ?? Date.now();
  const window = Math.max(0, Math.min(2, Math.trunc(options.window ?? 1)));
  const currentCounter = Math.floor(nowMs / 30_000);
  const supplied = Buffer.from(cleanCode, "ascii");

  for (let offset = -window; offset <= window; offset += 1) {
    const counter = currentCounter + offset;
    if (counter < 0) continue;
    const expected = Buffer.from(hotp(secret, counter), "ascii");
    if (safeEqualBytes(supplied, expected)) return counter;
  }
  return null;
}

export function verifyTotp(
  code: string,
  secretBase32: string,
  options: { nowMs?: number; window?: number } = {}
): boolean {
  return findMatchingTotpCounter(code, secretBase32, options) !== null;
}

export function shouldRejectUnconfiguredTotpCode(
  code: string,
  twoFactorEnabled: boolean
): boolean {
  return !twoFactorEnabled && code.trim().length > 0;
}

function sessionSignature(payload: string, key: string): string {
  return crypto.createHmac("sha256", key).update(`${SESSION_VERSION}.${payload}`).digest("base64url");
}

export function issueAdminSessionToken(
  key: string,
  options: {
    subject: string;
    mfa: boolean;
    nowMs?: number;
    ttlMs?: number;
    sessionId?: string;
  }
): string {
  if (!key) throw new Error("Admin session signing key is not configured.");
  const now = Math.trunc(options.nowMs ?? Date.now());
  const ttl = Math.max(60_000, Math.min(MAX_SESSION_TTL_MS, Math.trunc(options.ttlMs ?? MAX_SESSION_TTL_MS)));
  const claims = {
    v: 2,
    sub: options.subject,
    mfa: options.mfa,
    iat: now,
    exp: now + ttl,
    jti: options.sessionId ?? crypto.randomBytes(18).toString("base64url"),
  };
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return `${SESSION_VERSION}.${payload}.${sessionSignature(payload, key)}`;
}

export function verifyAdminSessionToken(
  token: string | null | undefined,
  key: string,
  nowMs = Date.now()
): AdminSessionClaims | null {
  if (!token || !key) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== SESSION_VERSION || !parts[1] || !parts[2]) return null;

  const expected = Buffer.from(sessionSignature(parts[1], key), "ascii");
  const supplied = Buffer.from(parts[2], "ascii");
  if (!safeEqualBytes(supplied, expected)) return null;

  try {
    const raw = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
    if (
      raw.v !== 2 ||
      typeof raw.sub !== "string" ||
      raw.sub.length < 1 ||
      raw.sub.length > 200 ||
      typeof raw.mfa !== "boolean" ||
      typeof raw.iat !== "number" ||
      typeof raw.exp !== "number" ||
      typeof raw.jti !== "string" ||
      raw.jti.length < 16 ||
      raw.jti.length > 200
    ) {
      return null;
    }
    if (!Number.isSafeInteger(raw.iat) || !Number.isSafeInteger(raw.exp)) return null;
    if (raw.iat > nowMs + 60_000 || raw.exp <= nowMs) return null;
    if (raw.exp <= raw.iat || raw.exp - raw.iat > MAX_SESSION_TTL_MS) return null;

    return {
      version: 2,
      subject: raw.sub,
      mfa: raw.mfa,
      issuedAt: raw.iat,
      expiresAt: raw.exp,
      sessionId: raw.jti,
    };
  } catch {
    return null;
  }
}

export function isAdminSessionSufficient(
  claims: AdminSessionClaims | null,
  twoFactorEnabled: boolean
): boolean {
  return Boolean(claims && (!twoFactorEnabled || claims.mfa));
}

function encryptionKey(key: string): Buffer {
  if (!key) throw new Error("Admin secret encryption key is not configured.");
  return crypto.createHash("sha256").update(`vocab-print-pro/admin-totp/${key}`, "utf8").digest();
}

export function encryptAdminSecret(secret: string, key: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(key), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc.v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptAdminSecret(value: string, key: string): string | null {
  const parts = value.split(".");
  if (parts.length !== 5 || parts[0] !== "enc" || parts[1] !== "v1") return null;
  try {
    const iv = Buffer.from(parts[2], "base64url");
    const tag = Buffer.from(parts[3], "base64url");
    const ciphertext = Buffer.from(parts[4], "base64url");
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(key), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function fingerprintAdminValue(value: string, key: string): string {
  return crypto.createHmac("sha256", key).update(value, "utf8").digest("hex");
}
