import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createApiKey, listApiKeys, revokeApiKey } from "@/lib/api-keys";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

// APIキーの発行・失効は、2段階認証済みの管理者セッションに限る（高速作成キーでは不可）。
function guard(request: Request) {
  return requireAdmin(request, { allowBatchToken: false });
}

export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  try {
    return NextResponse.json({ ok: true, keys: await listApiKeys() }, { headers: NO_STORE });
  } catch (error) {
    console.error("API key list failed", error);
    return NextResponse.json({ ok: false, message: "APIキー一覧を取得できませんでした。" }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as { name?: unknown; expiresInDays?: unknown };
  try {
    const result = await createApiKey({
      name: typeof body.name === "string" ? body.name : "",
      expiresInDays: Number(body.expiresInDays ?? 90),
    });
    return NextResponse.json({ ok: true, ...result }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "APIキーを発行できませんでした。" },
      { status: 400, headers: NO_STORE }
    );
  }
}

export async function DELETE(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  try {
    const removed = await revokeApiKey(id);
    return NextResponse.json(
      removed ? { ok: true } : { ok: false, message: "APIキーが見つかりません。" },
      { status: removed ? 200 : 404, headers: NO_STORE }
    );
  } catch (error) {
    console.error("API key revoke failed", error);
    return NextResponse.json({ ok: false, message: "APIキーを失効できませんでした。" }, { status: 500, headers: NO_STORE });
  }
}
