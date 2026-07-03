import { NextResponse } from "next/server";
import { fallbackOfficialWordbooksForApi } from "@/lib/official-wordbooks";
import { loadOfficialWordbooks } from "@/lib/server-wordbooks";
import { isSupabaseServerConfigured } from "@/lib/supabase/admin";

export const revalidate = 300;

function fallbackResponse(message?: string, filterIds?: string[]) {
  const filteredWordbooks = fallbackOfficialWordbooksForApi().filter(
    (book) => !filterIds || filterIds.length === 0 || filterIds.includes(String(book.id))
  );
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

  if (!isSupabaseServerConfigured()) {
    return fallbackResponse(undefined, filterIds);
  }

  try {
    const result = await loadOfficialWordbooks({
      includeWords,
      filterIds,
    });
    if (!result.ok || result.wordbooks.length === 0) {
      return fallbackResponse(result.error ?? undefined, filterIds);
    }

    return NextResponse.json({
      ok: true,
      wordbooks: result.wordbooks,
    }, { headers: { "Cache-Control": includeWords ? "public, s-maxage=120, stale-while-revalidate=3600" : "public, s-maxage=300, stale-while-revalidate=86400" } });
  } catch (error) {
    return fallbackResponse(error instanceof Error ? error.message : "Unknown error", filterIds);
  }
}
