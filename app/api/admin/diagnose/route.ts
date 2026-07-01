import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServerConfigured } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET(request: Request) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;

  const result: Record<string, unknown> = {
    env: {
      NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      ADMIN_PASSWORD: Boolean(process.env.ADMIN_PASSWORD),
    },
    supabaseConfigured: isSupabaseServerConfigured(),
    tables: {} as Record<string, unknown>,
    columns: {} as Record<string, unknown>,
    sampleInsert: null as unknown,
    duplicateTitles: [] as unknown[],
  };

  if (!isSupabaseServerConfigured()) {
    return NextResponse.json({
      ok: false,
      ...result,
      message: "Supabase server environment variables are not configured.",
    });
  }

  try {
    const supabase = getSupabaseAdmin();

    const wb = await supabase.from("wordbooks").select("id").limit(1);
    (result.tables as Record<string, unknown>).wordbooks = wb.error
      ? `Error: ${wb.error.message}`
      : `OK (${wb.data?.length ?? 0} rows sampled)`;

    const wd = await supabase.from("words").select("id").limit(1);
    (result.tables as Record<string, unknown>).words = wd.error
      ? `Error: ${wd.error.message}`
      : `OK (${wd.data?.length ?? 0} rows sampled)`;

    const col = await supabase.from("wordbooks").select("is_official").limit(1);
    (result.columns as Record<string, unknown>).is_official = col.error
      ? `Missing: ${col.error.message}`
      : "Present";

    const vis = await supabase.from("wordbooks").select("visibility").limit(1);
    (result.columns as Record<string, unknown>).visibility = vis.error
      ? `Missing: ${vis.error.message}`
      : "Present";

    const booksResult = await supabase.from("wordbooks").select("id,title").limit(500);
    const wordsResult = await supabase.from("words").select("wordbook_id").limit(5000);

    if (!booksResult.error && booksResult.data) {
      const countById = new Map<string, number>();
      for (const row of wordsResult.data ?? []) {
        const key = String((row as { wordbook_id?: unknown }).wordbook_id ?? "");
        if (!key) continue;
        countById.set(key, (countById.get(key) ?? 0) + 1);
      }

      const grouped = new Map<string, Array<{ id: string; count: number }>>();
      for (const row of booksResult.data as Array<{ id: string; title: string | null }>) {
        const title = String(row.title ?? "").trim();
        if (!title) continue;
        const bucket = grouped.get(title) ?? [];
        bucket.push({ id: String(row.id), count: countById.get(String(row.id)) ?? 0 });
        grouped.set(title, bucket);
      }

      result.duplicateTitles = Array.from(grouped.entries())
        .filter(([, items]) => items.length > 1)
        .map(([title, items]) => ({ title, items }));
    }

    const ins = await supabase
      .from("wordbooks")
      .insert({ owner_id: null, title: "__diagnose_test__", visibility: "admin" })
      .select("id")
      .single();

    if (ins.error) {
      result.sampleInsert = `Insert failed: ${ins.error.message}`;
      const ins2 = await supabase
        .from("wordbooks")
        .insert({ title: "__diagnose_test__", visibility: "admin" })
        .select("id")
        .single();
      if (ins2.error) {
        result.sampleInsert = `Insert failed without owner_id too: ${ins2.error.message}`;
      } else {
        result.sampleInsert = "Insert works without owner_id.";
        await supabase.from("wordbooks").delete().eq("id", ins2.data.id);
      }
    } else {
      result.sampleInsert = "Insert works with owner_id=null.";
      await supabase.from("wordbooks").delete().eq("id", ins.data.id);
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }

  return NextResponse.json({ ok: true, ...result });
}
