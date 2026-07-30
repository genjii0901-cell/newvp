import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { isLicenseSchemaError } from "@/lib/licenses";
import { getSupabaseAdmin, isSupabaseServerConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function hashCode(code: string) {
  const secret = process.env.LICENSE_CODE_SECRET;
  if (!secret) throw new Error("LICENSE_CODE_SECRET is not configured.");
  return createHash("sha256").update(`${secret}:${code}`).digest("hex");
}

function makeCode() {
  const raw = randomBytes(12).toString("hex").toUpperCase();
  return `VPP-${raw.slice(0, 6)}-${raw.slice(6, 12)}-${raw.slice(12, 18)}`;
}

function errorResponse(error: unknown) {
  const message = isLicenseSchemaError(error)
    ? "ライセンス用テーブルが未作成です。docs/note-license-schema.sql をSupabase SQL Editorで実行してください。"
    : error instanceof Error && error.message.includes("LICENSE_CODE_SECRET")
      ? "LICENSE_CODE_SECRET がVercelに設定されていません。"
      : error instanceof Error ? error.message : "ライセンスの処理に失敗しました。";
  return NextResponse.json({ ok: false, message }, { status: 500 });
}

export async function GET(request: Request) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;
  if (!isSupabaseServerConfigured()) return NextResponse.json({ ok: false, message: "Supabaseサーバー設定が未完了です。" }, { status: 503 });
  try {
    const supabase = getSupabaseAdmin();
    const [products, codes] = await Promise.all([
      supabase.from("license_products").select("slug,title,wordbook_id,entitlement_kind,description,cover_image,is_active,created_at").order("created_at", { ascending: false }),
      supabase.from("license_codes").select("id,product_slug,is_active,claimed_by,claimed_at,expires_at,created_at").order("created_at", { ascending: false }).limit(50),
    ]);
    if (products.error) throw products.error;
    if (codes.error) throw codes.error;
    return NextResponse.json({ ok: true, products: products.data ?? [], codes: codes.data ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;
  if (!isSupabaseServerConfigured()) return NextResponse.json({ ok: false, message: "Supabaseサーバー設定が未完了です。" }, { status: 503 });
  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action;
    const supabase = getSupabaseAdmin();

    if (action === "save-product") {
      const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
      const title = typeof body.title === "string" ? body.title.trim() : "";
      const kind = body.kind === "personal" ? "personal" : "wordbook";
      const wordbookId = typeof body.wordbookId === "string" ? body.wordbookId.trim() : "";
      if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(slug) || !title) {
        return NextResponse.json({ ok: false, message: "URL用IDと商品名を入力してください。URL用IDは英小文字・数字・ハイフンのみです。" }, { status: 400 });
      }
      if (kind === "wordbook" && !wordbookId) {
        return NextResponse.json({ ok: false, message: "単語帳専用ライセンスには実際の単語帳IDが必要です。" }, { status: 400 });
      }
      const { error } = await supabase.from("license_products").upsert({
        slug, title, wordbook_id: kind === "personal" ? null : wordbookId, entitlement_kind: kind,
        description: typeof body.description === "string" ? body.description.trim() : "",
        cover_image: typeof body.coverImage === "string" ? body.coverImage.trim() || null : null,
        is_active: body.isActive !== false, updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      return NextResponse.json({ ok: true, message: "ライセンス商品を保存しました。" });
    }

    if (action === "generate-code") {
      const productSlug = typeof body.productSlug === "string" ? body.productSlug.trim() : "";
      const expiresAt = typeof body.expiresAt === "string" && body.expiresAt ? body.expiresAt : null;
      const { data: product, error: productError } = await supabase.from("license_products").select("slug").eq("slug", productSlug).eq("is_active", true).maybeSingle();
      if (productError) throw productError;
      if (!product) return NextResponse.json({ ok: false, message: "有効なライセンス商品を選んでください。" }, { status: 400 });
      const code = makeCode();
      const { error } = await supabase.from("license_codes").insert({ product_slug: productSlug, code_hash: hashCode(code), expires_at: expiresAt });
      if (error) throw error;
      return NextResponse.json({ ok: true, code, message: "コードを発行しました。この画面を閉じると再表示できません。" });
    }

    if (action === "revoke-code") {
      const id = typeof body.id === "string" ? body.id : "";
      const { error } = await supabase.from("license_codes").update({ is_active: false }).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true, message: "ライセンスキーを無効化しました。" });
    }
    return NextResponse.json({ ok: false, message: "不明な操作です。" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}
