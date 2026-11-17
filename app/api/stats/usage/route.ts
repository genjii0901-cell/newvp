import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getSupabaseAdmin, isSupabaseServerConfigured } from "@/lib/supabase/admin";

// 直近30日に印刷した会員の人数（重複なし）。個人が分かる情報は返さず、人数だけ。10分ごとに数え直す。
const PAGE_SIZE = 1000;
const MAX_ROWS = 100_000;

const loadUsage = unstable_cache(
  async () => {
    const supabase = getSupabaseAdmin();
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const users = new Set<string>();
    for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("pdf_generations")
        .select("user_id")
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      const page = (data ?? []) as Array<{ user_id: string | null }>;
      for (const row of page) if (row.user_id) users.add(row.user_id);
      if (page.length < PAGE_SIZE) break;
    }
    return { users: users.size };
  },
  ["usage-30d-v1"],
  { revalidate: 600 }
);

export async function GET() {
  if (!isSupabaseServerConfigured()) return NextResponse.json({ ok: true, users: 0 });
  try {
    const result = await loadUsage();
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1200" } });
  } catch (error) {
    console.error("usage stats failed", error);
    return NextResponse.json({ ok: true, users: 0 });
  }
}
