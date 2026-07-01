import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServerConfigured } from "@/lib/supabase/admin";
import { fallbackOfficialWordbooksForApi } from "@/lib/official-wordbooks";

// 管理者の編集を即座に反映（GETルートのキャッシュを無効化）。
export const dynamic = "force-dynamic";
export const revalidate = 0;

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
  if (!isSupabaseServerConfigured()) {
    return fallbackResponse();
  }

  try {
    const supabase = getSupabaseAdmin();

    // 存在しない列に備えて段階的に列を減らす。is_officialの有無は毎回同じ判断にして
    // 取得セットがぶれないようにする（一時エラーで全件↔絞り込みが入れ替わらない）。
    const selects = [
      "id,title,description,visibility,cover_image",
      "id,title,description,visibility",
      "id,title,description",
    ];

    let rows: WordbookRow[] | null = null;
    for (const sel of selects) {
      let res = await supabase.from("wordbooks").select(sel).eq("is_official", true);
      // is_official 列が無い場合だけ、絞り込みなしで取得（schema依存・毎回同じ挙動）
      if (res.error && /is_official/i.test(res.error.message)) {
        res = await supabase.from("wordbooks").select(sel);
      }
      if (!res.error) {
        rows = (res.data as unknown as WordbookRow[] | null) ?? [];
        break;
      }
    }

    // 取得自体が失敗（接続不可など）→ JSONフォールバック（保険）
    if (rows === null) {
      return fallbackResponse();
    }

    const wordbooks: WordbookRow[] = rows.filter((book) => isPubliclyVisible(book.visibility));

    // Supabaseに公開中の公式単語帳が1件も無いときだけJSONフォールバック
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
    // 単語番号(no)で数値順に並べ替え（DBのnumber列はテキストで辞書順になるため）
    for (const bucket of wordsByBookId.values()) bucket.sort((a, b) => a.no - b.no);

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

    // 公開ライブラリは管理者画面(Supabase)を単一の真実とする。
    // 管理者で削除すれば公開側からも消える。JSONは空/未設定のときだけの保険。
    return NextResponse.json({
      ok: true,
      wordbooks: liveBooks,
    });
  } catch (error) {
    return fallbackResponse(error instanceof Error ? error.message : "Unknown error");
  }
}
