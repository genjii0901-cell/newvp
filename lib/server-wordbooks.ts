import {
  fallbackOfficialWordbooksForApi,
  mergeWordbooksById,
  normalizeBookTitle,
} from "@/lib/official-wordbooks";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

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
      book.words.length > existing.words.length ||
      (book.words.length === existing.words.length &&
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

export async function loadOfficialWordbooks(options?: { includeAdmin?: boolean }) {
  const includeAdmin = Boolean(options?.includeAdmin);
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
      wordbooks: mergeWordbooksById<LiveWordbook>([], fallbackOfficialWordbooksForApi().map((book) => ({
        ...book,
        visibility: book.visibility,
      }))),
    };
  }

  const visibleRows = includeAdmin ? rows : rows.filter((row) => isPubliclyVisible(row.visibility));
  const ids = visibleRows.map((row) => row.id);

  let words: WordRow[] = [];
  if (ids.length > 0) {
    const wordQueries = [
      () =>
        supabase
          .from("words")
          .select("wordbook_id,number,english,japanese,unit")
          .in("wordbook_id", ids)
          .order("number", { ascending: true }),
      () =>
        supabase
          .from("words")
          .select("wordbook_id,number,english,japanese")
          .in("wordbook_id", ids),
      () =>
        supabase
          .from("words")
          .select("wordbook_id,english,japanese")
          .in("wordbook_id", ids),
    ];

    for (const run of wordQueries) {
      const result = await run();
      if (!result.error) {
        words = (result.data as WordRow[] | null) ?? [];
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
    const visibility = normalizeVisibility(row.visibility);
    return {
      id: String(row.id),
      title: row.title,
      description: row.description ?? "",
      coverImage: row.cover_image ?? null,
      requiredPlan: requiredPlanFromVisibility(visibility),
      visibility,
      level: levelFromVisibility(visibility),
      words: wordsByBookId.get(String(row.id)) ?? [],
    };
  });

  const dedupedLiveBooks = dedupeWordbooksByTitle(liveBooks);

  const fallbackBooks: LiveWordbook[] = fallbackOfficialWordbooksForApi().map((book) => ({
    ...book,
    visibility: book.visibility,
  }));

  return {
    ok: true as const,
    error: null,
    wordbooks: mergeWordbooksById(dedupedLiveBooks, fallbackBooks),
  };
}
