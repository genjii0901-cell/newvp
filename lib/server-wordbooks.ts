import {
  fallbackOfficialWordbooksForApi,
  isHiddenTemplateTombstone,
  mergeWordbooksById,
  normalizeBookTitle,
} from "@/lib/official-wordbooks";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { parseEmbeddedWordbookMeta, stripEmbeddedWordbookMeta } from "@/lib/wordbook-meta";

type Visibility = "public" | "personal" | "teacher" | "private" | "admin";

type WordbookRow = {
  id: string;
  title: string;
  description: string | null;
  visibility?: string | null;
  cover_image?: string | null;
};

type WordRow = {
  wordbook_id: string;
  number?: string | number | null;
  english?: string | null;
  japanese?: string | null;
  unit?: string | null;
};

type WordStats = {
  count: number;
  firstWord: string | null;
};

export type LiveWordbook = {
  id: string;
  title: string;
  description: string;
  coverImage: string | null;
  requiredPlan: "free" | "personal" | "teacher" | "admin";
  visibility: Visibility;
  level: string;
  wordCount: number;
  unitCount: number;
  firstWord: string | null;
  words: Array<{ no: number; label?: string; english: string; japanese: string; unit: string | null }>;
};

function dedupeWordbooksByTitle(wordbooks: LiveWordbook[]) {
  const deduped = new Map<string, LiveWordbook>();

  for (const book of wordbooks) {
    const titleKey = normalizeBookTitle(book.title) || book.id;
    const existing = deduped.get(titleKey);
    if (!existing) {
      deduped.set(titleKey, book);
      continue;
    }

    const shouldReplace =
      book.wordCount > existing.wordCount ||
      (book.wordCount === existing.wordCount &&
        String(book.description ?? "").length > String(existing.description ?? "").length);

    if (shouldReplace) {
      deduped.set(titleKey, book);
    }
  }

  return Array.from(deduped.values());
}

function normalizeVisibility(value: string | null | undefined): Visibility {
  if (value === "teacher" || value === "personal" || value === "private" || value === "admin") {
    return value;
  }
  return "public";
}

function requiredPlanFromVisibility(visibility: Visibility) {
  if (visibility === "teacher") return "teacher" as const;
  if (visibility === "personal") return "personal" as const;
  if (visibility === "admin") return "admin" as const;
  return "free" as const;
}

function levelFromVisibility(visibility: Visibility) {
  if (visibility === "teacher") return "Teacher";
  if (visibility === "personal") return "Personal";
  if (visibility === "admin") return "Admin";
  return "Free";
}

function isPubliclyVisible(visibility: string | null | undefined) {
  const next = normalizeVisibility(visibility);
  return next !== "private" && next !== "admin";
}

function canFilterByDbId(value: string) {
  return /^\d+$/.test(value) || /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value);
}

