import { NextResponse } from "next/server";
import { isLicenseSchemaError } from "@/lib/licenses";
import { getSupabaseAdmin, isSupabaseServerConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("slug")?.trim();
  if (!slug || !/^[a-z0-9][a-z0-9-]{1,79}$/i.test(slug)) {
    return NextResponse.json({ ok: false, message: "ライセンス商品のURLが正しくありません。" }, { status: 400 });
  }
  if (!isSupabaseServerConfigured()) {
    return NextResponse.json({ ok: false, message: "ライセンス機能のサーバー設定が未完了です。" }, { status: 503 });
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .from("license_products")
      .select("slug,title,wordbook_id,entitlement_kind,description,cover_image,is_active")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ ok: false, message: "この購入者用ページは準備中です。" }, { status: 404 });
    return NextResponse.json({ ok: true, product: data });
  } catch (error) {
    const message = isLicenseSchemaError(error)
      ? "ライセンス用テーブルが未作成です。運営者はSQLセットアップを実行してください。"
      : error instanceof Error ? error.message : "商品情報を取得できませんでした。";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
