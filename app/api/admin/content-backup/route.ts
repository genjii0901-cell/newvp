import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin, isSupabaseServerConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const PAGE = 1000;

async function fetchAll(table: string, order: string) {
  const supabase = getSupabaseAdmin();
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; from < 500_000; from += PAGE) {
    const { data, error } = await supabase.from(table).select("*").order(order, { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

/** 例文・問題セット・問題を、1つのJSONとして返す（自分のパソコンに保存するバックアップ用）。 */
export async function GET(request: Request) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;
  if (!isSupabaseServerConfigured()) return NextResponse.json({ ok: false, message: "Supabase が未設定です。" }, { status: 503 });
  try {
    const [wordExamples, questionSets, questionItems] = await Promise.all([
      fetchAll("word_examples", "created_at"),
      fetchAll("question_sets", "created_at"),
      fetchAll("question_items", "created_at"),
    ]);
    const body = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), wordExamples, questionSets, questionItems });
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="content-backup-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "バックアップに失敗しました。" }, { status: 500 });
  }
}
