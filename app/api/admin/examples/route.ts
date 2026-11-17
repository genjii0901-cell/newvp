import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { parseExamples } from "@/lib/content-import";
import { getSupabaseAdmin, isSupabaseServerConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const MAX_TEXT = 3_000_000;
const CHUNK = 500;
const NO_TABLE = "例文の保存先がまだありません。docs/migrations/add-examples-and-question-sets.sql を Supabase の SQL Editor で1回実行してください。";

function isMissingTable(message: string) {
  return /word_examples|does not exist|schema cache/i.test(message);
}

/** GET ?wordbookId=… → その単語帳に保存済みの例文の数 */
export async function GET(request: Request) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;
  if (!isSupabaseServerConfigured()) return NextResponse.json({ ok: false, message: "Supabase が未設定です。" }, { status: 503 });
  const wordbookId = new URL(request.url).searchParams.get("wordbookId") ?? "";
  if (!wordbookId) return NextResponse.json({ ok: false, message: "wordbookId が必要です。" }, { status: 400 });
  const { count, error } = await getSupabaseAdmin().from("word_examples").select("id", { count: "exact", head: true }).eq("wordbook_id", wordbookId);
  if (error) return NextResponse.json({ ok: false, message: isMissingTable(error.message) ? NO_TABLE : error.message }, { status: 500 });
  return NextResponse.json({ ok: true, count: count ?? 0 });
}

/**
 * POST { wordbookId, text, mode: "preview" | "save", replace?: boolean }
 * preview=保存せず、読み取り結果と単語帳とのずれを返す。save=下書きとして保存。replace=その単語帳の取り込み済み例文を先に消す。
 */
export async function POST(request: Request) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;
  if (!isSupabaseServerConfigured()) return NextResponse.json({ ok: false, message: "Supabase が未設定です。" }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { wordbookId?: unknown; text?: unknown; mode?: unknown; replace?: unknown };
  const wordbookId = typeof body.wordbookId === "string" ? body.wordbookId.trim() : "";
  const text = typeof body.text === "string" ? body.text : "";
  if (!wordbookId || !text.trim()) return NextResponse.json({ ok: false, message: "単語帳と貼り付けた表が必要です。" }, { status: 400 });
  if (text.length > MAX_TEXT) return NextResponse.json({ ok: false, message: "表が大きすぎます。分けて取り込んでください。" }, { status: 413 });

  const parsed = parseExamples(text);
  if (parsed.examples.length === 0) return NextResponse.json({ ok: false, message: parsed.errors[0] ?? "例文が読み取れませんでした。", errors: parsed.errors }, { status: 400 });

  const supabase = getSupabaseAdmin();
  // 単語帳の番号・英語と照らし合わせて、合わない行を知らせる
  const { data: wordRows, error: wordsError } = await supabase.from("words").select("number,english").eq("wordbook_id", wordbookId).limit(20000);
  if (wordsError) return NextResponse.json({ ok: false, message: wordsError.message }, { status: 500 });
  const numbers = new Set((wordRows ?? []).map((w: { number: string | null }) => String(w.number ?? "")));
  const englishSet = new Set((wordRows ?? []).map((w: { english: string | null }) => String(w.english ?? "").trim().toLowerCase()));
  const unmatched = [...new Set(
    parsed.examples
      .filter((e) => (e.number ? !numbers.has(e.number) : !englishSet.has(e.english.toLowerCase())))
      .map((e) => e.number || e.english)
  )];
  const summary = {
    ok: true,
    exampleCount: parsed.examples.length,
    wordCount: parsed.wordCount,
    warnings: parsed.errors,
    unmatched: unmatched.slice(0, 30),
    unmatchedCount: unmatched.length,
    sample: parsed.examples.slice(0, 8),
  };
  if (body.mode !== "save") return NextResponse.json(summary);

  if (body.replace === true) {
    const { error } = await supabase.from("word_examples").delete().eq("wordbook_id", wordbookId).eq("source", "import");
    if (error) return NextResponse.json({ ok: false, message: isMissingTable(error.message) ? NO_TABLE : error.message }, { status: 500 });
  }
  const order = new Map<string, number>();
  const rows = parsed.examples.map((e) => {
    const key = `${e.number}\u0000${e.english}`;
    const sortOrder = (order.get(key) ?? 0) + 1;
    order.set(key, sortOrder);
    return {
      wordbook_id: wordbookId,
      word_number: e.number,
      word_english: e.english,
      sort_order: sortOrder,
      sentence_en: e.sentenceEn,
      sentence_ja: e.sentenceJa,
      source: "import",
      status: "draft",
    };
  });
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from("word_examples")
      .upsert(rows.slice(i, i + CHUNK), { onConflict: "wordbook_id,word_number,word_english,sentence_en" });
    if (error) return NextResponse.json({ ok: false, message: isMissingTable(error.message) ? NO_TABLE : error.message }, { status: 500 });
  }
  return NextResponse.json({ ...summary, saved: rows.length });
}
