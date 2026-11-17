import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { parseQuestions } from "@/lib/content-import";
import { getSupabaseAdmin, isSupabaseServerConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const MAX_TEXT = 3_000_000;
const CHUNK = 500;
const NO_TABLE = "問題の保存先がまだありません。docs/migrations/add-examples-and-question-sets.sql を Supabase の SQL Editor で1回実行してください。";
const KINDS = ["grammar", "qa", "other"] as const;
const subjectOf = (value: unknown) => (typeof value === "string" ? value.trim().slice(0, 40) : "");

function isMissingTable(message: string) {
  return /question_sets|question_items|does not exist|schema cache/i.test(message);
}

/** GET → 問題セットの一覧（問題数つき） */
export async function GET(request: Request) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;
  if (!isSupabaseServerConfigured()) return NextResponse.json({ ok: false, message: "Supabase が未設定です。" }, { status: 503 });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("question_sets").select("id,title,kind,subject,status,created_at").order("created_at", { ascending: false }).limit(200);
  if (error) return NextResponse.json({ ok: false, message: isMissingTable(error.message) ? NO_TABLE : error.message }, { status: 500 });
  const sets = await Promise.all(
    (data ?? []).map(async (set: { id: string }) => {
      const { count } = await supabase.from("question_items").select("id", { count: "exact", head: true }).eq("set_id", set.id);
      return { ...set, itemCount: count ?? 0 };
    })
  );
  return NextResponse.json({ ok: true, sets });
}

/**
 * POST { text, mode: "preview" | "save", title?, kind?, setId? }
 * save で setId があればその問題セットに追加、なければ title で新しいセットを作る。常に下書き。
 */
export async function POST(request: Request) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;
  if (!isSupabaseServerConfigured()) return NextResponse.json({ ok: false, message: "Supabase が未設定です。" }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { text?: unknown; mode?: unknown; title?: unknown; kind?: unknown; setId?: unknown; subject?: unknown };
  const text = typeof body.text === "string" ? body.text : "";
  if (!text.trim()) return NextResponse.json({ ok: false, message: "貼り付けた表が必要です。" }, { status: 400 });
  if (text.length > MAX_TEXT) return NextResponse.json({ ok: false, message: "表が大きすぎます。分けて取り込んでください。" }, { status: 413 });

  const parsed = parseQuestions(text);
  if (parsed.items.length === 0) return NextResponse.json({ ok: false, message: parsed.errors[0] ?? "問題が読み取れませんでした。", errors: parsed.errors }, { status: 400 });
  const summary = { ok: true, itemCount: parsed.items.length, warnings: parsed.errors, sample: parsed.items.slice(0, 5) };
  if (body.mode !== "save") return NextResponse.json(summary);

  const supabase = getSupabaseAdmin();
  let setId = typeof body.setId === "string" ? body.setId.trim() : "";
  let start = 0;
  if (setId) {
    const { count, error } = await supabase.from("question_items").select("id", { count: "exact", head: true }).eq("set_id", setId);
    if (error) return NextResponse.json({ ok: false, message: isMissingTable(error.message) ? NO_TABLE : error.message }, { status: 500 });
    start = count ?? 0;
  } else {
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
    if (!title) return NextResponse.json({ ok: false, message: "新しい問題セットの名前が必要です。" }, { status: 400 });
    const kind = KINDS.find((k) => k === body.kind) ?? "grammar";
    const { data, error } = await supabase.from("question_sets").insert({ title, kind, subject: subjectOf(body.subject), status: "draft" }).select("id").single();
    if (error || !data) return NextResponse.json({ ok: false, message: isMissingTable(error?.message ?? "") ? NO_TABLE : error?.message ?? "作成に失敗しました。" }, { status: 500 });
    setId = String(data.id);
  }
  const rows = parsed.items.map((item, index) => ({
    set_id: setId,
    sort_order: start + index + 1,
    item_kind: item.itemKind,
    prompt: item.prompt,
    answer: item.answer,
    wrong_choices: item.wrongChoices,
    choice_mode: item.choiceMode,
    pool_tag: item.poolTag,
    explanation: item.explanation,
    unit: item.unit,
  }));
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from("question_items").insert(rows.slice(i, i + CHUNK));
    if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }
  return NextResponse.json({ ...summary, saved: rows.length, setId });
}
