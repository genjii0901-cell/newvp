import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { isLicenseSchemaError } from "@/lib/licenses";
import { getSupabaseAdmin, isSupabaseServerConfigured, requireSupabaseUser } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function hashCode(code: string) {
  const secret = process.env.LICENSE_CODE_SECRET;
  if (!secret) throw new Error("LICENSE_CODE_SECRET is not configured.");
  return createHash("sha256").update(`${secret}:${code}`).digest("hex");
}

function normalizeCode(value: unknown) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function POST(request: Request) {
  const auth = await requireSupabaseUser(request);
  if (auth.response) return auth.response;
  if (!isSupabaseServerConfigured()) return NextResponse.json({ ok: false, message: "ライセンス機能のサーバー設定が未完了です。" }, { status: 503 });

  try {
    const body = await request.json().catch(() => ({}));
    const slug = typeof body.slug === "string" ? body.slug.trim() : "";
    const code = normalizeCode(body.code);
    if (!slug || !code) return NextResponse.json({ ok: false, message: "ライセンスキーを入力してください。" }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { data: codeRow, error: codeError } = await supabase
      .from("license_codes")
      .select("id,product_slug,is_active,claimed_by,expires_at")
      .eq("code_hash", hashCode(code))
      .maybeSingle();
    if (codeError) throw codeError;
    if (!codeRow || codeRow.product_slug !== slug || !codeRow.is_active) {
      return NextResponse.json({ ok: false, message: "ライセンスキーが正しくないか、利用できない状態です。" }, { status: 400 });
    }
    if (codeRow.expires_at && new Date(codeRow.expires_at).getTime() <= Date.now()) {
      return NextResponse.json({ ok: false, message: "このライセンスキーの有効期限が切れています。" }, { status: 400 });
    }
    if (codeRow.claimed_by && codeRow.claimed_by !== auth.user.id) {
      return NextResponse.json({ ok: false, message: "このライセンスキーはすでに別のアカウントで使用されています。" }, { status: 409 });
    }

    if (!codeRow.claimed_by) {
      const { data: claimed, error: claimError } = await supabase
        .from("license_codes")
        .update({ claimed_by: auth.user.id, claimed_at: new Date().toISOString() })
        .eq("id", codeRow.id)
        .is("claimed_by", null)
        .select("id")
        .maybeSingle();
      if (claimError) throw claimError;
      if (!claimed) return NextResponse.json({ ok: false, message: "同じキーが別の登録で使用されました。もう一度ご確認ください。" }, { status: 409 });
    }

    const { data: product, error: productError } = await supabase
      .from("license_products")
      .select("slug,title,wordbook_id,entitlement_kind,description")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();
    if (productError) throw productError;
    if (!product) return NextResponse.json({ ok: false, message: "このライセンス商品は現在利用できません。" }, { status: 400 });

    const { error: entitlementError } = await supabase.from("license_entitlements").upsert(
      {
        user_id: auth.user.id,
        product_slug: product.slug,
        wordbook_id: product.wordbook_id == null ? null : String(product.wordbook_id),
        entitlement_kind: product.entitlement_kind,
        status: "active",
        expires_at: codeRow.expires_at,
        claimed_from_code_id: codeRow.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,product_slug" }
    );
    if (entitlementError) throw entitlementError;

    return NextResponse.json({ ok: true, product });
  } catch (error) {
    const message = isLicenseSchemaError(error)
      ? "ライセンス機能の初期設定がまだ完了していません。"
      : error instanceof Error && error.message.includes("LICENSE_CODE_SECRET")
        ? "ライセンス機能のサーバー設定が未完了です。"
        : error instanceof Error ? error.message : "ライセンス登録に失敗しました。";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
