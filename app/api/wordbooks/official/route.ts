import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServerConfigured } from "@/lib/supabase/admin";
import { fallbackOfficialWordbooksForApi, mergeWordbooksById } from "@/lib/official-wordbooks";

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

function requiredPlanFromVisibility(visibility: Visibility | null) {
  if (visibility === "teacher") return "teacher" as const;
  if (visibility === "personal") return "personal" as const;
  return "free" as const;
}

function levelFromVisibility(visibility: Visibility | null) {
  if (visibility === "teacher") return "Teacher";
  if (visibility === "personal") return "Personal";
  return "Free";
}

function normalizeVisibility(value: string | null | undefined): Visibility {
  if (value === "teacher" || value === "personal" || value === "private" || value === "admin") {
    return value;
  }
  return "public";
}

function isPubliclyVisible(visibility: string | null | undefined) {
  const next = normalizeVisibility(visibility);
  return next !== "private" && next !== "admin";
}

function fallbackResponse(message?: string) {
  return NextResponse.json({
    ok: true,
    wordbooks: fallbackOfficialWordbooksForApi(),
    ...(message ? { message } : {}),
  });
}

export async function GET() {
  const fallbackBooks = fallbackOfficialWordbooksForApi();

  if (!isSupabaseServerConfigured()) {
    return fallbackResponse();
  }

  try {
    const supabase = getSupabaseAdmin();
    let wordbooks: WordbookRow[] = [];

    // created_at が存在しない場合もあるのでフォールバック付き
    const fetchQueries = [
      () => supabase.from("wordbooks").select("id,title,description,visibility,cover_image").eq("is_official", true).order("created_at", { ascending: false }),
      () => supabase.from("wordbooks").select("id,title,description,visibility,cover_image").eq("is_official", true),
      () => supabase.from("wordbooks").select("id,title,description,visibility,cover_image").order("created_at", { ascending: false }),
      () => supabase.from("wordbooks").select("id,title,description,visibility,cover_image"),
      () => supabase.from("wordbooks").select("id,title,description,visibility"),
      () => supabase.from("wordbooks").select("id,title,description"),
    ];

    for (const run of fetchQueries) {
      const result = await run();
      if (!result.error) {
        const rows = ((result.data as WordbookRow[] | null) ?? []).filter((book) =>
          isPubliclyVisible(book.visibility)
        );
        if (rows.length > 0) { wordbooks = rows; break; }
      }
    }

    if (wordbooks.length === 0) {
      return fallbackResponse();
    }

    const ids = wordbooks.map((wordbook) => wordbook.id);
    let words: WordRow[] = [];

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

    const wordsByBookId = new Map<
      string,
      Array<{ no: number; english: string; japanese: string; unit: string | null }>
    >();

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

    const liveBooks = wordbooks.map((wordbook) => {
      const visibility = normalizeVisibility(wordbook.visibility);
      return {
        id: String(wordbook.id),
        title: wordbook.title,
        description: wordbook.description ?? "",
        coverImage: wordbook.cover_image ?? null,
        requiredPlan: requiredPlanFromVisibility(visibility),
        visibility: visibility === "private" || visibility === "admin" ? "public" : visibility,
        level: levelFromVisibility(visibility),
        words: wordsByBookId.get(String(wordbook.id)) ?? [],
      };
    });

    return NextResponse.json({
      ok: true,
      wordbooks: liveBooks,
    });
  } catch (error) {
    return fallbackResponse(error instanceof Error ? error.message : "Unknown error");
  }
}
