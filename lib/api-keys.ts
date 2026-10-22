import crypto from "node:crypto";
import { NextResponse } from "next/server";
import {
  checkAdminRateLimit,
  fingerprintWithAdminKey,
  readProtectedSetting,
  recordAdminAuthFailure,
  writeProtectedSetting,
} from "@/lib/admin-auth";
import { safeEqualText } from "@/lib/admin-auth-core";

// AI・外部ツール連携用の読み取り専用APIキー。
// - キー本体は発行時に1度だけ表示し、DBにはサーバー鍵によるHMACだけを保存する。
// - 公開範囲は単語帳データの読み取りのみ（会員情報・メールアドレスは対象外）。
// - 有効期限は必須（最長365日）。管理画面からいつでも失効できる。

const SETTING_KEY = "ai_api_keys";
const MAX_KEYS = 20;
const MAX_EXPIRES_DAYS = 365;
const REQUESTS_PER_MINUTE = 60;
const LAST_USED_WRITE_INTERVAL_MS = 10 * 60 * 1000;

export const API_KEY_SCOPES = ["wordbooks:read"] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

type StoredApiKey = {
  id: string;
  name: string;
  hash: string;
  scopes: ApiKeyScope[];
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type ApiKeySummary = Omit<StoredApiKey, "hash"> & { preview: string };

async function readKeys(): Promise<StoredApiKey[]> {
  const raw = await readProtectedSetting(SETTING_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as StoredApiKey[]) : [];
  } catch {
    return [];
  }
}

function writeKeys(keys: StoredApiKey[]) {
  return writeProtectedSetting(SETTING_KEY, JSON.stringify(keys));
}

function summarize(key: StoredApiKey): ApiKeySummary {
  const { hash: _hash, ...rest } = key;
  return { ...rest, preview: `vpp_${key.id}_…` };
}

export async function listApiKeys(): Promise<ApiKeySummary[]> {
  return (await readKeys()).map(summarize);
}

export async function createApiKey(input: { name: string; expiresInDays: number }) {
  const name = input.name.trim().slice(0, 60);
  if (!name) throw new Error("キーの名前を入力してください。");
  const days = Math.floor(input.expiresInDays);
  if (!Number.isFinite(days) || days < 1 || days > MAX_EXPIRES_DAYS) {
    throw new Error(`有効期限は1〜${MAX_EXPIRES_DAYS}日で指定してください。`);
  }

  const keys = await readKeys();
  // 期限切れ・失効済みのキーは件数上限の判定から外し、一定期間後に掃除する。
  const now = Date.now();
  const kept = keys.filter(
    (key) => !key.revokedAt && new Date(key.expiresAt).getTime() > now - 30 * 24 * 60 * 60 * 1000
  );
  if (kept.filter((key) => new Date(key.expiresAt).getTime() > now).length >= MAX_KEYS) {
    throw new Error(`有効なキーは最大${MAX_KEYS}個です。不要なキーを失効してください。`);
  }

  const id = crypto.randomBytes(6).toString("hex");
  const token = `vpp_${id}_${crypto.randomBytes(32).toString("base64url")}`;
  const record: StoredApiKey = {
    id,
    name,
    hash: fingerprintWithAdminKey(token),
    scopes: ["wordbooks:read"],
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + days * 24 * 60 * 60 * 1000).toISOString(),
    lastUsedAt: null,
    revokedAt: null,
  };
  await writeKeys([...kept, record]);
  return { token, key: summarize(record) };
}

export async function revokeApiKey(id: string): Promise<boolean> {
  const keys = await readKeys();
  const target = keys.find((key) => key.id === id);
  if (!target) return false;
  // 失効したキーは記録から消し、ハッシュも残さない。
  await writeKeys(keys.filter((key) => key.id !== id));
  return true;
}

const requestCounts = new Map<string, { windowStart: number; count: number }>();

function overRequestLimit(keyId: string): boolean {
  const now = Date.now();
  const state = requestCounts.get(keyId);
  if (!state || now - state.windowStart >= 60_000) {
    requestCounts.set(keyId, { windowStart: now, count: 1 });
    return false;
  }
  state.count += 1;
  return state.count > REQUESTS_PER_MINUTE;
}

function deny(status: number, message: string, extraHeaders?: Record<string, string>) {
  return NextResponse.json(
    { ok: false, message },
    { status, headers: { "Cache-Control": "no-store", ...extraHeaders } }
  );
}

function suppliedToken(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.startsWith("Bearer ")) return authorization.slice("Bearer ".length).trim();
  return request.headers.get("x-api-key")?.trim() ?? "";
}

/** APIキーを検証する。成功時は null、失敗時はそのまま返せるレスポンスを返す。 */
export async function requireApiKey(request: Request, scope: ApiKeyScope): Promise<NextResponse | null> {
  try {
    const rate = await checkAdminRateLimit(request, "api-key");
    if (rate.locked) {
      return deny(429, "認証の失敗が続いたため一時的にロックしています。", {
        "Retry-After": String(rate.remainingSeconds),
      });
    }

    const token = suppliedToken(request);
    const match = /^vpp_([0-9a-f]{12})_[A-Za-z0-9_-]{43}$/.exec(token);
    const keys = match ? await readKeys() : [];
    const key = match ? keys.find((item) => item.id === match[1]) : undefined;
    const valid =
      key !== undefined &&
      !key.revokedAt &&
      new Date(key.expiresAt).getTime() > Date.now() &&
      safeEqualText(fingerprintWithAdminKey(token), key.hash);

    if (!valid || !key) {
      await recordAdminAuthFailure(request, "api-key");
      return deny(401, "APIキーが無効か、有効期限が切れています。");
    }
    if (!key.scopes.includes(scope)) return deny(403, "このAPIキーには権限がありません。");
    if (overRequestLimit(key.id)) {
      return deny(429, `リクエストが多すぎます（1分あたり${REQUESTS_PER_MINUTE}回まで）。`, { "Retry-After": "60" });
    }

    const lastUsed = key.lastUsedAt ? new Date(key.lastUsedAt).getTime() : 0;
    if (Date.now() - lastUsed > LAST_USED_WRITE_INTERVAL_MS) {
      key.lastUsedAt = new Date().toISOString();
      await writeKeys(keys).catch((error) => console.error("API key lastUsedAt update failed", error));
    }
    return null;
  } catch (error) {
    console.error("API key verification failed closed", error);
    return deny(503, "認証設定を確認できないため、安全のためアクセスを拒否しました。");
  }
}
