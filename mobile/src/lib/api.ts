export type Word = {
  no: number;
  label?: string;
  english: string;
  japanese: string;
  unit?: string | null;
};

export type Wordbook = {
  id: string;
  title: string;
  description: string;
  coverImage: string | null;
  requiredPlan: string;
  wordCount: number;
  words: Word[];
};

export const APP_URL = (process.env.EXPO_PUBLIC_APP_URL || "https://www.vocabprint.com").replace(/\/$/, "");

export function coverUrl(image: string | null): string | null {
  if (!image) return null;
  if (image.startsWith("/")) return `${APP_URL}${image}`;
  return /^https:\/\//.test(image) ? image : null;
}

export async function loadWordbooks(id?: string, includeWords = false): Promise<Wordbook[]> {
  const query = id ? `?id=${encodeURIComponent(id)}${includeWords ? "&includeWords=1" : ""}` : "";
  const response = await fetch(`${APP_URL}/api/wordbooks/official${query}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("単語帳を読み込めませんでした。時間をおいて再試行してください。");
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !("wordbooks" in data) || !Array.isArray(data.wordbooks)) {
    throw new Error("単語帳のデータ形式を確認できませんでした。");
  }
  return data.wordbooks as Wordbook[];
}