export async function loadOfficialWordbooks(options?: {
  includeAdmin?: boolean;
  includeFallback?: boolean;
  dedupeByTitle?: boolean;
  includeWords?: boolean;
  filterIds?: string[];
}) {
  const includeAdmin = Boolean(options?.includeAdmin);
  const includeFallback = options?.includeFallback !== false;
  const dedupeByTitle = options?.dedupeByTitle !== false;
  const includeWords = options?.includeWords !== false;
  const filterIds = (options?.filterIds ?? []).map(String);
  const filterIdSet = filterIds.length > 0 ? new Set(filterIds) : null;
  const dbFilterIds = filterIds.filter(canFilterByDbId);
  const supabase = getSupabaseAdmin();

  const selects = [
    "id,title,description,visibility,cover_image",
    "id,title,description,visibility",
    "id,title,description",
  ];

  let rows: WordbookRow[] | null = null;
  let dbError: string | null = null;

  for (const select of selects) {
    let query = supabase.from("wordbooks").select(select).eq("is_official", true);
    if (dbFilterIds.length > 0) query = query.in("id", dbFilterIds);
    let result = await query;
    if (result.error && /is_official/i.test(result.error.message)) {
      let fallbackQuery = supabase.from("wordbooks").select(select);
      if (dbFilterIds.length > 0) fallbackQuery = fallbackQuery.in("id", dbFilterIds);
      result = await fallbackQuery;
    }
    if (!result.error) {
      rows = (result.data as unknown as WordbookRow[] | null) ?? [];
      dbError = null;
      break;
    }
    dbError = result.error.message;
  }

  if (rows === null) {
    const fallbackBooks = fallbackOfficialWordbooksForApi()
      .filter((book) => !filterIdSet || filterIdSet.has(String(book.id)))
      .map((book) => ({
        ...book,
        wordCount: book.words.length,
        unitCount: new Set(book.words.map((word) => word.unit).filter(Boolean)).size,
        firstWord: book.words[0]?.english ?? null,
        words: includeWords ? book.words : [],
        visibility: book.visibility,
      }));
    return {
      ok: false as const,
      error: dbError ?? "Failed to load wordbooks.",
      wordbooks: includeFallback
        ? mergeWordbooksById<LiveWordbook>([], fallbackBooks)
        : [],
    };
  }

  const hiddenTitleKeys = new Set(
    rows
      .filter((row) => isHiddenTemplateTombstone(row.description))
      .map((row) => normalizeBookTitle(row.title))
      .filter(Boolean)
  );

  const candidateRows = rows.filter((row) => !isHiddenTemplateTombstone(row.description));
  const visibilityFilteredRows = includeAdmin
    ? candidateRows
    : candidateRows.filter((row) => {
        const embeddedMeta = parseEmbeddedWordbookMeta(row.description);
        return isPubliclyVisible(embeddedMeta.visibility ?? row.visibility);
      });
  const visibleRows = filterIdSet
    ? visibilityFilteredRows.filter((row) => filterIdSet.has(String(row.id)))
    : visibilityFilteredRows;
  const ids = visibleRows.map((row) => row.id);

  let words: WordRow[] = [];
  const wordStatsByBookId = new Map<string, WordStats>();
  if (ids.length > 0 && !includeWords) {
    const stats = await Promise.all(
      ids.map(async (id) => {
        const [{ count }, firstResult] = await Promise.all([
          supabase
            .from("words")
            .select("wordbook_id", { count: "exact", head: true })
            .eq("wordbook_id", id),
          supabase.from("words").select("english").eq("wordbook_id", id).limit(1),
        ]);
        const firstRows = (firstResult.data as unknown as Array<{ english?: string | null }> | null) ?? [];
        return [String(id), { count: count ?? 0, firstWord: firstRows[0]?.english ?? null }] as const;
      })
    );
    for (const [id, statsForBook] of stats) {
      wordStatsByBookId.set(id, statsForBook);
    }
  }

  if (ids.length > 0 && includeWords) {
    // Supabase/PostgREST は1リクエスト最大1000行。全単語帳の合計語数が1000を超えると
    // 打ち切られ、各単語帳の語数が誤って配分される（合計が常に1000になる）。
    // range でページングして全行を取得する。
    const PAGE = 1000;
    const selectVariants = includeWords
      ? [
          "wordbook_id,number,english,japanese,unit",
          "wordbook_id,number,english,japanese",
          "wordbook_id,english,japanese",
        ]
      : ["wordbook_id,number,english,unit", "wordbook_id,number,english", "wordbook_id"];

    for (const select of selectVariants) {
      const acc: WordRow[] = [];
      let failed = false;
      for (let from = 0; ; from += PAGE) {
        const result = await supabase
          .from("words")
          .select(select)
          .in("wordbook_id", ids)
          .order("id", { ascending: true })
          .range(from, from + PAGE - 1);
        if (result.error) {
          failed = true;
          break;
        }
        const pageRows = (result.data as unknown as WordRow[] | null) ?? [];
        acc.push(...pageRows);
        if (pageRows.length < PAGE) break;
      }
      if (!failed) {
        words = acc;
        break;
      }
    }
  }

  const wordsByBookId = new Map<string, LiveWordbook["words"]>();
  for (const word of words) {
    const key = String(word.wordbook_id);
    const bucket = wordsByBookId.get(key) ?? [];
    // no は並び替え・範囲指定用の連番。表示用の番号（"1-1" や "A1" など非数字も可）は label に保持する。
    const rawLabel = word.number != null ? String(word.number).trim() : "";
    const numeric = Number(word.number);
    const no = Number.isFinite(numeric) && rawLabel !== "" ? numeric : bucket.length + 1;
    bucket.push({
      no,
      label: rawLabel || String(no),
      english: word.english ?? "",
      japanese: word.japanese ?? "",
      unit: word.unit ?? null,
    });
    wordsByBookId.set(key, bucket);
  }
  for (const bucket of wordsByBookId.values()) {
    bucket.sort((a, b) => a.no - b.no);
  }

  const liveBooks: LiveWordbook[] = visibleRows.map((row) => {
    const embeddedMeta = parseEmbeddedWordbookMeta(row.description);
    const visibility = normalizeVisibility(embeddedMeta.visibility ?? row.visibility);
    const bookWords = wordsByBookId.get(String(row.id)) ?? [];
    const wordStats = wordStatsByBookId.get(String(row.id));
    return {
      id: String(row.id),
      title: row.title,
      description: stripEmbeddedWordbookMeta(row.description ?? ""),
      coverImage: row.cover_image ?? embeddedMeta.coverImage ?? null,
      requiredPlan: requiredPlanFromVisibility(visibility),
      visibility,
      level: levelFromVisibility(visibility),
      wordCount: wordStats?.count ?? bookWords.length,
      unitCount: new Set(bookWords.map((word) => word.unit).filter(Boolean)).size,
      firstWord: wordStats?.firstWord ?? bookWords.find((word) => word.english)?.english ?? null,
      words: includeWords ? bookWords : [],
    };
  });

  const primaryBooks = dedupeByTitle ? dedupeWordbooksByTitle(liveBooks) : liveBooks;

  return {
    ok: true as const,
    error: null,
    wordbooks: includeFallback
      ? mergeWordbooksById(
          primaryBooks,
          fallbackOfficialWordbooksForApi()
            .filter(
              (book) =>
                !hiddenTitleKeys.has(normalizeBookTitle(book.title)) &&
                (!filterIdSet || filterIdSet.has(String(book.id)))
            )
            .map((book) => ({
              ...book,
              wordCount: book.words.length,
              unitCount: new Set(book.words.map((word) => word.unit).filter(Boolean)).size,
              firstWord: book.words[0]?.english ?? null,
              words: includeWords ? book.words : [],
              visibility: book.visibility,
            }))
        )
      : primaryBooks,
  };
}
