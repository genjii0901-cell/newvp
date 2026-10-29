import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { parseEmbeddedWordbookMeta, stripEmbeddedWordbookMeta } from "@/lib/wordbook-meta";
import { defaultCommunityCover, normalizeCommunitySubject } from "@/lib/community-wordbook-types";
import { communitySamples } from "@/data/community-samples";

export function defaultCreatorName(userId: string) {
  return `学習者-${createHash("sha256").update(userId).digest("hex").slice(0, 6).toUpperCase()}`;
}

type CommunityRow = {
  id: string | number;
  title: string | null;
  description: string | null;
  cover_image?: string | null;
  words?: Array<{ count?: number | string | null }> | null;
};

type WordRow = { number?: string | number | null; english?: string | null; japanese?: string | null; unit?: string | null };

function toPublicBook(row: CommunityRow, words: WordRow[] = []) {
  const meta = parseEmbeddedWordbookMeta(row.description);
  const subject = normalizeCommunitySubject(meta.subject);
  const embeddedCount = Array.isArray(row.words) ? Number(row.words[0]?.count) : NaN;
  return {
    id: String(row.id),
    title: row.title || "共有単語帳",
    description: stripEmbeddedWordbookMeta(row.description),
    coverImage: row.cover_image || meta.coverImage || defaultCommunityCover(subject),
    creator: meta.anonymous ? "匿名" : meta.creatorName || "学習者",
    subject,
    requiredPlan: "free" as const,
    wordCount: Number.isSafeInteger(embeddedCount) ? embeddedCount : words.length,
    words: words.map((word, index) => {
      const label = String(word.number ?? "").trim();
      const no = Number(label);
      return {
        no: Number.isSafeInteger(no) && no > 0 ? no : index + 1,
        label: label || String(index + 1),
        english: word.english || "",
        japanese: word.japanese || "",
        unit: word.unit || null,
      };
    }),
    community: true as const,
  };
}

export async function loadCommunityWordbooks(options: { id?: string; includeWords?: boolean; page?: number } = {}) {
  const sample = communitySamples.find((book) => book.id === options.id);
  if (sample) return [{ ...sample, words: options.includeWords ? sample.words : [] }];
  if (options.id?.startsWith("sample-")) return [];
  const supabase = getSupabaseAdmin();
  const page = Math.max(0, Math.min(100, options.page ?? 0));
  const selects = [
    "id,title,description,cover_image,words(count)",
    "id,title,description,words(count)",
  ];
  let rows: CommunityRow[] | null = null;
  let lastError: unknown;
  for (const select of selects) {
    let query = supabase.from("wordbooks")
      .select(select)
      .eq("is_official", false).eq("visibility", "public")
      .order("id", { ascending: false });
    if (options.id) query = query.eq("id", options.id).limit(1);
    else query = query.range(page * 60, page * 60 + 59);
    const result = await query;
    if (!result.error) {
      rows = (result.data ?? []) as unknown as CommunityRow[];
      break;
    }
    lastError = result.error;
  }
  if (!rows) throw lastError;
  if (!options.id || !options.includeWords || rows.length === 0) {
    const books = rows.map((row) => toPublicBook(row));
    return !options.id && page === 0 ? [...communitySamples.map((item) => ({ ...item, words: [] })), ...books] : books;
  }

  const words: WordRow[] = [];
  for (let from = 0; from < 5000; from += 1000) {
    const result = await supabase.from("words")
      .select("number,english,japanese,unit")
      .eq("wordbook_id", options.id)
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (result.error) throw result.error;
    const batch = (result.data ?? []) as WordRow[];
    words.push(...batch);
    if (batch.length < 1000) break;
  }
  return [toPublicBook(rows[0], words)];
}
