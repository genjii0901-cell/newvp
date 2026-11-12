import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getSupabaseAdmin, isSupabaseServerConfigured } from "@/lib/supabase/admin";
import { estimateWordbookPopularity, type PopularityRow } from "@/lib/wordbook-popularity";

// 単語帳ごとの使用者数（推定込み）。個人が分かる情報は返さず、単語帳IDごとの人数だけを返す。
// 10分ごとに数え直す（毎回全件を読むとSupabaseの通信量が増えるため）。

const PAGE_SIZE = 1000;
const MAX_ROWS = 100_000;

const loadPopularity = unstable_cache(
  async () => {
    const supabase = getSupabaseAdmin();
    const rows: PopularityRow[] = [];
    for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("pdf_generations")
        .select("user_id,wordbook_id")
        .order("created_at", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      const page = (data ?? []) as PopularityRow[];
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
    const entries = estimateWordbookPopularity(rows);
    const counts: Record<string, number> = {};
    for (const [id, entry] of Object.entries(entries)) counts[id] = entry.estimated;
    return { counts, updatedAt: new Date().toISOString() };
  },
  ["wordbook-popularity-v1"],
  { revalidate: 600 }
);

export async function GET() {
  if (!isSupabaseServerConfigured()) {
    return NextResponse.json({ ok: true, counts: {} });
  }
  try {
    const result = await loadPopularity();
    return NextResponse.json(
      { ok: true, ...result },
      { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1200" } }
    );
  } catch (error) {
    console.error("wordbook popularity failed", error);
    // 人数が取れなくても画面は普通に出す（並びは元の順のまま）。
    return NextResponse.json({ ok: true, counts: {} });
  }
}
