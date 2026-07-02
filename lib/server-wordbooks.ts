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

export type LiveWordbook = {
  id: string;
  title: string;
  description: string;
  coverImage: string | null;
  requiredPlan: "free" | "personal" | "teacher" | "admin";
  visibility: Visibility;
  level: string;
  wordCount: number;
  words: Array<{ no: number; english: string; japanese: string; unit: string | null }>;
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

export async function loadOfficialWordbooks(options?: {
  includeAdmin?: boolean;
  includeFallback?: boolean;
  dedupeByTitle?: boolean;
  includeWords?: boolean;
}) {
  const includeAdmin = Boolean(options?.includeAdmin);
  const includeFallback = options?.includeFallback !== false;
  const dedupeByTitle = options?.dedupeByTitle !== false;
  const includeWords = options?.includeWords !== false;
  const supabase = getSupabaseAdmin();

  const selects = [
    "id,title,description,visibility,cover_image",
    "id,title,description,visibility",
    "id,title,description",
  ];

  let rows: WordbookRow[] | null = null;
  let dbError: string | null = null;

  for (const select of selects) {
    let result = await supabase.from("wordbooks").select(select).eq("is_official", true);
    if (result.error && /is_official/i.test(result.error.message)) {
      result = await supabase.from("wordbooks").select(select);
    }
    if (!result.error) {
      rows = (result.data as unknown as WordbookRow[] | null) ?? [];
      dbError = null;
      break;
    }
    dbError = result.error.message;
  }

  if (rows === null) {
    return {
      ok: false as const,
      error: dbError ?? "Failed to load wordbooks.",
      wordbooks: includeFallback
        ? mergeWordbooksById<LiveWordbook>([], fallbackOfficialWordbooksForApi().map((book) => ({
            ...book,
            wordCount: book.words.length,
            visibility: book.visibility,
          })))
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
  const visibleRows = includeAdmin
    ? candidateRows
    : candidateRows.filter((row) => {
        const embeddedMeta = parseEmbeddedWordbookMeta(row.description);
        return isPubliclyVisible(embeddedMeta.visibility ?? row.visibility);
      });
  const ids = visibleRows.map((row) => row.id);

  let words: WordRow[] = [];
  let wordCountsByBookId = new Map<string, number>();
  if (ids.length > 0) {
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
      : ["wordbook_id"];

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
        if (includeWords) {
          words = acc;
        } else {
          wordCountsByBookId = acc.reduce((map, row) => {
            const key = String(row.wordbook_id);
            map.set(key, (map.get(key) ?? 0) + 1);
            return map;
          }, new Map<string, number>());
        }
        break;
      }
    }
  }

  const wordsByBookId = new Map<string, LiveWordbook["words"]>();
  for (const word of words) {
    const key = String(word.wordbook_id);
    const bucket = wordsByBookId.get(key) ?? [];
    bucket.push({
      no: Number(word.number) || bucket.length + 1,
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
    return {
      id: String(row.id),
      title: row.title,
      description: stripEmbeddedWordbookMeta(row.description ?? ""),
      coverImage: row.cover_image ?? embeddedMeta.coverImage ?? null,
      requiredPlan: requiredPlanFromVisibility(visibility),
      visibility,
      level: levelFromVisibility(visibility),
      wordCount: includeWords
        ? (wordsByBookId.get(String(row.id)) ?? []).length
        : wordCountsByBookId.get(String(row.id)) ?? 0,
      words: includeWords ? wordsByBookId.get(String(row.id)) ?? [] : [],
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
            .filter((book) => !hiddenTitleKeys.has(normalizeBookTitle(book.title)))
            .map((book) => ({
              ...book,
              wordCount: book.words.length,
              visibility: book.visibility,
            }))
        )
      : primaryBooks,
  };
}
