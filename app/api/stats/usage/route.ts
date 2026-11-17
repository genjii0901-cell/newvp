import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getSupabaseAdmin, isSupabaseServerConfigured } from "@/lib/supabase/admin";

// 直近30日の閲覧数(PV)の合計。個人情報は返さず数だけ。10分ごとに数え直す。

const loadUsage = unstable_cache(
  async () => {
    const supabase = getSupabaseAdmin();
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000 + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    // 管理画面と同じ日別カウンター（visit_total::日付）の直近30日分の合計 = 閲覧数(PV)
    const { data, error } = await supabase.from("app_settings").select("key,value").like("key", "visit_total::%").limit(2000);
    if (error) throw new Error(error.message);
    let views = 0;
    for (const row of (data ?? []) as Array<{ key: string; value: string }>) {
      const date = row.key.slice("visit_total::".length, "visit_total::".length + 10);
      if (date >= since) views += Number(row.value) || 0;
    }
    return { users: Math.round(views) };
  },
  ["usage-30d-pv-v1"],
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
