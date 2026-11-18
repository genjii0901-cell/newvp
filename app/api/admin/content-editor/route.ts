import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { SEARCH_FIELDS, validateContent, type ContentKind } from "@/lib/content-editor";
import { getSupabaseAdmin, isSupabaseServerConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 20;
const columns = {
  example: "id,sort_order,word_number,word_english,sentence_en,sentence_ja,status",
  question: "id,sort_order,item_kind,prompt,answer,wrong_choices,choice_mode,pool_tag,explanation,unit",
};
const config = (kind: ContentKind) => kind === "example"
  ? { table: "word_examples", parent: "wordbook_id" }
  : { table: "question_items", parent: "set_id" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const failure = (message: string, status = 400) => json({ ok: false, message }, status);
function dbFailure(error: { message: string; code?: string }) {
  if (error.code === "23505") return failure("同じ単語に同じ例文が保存されています。既存の例文を編集してください。", 409);
  if (error.code === "42P01" || error.code === "PGRST205") return failure("保存先がまだありません。先に例文・問題の取り込み画面で保存先を確認してください。", 503);
  return failure("保存内容の読み書きに失敗しました。時間をおいて再試行してください。", 500);
}
function scope(input: Record<string, unknown>) {
  const kind: ContentKind | null = input.kind === "example" || input.kind === "question" ? input.kind : null;
  const parentId = typeof input.parentId === "string" ? input.parentId.trim() : "";
  const id = typeof input.id === "string" ? input.id.trim() : "";
  return { kind, parentId, id };
}
async function authorize(request: Request) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;
  if (!isSupabaseServerConfigured()) return failure("Supabase が未設定です。", 503);
  return null;
}

export async function GET(request: Request) {
  const unauthorized = await authorize(request);
  if (unauthorized) return unauthorized;
  const params = new URL(request.url).searchParams;
  const { kind, parentId } = scope(Object.fromEntries(params));
  if (!kind || !parentId || parentId.length > 200) return failure("対象の単語帳または問題セットを選んでください。");
  const page = Math.max(1, Math.min(100000, Math.floor(Number(params.get("page")) || 1)));
  const query = (params.get("query") ?? "").trim().slice(0, 200);
  const fields = SEARCH_FIELDS[kind];
  const field = params.get("field") ?? Object.keys(fields)[0];
  if (!Object.hasOwn(fields, field)) return failure("検索対象が正しくありません。");
  const { table, parent } = config(kind);
  let requestQuery = getSupabaseAdmin().from(table).select(columns[kind], { count: "exact" }).eq(parent, parentId);
  // ilike単独を使い、生のPostgRESTフィルタに入力を連結しない。
  if (query) requestQuery = requestQuery.ilike(field, `%${query.replace(/[\\%_]/g, "\\$&")}%`);
  requestQuery = kind === "example"
    ? requestQuery.order("word_number").order("sort_order").order("id")
    : requestQuery.order("sort_order").order("id");
  const { data, error, count } = await requestQuery.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (error) return dbFailure(error);
  return json({ ok: true, items: data ?? [], count: count ?? 0, page, pageSize: PAGE_SIZE });
}

async function mutate(request: Request, method: "POST" | "PATCH" | "DELETE") {
  const unauthorized = await authorize(request);
  if (unauthorized) return unauthorized;
  const raw = await request.text();
  if (raw.length > 100000) return failure("入力が大きすぎます。", 413);
  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return failure("入力を読み取れませんでした。");
    body = parsed;
  } catch { return failure("入力を読み取れませんでした。"); }
  const { kind, parentId, id } = scope(body);
  if (!kind || !parentId || parentId.length > 200) return failure("対象の単語帳または問題セットを選んでください。");
  if (method !== "POST" && !/^[0-9a-f-]{36}$/i.test(id)) return failure("編集対象を選んでください。");
  const { table, parent } = config(kind);
  const db = getSupabaseAdmin();
  if (method === "DELETE") {
    const { data, error } = await db.from(table).delete().eq(parent, parentId).eq("id", id).select("id").maybeSingle();
    if (error) return dbFailure(error);
    if (!data) return failure("対象が見つかりません。別の画面で削除された可能性があります。", 404);
    return json({ ok: true });
  }
  const validated = validateContent(kind, body.item);
  if (validated.errors.length) return json({ ok: false, message: validated.errors.join("\n") }, 400);
  const row: Record<string, unknown> = { ...validated.row };
  // 例文が別の単語に結びつかないよう、番号と英語を同じwords行で照合する。
  if (kind === "example") {
    let wordQuery = db.from("words").select("number,english").eq("wordbook_id", parentId);
    wordQuery = row.word_number ? wordQuery.eq("number", row.word_number) : wordQuery.eq("english", row.word_english);
    const { data: words, error } = await wordQuery.limit(100);
    if (error) return dbFailure(error);
    const word = (words ?? []).find((w: { english: string }) => !row.word_english || String(w.english).trim().toLowerCase() === String(row.word_english).toLowerCase());
    if (!word) return failure("単語帳に一致する単語がありません。番号と単語を確認してください。");
    row.word_number = String(word.number ?? "");
    row.word_english = String(word.english ?? "");
  }
  if (method === "POST") {
    if (kind === "question") {
      const { data: set, error } = await db.from("question_sets").select("id").eq("id", parentId).maybeSingle();
      if (error) return dbFailure(error);
      if (!set) return failure("問題セットが見つかりません。", 404);
    }
    const { data: last, error: orderError } = await db.from(table).select("sort_order").eq(parent, parentId).order("sort_order", { ascending: false }).limit(1);
    if (orderError) return dbFailure(orderError);
    row[parent] = parentId;
    row.sort_order = (last?.[0]?.sort_order ?? 0) + 1;
    if (kind === "example") { row.source = "manual"; row.status = "draft"; }
    const { data, error } = await db.from(table).insert(row).select(columns[kind]).single();
    if (error) return dbFailure(error);
    return json({ ok: true, item: data });
  }
  const { data, error } = await db.from(table).update(row).eq(parent, parentId).eq("id", id).select(columns[kind]).maybeSingle();
  if (error) return dbFailure(error);
  if (!data) return failure("対象が見つかりません。別の画面で削除された可能性があります。", 404);
  return json({ ok: true, item: data });
}
export async function POST(request: Request) { return mutate(request, "POST"); }
export async function PATCH(request: Request) { return mutate(request, "PATCH"); }
export async function DELETE(request: Request) { return mutate(request, "DELETE"); }
