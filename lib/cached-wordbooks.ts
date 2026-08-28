import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { loadOfficialWordbooks } from "@/lib/server-wordbooks";

const OFFICIAL_WORDBOOKS_CACHE_TAG = "official-wordbooks";

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
  { revalidate: 86_400, tags: [OFFICIAL_WORDBOOKS_CACHE_TAG] }
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
  { revalidate: 86_400, tags: [OFFICIAL_WORDBOOKS_CACHE_TAG] }
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
  { revalidate: 86_400, tags: [OFFICIAL_WORDBOOKS_CACHE_TAG] }
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
