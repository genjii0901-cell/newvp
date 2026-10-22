import type { LiveWordbook } from "@/lib/server-wordbooks";
import { loadOfficialWordbooks } from "@/lib/server-wordbooks";

const VISIBILITY_LABELS: Record<LiveWordbook["visibility"], string> = {
  public: "公開",
  personal: "Personal限定",
  teacher: "Teacher限定",
  private: "非公開",
  admin: "管理者限定",
};

export async function loadWordbooksForExport(options: { includeWords: boolean; id?: string | null }) {
  const result = await loadOfficialWordbooks({
    includeAdmin: true,
    includeFallback: true,
    dedupeByTitle: true,
    includeWords: options.includeWords,
    includeWordStats: true,
    filterIds: options.id ? [options.id] : undefined,
    deferDataCoverImages: true,
  });
  return { ok: result.ok, error: result.error, wordbooks: result.wordbooks };
}

export function wordbookSummary(book: LiveWordbook) {
  return {
    id: book.id,
    title: book.title,
    description: book.description,
    visibility: book.visibility,
    requiredPlan: book.requiredPlan,
    wordCount: book.wordCount,
  };
}

export function wordbookListCsvRows(books: LiveWordbook[]): unknown[][] {
  return [
    ["単語帳ID", "タイトル", "公開範囲", "必要プラン", "語数", "説明"],
    ...books.map((book) => [
      book.id,
      book.title,
      VISIBILITY_LABELS[book.visibility] ?? book.visibility,
      book.requiredPlan,
      book.wordCount,
      book.description,
    ]),
  ];
}

export function wordCsvRows(books: LiveWordbook[], options?: { includeBook?: boolean }): unknown[][] {
  const includeBook = options?.includeBook ?? books.length > 1;
  const header = ["番号", "単語", "意味", "ユニット"];
  return [
    includeBook ? ["単語帳ID", "単語帳名", ...header] : header,
    ...books.flatMap((book) =>
      book.words.map((word) => {
        const row = [word.label ?? String(word.no), word.english, word.japanese, word.unit ?? ""];
        return includeBook ? [book.id, book.title, ...row] : row;
      })
    ),
  ];
}
