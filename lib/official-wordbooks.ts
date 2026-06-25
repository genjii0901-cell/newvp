import generatedWordbooks from "@/data/generated-official-wordbooks.json";

export type Plan = "free" | "personal" | "teacher";

export type OfficialWord = {
  no: number;
  english: string;
  japanese: string;
  unit: string | null;
};

export type OfficialWordbookSeed = {
  id: string;
  title: string;
  description: string;
  coverImage: string;
  requiredPlan: Plan;
  visibility: "public" | "personal" | "teacher";
  level: string;
  words: OfficialWord[];
};

export type OfficialWordbookApiShape = {
  id: string;
  title: string;
  description: string;
  coverImage: string | null;
  requiredPlan: Plan;
  visibility: "public" | "personal" | "teacher";
  level: string;
  words: OfficialWord[];
};

const starterWordbooks: OfficialWordbookSeed[] = [
  {
    id: "starter-eiken-pre1",
    title: "英検準1級 スターター",
    description: "公式単語帳が読み込めないときのための予備データです。",
    coverImage:
      "https://images.unsplash.com/photo-1513258496099-48168024aec0?auto=format&fit=crop&w=900&q=80",
    requiredPlan: "free",
    visibility: "public",
    level: "Starter",
    words: [
      { no: 1, english: "apple", japanese: "りんご", unit: "Unit 1" },
      { no: 2, english: "book", japanese: "本", unit: "Unit 1" },
      { no: 3, english: "study", japanese: "勉強する", unit: "Unit 1" },
      { no: 4, english: "important", japanese: "重要な", unit: "Unit 2" },
      { no: 5, english: "practice", japanese: "練習", unit: "Unit 2" },
    ],
  },
];

function isPlan(value: unknown): value is Plan {
  return value === "free" || value === "personal" || value === "teacher";
}

function isVisibility(
  value: unknown
): value is OfficialWordbookSeed["visibility"] {
  return value === "public" || value === "personal" || value === "teacher";
}

function normalizeWordbook(raw: unknown): OfficialWordbookSeed | null {
  if (!raw || typeof raw !== "object") return null;

  const book = raw as Partial<OfficialWordbookSeed>;
  if (
    typeof book.id !== "string" ||
    typeof book.title !== "string" ||
    !Array.isArray(book.words)
  ) {
    return null;
  }

  return {
    id: book.id,
    title: book.title,
    description:
      typeof book.description === "string"
        ? book.description
        : `${book.title} の公式単語帳です。`,
    coverImage:
      typeof book.coverImage === "string" && book.coverImage.trim().length > 0
        ? book.coverImage
        : starterWordbooks[0].coverImage,
    requiredPlan: isPlan(book.requiredPlan) ? book.requiredPlan : "free",
    visibility: isVisibility(book.visibility) ? book.visibility : "public",
    level: typeof book.level === "string" ? book.level : "Official",
    words: book.words
      .map((word, index) => {
        if (!word || typeof word !== "object") return null;
        const row = word as Partial<OfficialWord>;
        const english = typeof row.english === "string" ? row.english.trim() : "";
        const japanese =
          typeof row.japanese === "string" ? row.japanese.trim() : "";
        if (!english || !japanese) return null;
        return {
          no: typeof row.no === "number" && Number.isFinite(row.no) ? row.no : index + 1,
          english,
          japanese,
          unit: typeof row.unit === "string" && row.unit.trim().length > 0 ? row.unit : null,
        };
      })
      .filter((word): word is OfficialWord => Boolean(word)),
  };
}

const normalizedGenerated = Array.isArray(generatedWordbooks)
  ? generatedWordbooks
      .map((book) => normalizeWordbook(book))
      .filter((book): book is OfficialWordbookSeed => Boolean(book))
  : [];

export const fallbackOfficialWordbooks: OfficialWordbookSeed[] =
  normalizedGenerated.length > 0 ? normalizedGenerated : starterWordbooks;

export function fallbackOfficialWordbooksForApi(): OfficialWordbookApiShape[] {
  return fallbackOfficialWordbooks.map((book) => ({
    id: book.id,
    title: book.title,
    description: book.description,
    coverImage: book.coverImage,
    requiredPlan: book.requiredPlan,
    visibility: book.visibility,
    level: book.level,
    words: book.words,
  }));
}

function normalizeBookTitle(title: string | undefined) {
  return (title ?? "").trim().toLowerCase();
}

export function mergeWordbooksById<T extends { id: string; title?: string }>(
  primary: T[],
  fallback: T[]
) {
  const merged = new Map<string, T>();
  const fallbackIdsByTitle = new Map<string, string>();
  for (const book of fallback) merged.set(book.id, book);
  for (const book of fallback) {
    const titleKey = normalizeBookTitle(book.title);
    if (titleKey) fallbackIdsByTitle.set(titleKey, book.id);
  }
  for (const book of primary) {
    const titleKey = normalizeBookTitle(book.title);
    const fallbackId = titleKey ? fallbackIdsByTitle.get(titleKey) : undefined;
    if (fallbackId) merged.delete(fallbackId);
    merged.set(book.id, book);
  }
  return Array.from(merged.values());
}
