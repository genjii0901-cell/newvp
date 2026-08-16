import { NextResponse } from "next/server";
import { fallbackOfficialWordbooksForApi } from "@/lib/official-wordbooks";
import { loadOfficialWordbooks } from "@/lib/server-wordbooks";
import { isSupabaseServerConfigured } from "@/lib/supabase/admin";

export const revalidate = 300;

function fallbackResponse(message?: string, filterIds?: string[], includeWords = false, deferDataCoverImages = false) {
  const filteredWordbooks = fallbackOfficialWordbooksForApi()
    .filter((book) => !filterIds || filterIds.length === 0 || filterIds.includes(String(book.id)))
    .map((book) => ({
      ...book,
      coverImage:
        deferDataCoverImages && /^data:image\//i.test(book.coverImage)
          ? `/api/wordbooks/cover?id=${encodeURIComponent(String(book.id))}`
          : book.coverImage,
      wordCount: book.words.length,
      unitCount: new Set(book.words.map((word) => word.unit).filter(Boolean)).size,
      firstWord: book.words[0]?.english ?? null,
      words: includeWords ? book.words : [],
    }));
  return NextResponse.json({
    ok: true,
    wordbooks: filteredWordbooks,
    ...(message ? { message } : {}),
  }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400" } });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const includeWords = searchParams.get("includeWords") === "1";
  const id = searchParams.get("id");
  const filterIds = id ? [id] : undefined;
  const deferDataCoverImages = !id && !includeWords;

  if (!isSupabaseServerConfigured()) {
    return fallbackResponse(undefined, filterIds, includeWords, deferDataCoverImages);
  }

  try {
    const result = await loadOfficialWordbooks({
      includeWords,
      filterIds,
      deferDataCoverImages,
    });
    if (!result.ok || result.wordbooks.length === 0) {
      return fallbackResponse(result.error ?? undefined, filterIds, includeWords, deferDataCoverImages);
    }

    return NextResponse.json({
      ok: true,
      wordbooks: result.wordbooks,
    }, { headers: { "Cache-Control": includeWords ? "public, s-maxage=120, stale-while-revalidate=3600" : "public, s-maxage=300, stale-while-revalidate=86400" } });
  } catch (error) {
    return fallbackResponse(error instanceof Error ? error.message : "Unknown error", filterIds, includeWords, deferDataCoverImages);
  }
}
