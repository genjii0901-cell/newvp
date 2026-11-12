import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { loadOfficialWordbooks } from "@/lib/server-wordbooks";

const OFFICIAL_WORDBOOKS_CACHE_TAG = "official-wordbooks";
// 公式単語帳の説明文には表紙画像（Base64）が入っていて全冊で約7MBある。5分ごとに取り直すと
// SupabaseのEgress（無料枠 月5GB）を1日1GB以上使ってしまうため、6時間に延ばす。
// 管理画面で編集したときは revalidateOfficialWordbookCaches() で即時に作り直される。
const OFFICIAL_WORDBOOKS_REVALIDATE_SECONDS = 6 * 60 * 60;

function requireWordbooks<T extends Awaited<ReturnType<typeof loadOfficialWordbooks>>>(result: T) {
  if (!result.ok || result.wordbooks.length === 0) {
    throw new Error(result.error ?? "Failed to load official wordbooks.");
  }
  return result;
}

export const loadCachedPublicCatalog = unstable_cache(
  async () =>
    requireWordbooks(
      await loadOfficialWordbooks({
        includeWords: false,
        deferDataCoverImages: true,
      })
    ),
  ["official-wordbooks-catalog-v1"],
  { revalidate: OFFICIAL_WORDBOOKS_REVALIDATE_SECONDS, tags: [OFFICIAL_WORDBOOKS_CACHE_TAG] }
);

export const loadCachedPublicWordbookSummary = unstable_cache(
  async (id: string) =>
    requireWordbooks(
      await loadOfficialWordbooks({
        includeWords: false,
        filterIds: [id],
        deferDataCoverImages: true,
      })
    ),
  ["official-wordbook-summary-v1"],
  { revalidate: OFFICIAL_WORDBOOKS_REVALIDATE_SECONDS, tags: [OFFICIAL_WORDBOOKS_CACHE_TAG] }
);

export const loadCachedPublicWordbookWords = unstable_cache(
  async (id: string) =>
    requireWordbooks(
      await loadOfficialWordbooks({
        includeWords: true,
        filterIds: [id],
      })
    ),
  ["official-wordbook-words-v1"],
  { revalidate: OFFICIAL_WORDBOOKS_REVALIDATE_SECONDS, tags: [OFFICIAL_WORDBOOKS_CACHE_TAG] }
);

export const loadCachedCoverImage = unstable_cache(
  async (id: string) => {
    const result = await loadOfficialWordbooks({
      includeWords: false,
      includeWordStats: false,
      filterIds: [id],
      deferDataCoverImages: false,
    });
    return result.wordbooks.find((book) => String(book.id) === id)?.coverImage ?? null;
  },
  ["official-wordbook-cover-v1"],
  { revalidate: 24 * 60 * 60, tags: [OFFICIAL_WORDBOOKS_CACHE_TAG] }
);

export function revalidateOfficialWordbookCaches() {
  revalidateTag(OFFICIAL_WORDBOOKS_CACHE_TAG, { expire: 0 });
  revalidatePath("/api/wordbooks/official");
  revalidatePath("/api/wordbooks/cover");
  revalidatePath("/");
  revalidatePath("/wordbooks");
  revalidatePath("/wordbooks/[id]", "page");
  revalidatePath("/sitemap.xml");
}
