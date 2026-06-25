import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServerConfigured } from "@/lib/supabase/admin";

function checkAdminPassword(request: Request) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return NextResponse.json({ ok: false, message: "ADMIN_PASSWORD未設定" }, { status: 500 });
  const supplied = request.headers.get("x-admin-password") ?? "";
  if (supplied !== adminPassword) return NextResponse.json({ ok: false, message: "認証失敗" }, { status: 401 });
  return null;
}

export async function GET(request: Request) {
  const unauthorized = checkAdminPassword(request);
  if (unauthorized) return unauthorized;

  const result: Record<string, unknown> = {
    env: {
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      ADMIN_PASSWORD: !!process.env.ADMIN_PASSWORD,
    },
    supabaseConfigured: isSupabaseServerConfigured(),
    tables: {} as Record<string, unknown>,
    columns: {} as Record<string, unknown>,
    sampleInsert: null as unknown,
  };

  if (!isSupabaseServerConfigured()) {
    return NextResponse.json({ ok: false, ...result, message: "Supabase環境変数が未設定です" });
  }

  try {
    const supabase = getSupabaseAdmin();

    // wordbooks テーブル存在確認
    const wb = await supabase.from("wordbooks").select("id").limit(1);
    (result.tables as Record<string, unknown>).wordbooks = wb.error ? `エラー: ${wb.error.message}` : `OK（${wb.data?.length ?? 0}件）`;

    // words テーブル存在確認
    const wd = await supabase.from("words").select("id").limit(1);
    (result.tables as Record<string, unknown>).words = wd.error ? `エラー: ${wd.error.message}` : `OK（${wd.data?.length ?? 0}件）`;

    // is_official カラム存在確認
    const col = await supabase.from("wordbooks").select("is_official").limit(1);
    (result.columns as Record<string, unknown>).is_official = col.error ? `なし: ${col.error.message}` : "あり";

    // visibility カラム存在確認
    const vis = await supabase.from("wordbooks").select("visibility").limit(1);
    (result.columns as Record<string, unknown>).visibility = vis.error ? `なし: ${vis.error.message}` : "あり";

    // owner_id null INSERT テスト（すぐ削除）
    const ins = await supabase
      .from("wordbooks")
      .insert({ owner_id: null, title: "__diagnose_test__", visibility: "admin" })
      .select("id")
      .single();

    if (ins.error) {
      result.sampleInsert = `失敗: ${ins.error.message}`;
      // owner_id なしで再試行
      const ins2 = await supabase
        .from("wordbooks")
        .insert({ title: "__diagnose_test__", visibility: "admin" })
        .select("id")
        .single();
      if (ins2.error) {
        result.sampleInsert = `失敗（owner_idなしも）: ${ins2.error.message}`;
      } else {
        result.sampleInsert = "成功（owner_id不要）";
        await supabase.from("wordbooks").delete().eq("id", ins2.data.id);
      }
    } else {
      result.sampleInsert = "成功（owner_id=null OK）";
      await supabase.from("wordbooks").delete().eq("id", ins.data.id);
    }
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({ ok: true, ...result });
}
