import { NextResponse } from "next/server";
import {
  getSupabaseAdmin,
  isSupabaseServerConfigured,
  supabaseServerConfigResponse,
} from "@/lib/supabase/admin";
import { fallbackOfficialWordbooksForApi } from "@/lib/official-wordbooks";

type IncomingWord = {
  number?: string | number;
  no?: string | number;
  english?: string;
  japanese?: string;
  unit?: string;
  page?: string;
  memo?: string;
};

type Visibility = "public" | "personal" | "teacher" | "admin";

type DbError = { message?: string } | null | undefined;

function checkAdminPassword(request: Request) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return NextResponse.json(
      { ok: false, message: "ADMIN_PASSWORD is not configured." },
      { status: 500 }
    );
  }

  const supplied = request.headers.get("x-admin-password") ?? "";
  if (supplied !== adminPassword) {
    return NextResponse.json(
      { ok: false, message: "管理者パスワードが違います。" },
      { status: 401 }
    );
  }

  return null;
}

function cleanWordList(words: IncomingWord[]) {
  return words
    .map((word, index) => ({
      number: String(word.number ?? word.no ?? index + 1),
      english: String(word.english ?? "").trim(),
      japanese: String(word.japanese ?? "").trim(),
      unit: String(word.unit ?? "").trim() || null,
      page: String(word.page ?? "").trim() || null,
      memo: String(word.memo ?? "").trim() || null,
    }))
    .filter((word) => word.english && word.japanese);
}

function isMissingColumnError(error: DbError, column: string) {
  const message = error?.message ?? "";
  return (
    message.includes(column) ||
    message.includes("does not exist") ||
    message.includes("schema cache")
  );
}

function normalizeVisibility(value: unknown): Visibility {
  if (value === "personal" || value === "teacher" || value === "admin") {
    return value;
  }
  return "public";
}

function isPersistedDbId(value: string) {
  return /^\d+$/.test(value) || /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value);
}

async function insertWordbook(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  input: {
    title: string;
    description: string;
    coverImage: string | null;
    visibility: Visibility;
  }
) {
  const { title, description, coverImage, visibility } = input;

  // 存在するカラムに応じて段階的にフォールバック
  const attempts: Record<string, unknown>[] = [
    { owner_id: null, title, description: description || null, cover_image: coverImage || null, is_official: true, visibility },
    { owner_id: null, title, description: description || null, is_official: true, visibility },
    { owner_id: null, title, description: description || null, cover_image: coverImage || null, visibility },
    { owner_id: null, title, description: description || null, visibility },
    { title, description: description || null, cover_image: coverImage || null, visibility },
    { title, description: description || null, visibility },
    // visibility カラムがない場合のフォールバック
    { owner_id: null, title, description: description || null, cover_image: coverImage || null, is_official: true },
    { owner_id: null, title, description: description || null, is_official: true },
    { owner_id: null, title, description: description || null, cover_image: coverImage || null },
    { owner_id: null, title, description: description || null },
    { title, description: description || null, cover_image: coverImage || null },
    { title, description: description || null },
  ];

  let lastError: DbError = null;
  for (const payload of attempts) {
    const result = await supabase
      .from("wordbooks")
      .insert(payload)
      .select("id,title")
      .single();

    if (!result.error) return result;

    lastError = result.error;
    const expectedSchemaMismatch =
      isMissingColumnError(result.error, "cover_image") ||
      isMissingColumnError(result.error, "is_official") ||
      isMissingColumnError(result.error, "owner_id") ||
      isMissingColumnError(result.error, "visibility") ||
      result.error.message.includes("null value") ||
      result.error.message.includes("violates not-null") ||
      result.error.message.includes("does not exist");

    if (!expectedSchemaMismatch) return result;
  }

  return {
    data: null,
    error: lastError ?? { message: "Failed to insert wordbook." },
  };
}

export async function POST(request: Request) {
  const unauthorized = checkAdminPassword(request);
  if (unauthorized) return unauthorized;
  if (!isSupabaseServerConfigured()) return supabaseServerConfigResponse();

  try {
    const body = await request.json().catch(() => ({}));
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    const coverImage =
      typeof body.cover_image === "string" ? body.cover_image.trim() : null;
    const visibility = normalizeVisibility(body.visibility);
    const words = Array.isArray(body.words) ? (body.words as IncomingWord[]) : [];
    const clean = cleanWordList(words);

    if (!title) {
      return NextResponse.json(
        { ok: false, message: "タイトルを入力してください。" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const result = await insertWordbook(supabase, {
      title,
      description,
      coverImage,
      visibility,
    });

    if (result.error || !result.data) {
      return NextResponse.json(
        { ok: false, message: `DB保存エラー: ${result.error?.message ?? "Unknown error"}` },
        { status: 500 }
      );
    }

    if (clean.length > 0) {
      const { error: wordsError } = await supabase.from("words").insert(
        clean.map((word) => ({ wordbook_id: result.data.id, ...word }))
      );
      if (wordsError) {
        return NextResponse.json(
          { ok: false, message: wordsError.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      wordbook: result.data,
      wordCount: clean.length,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const unauthorized = checkAdminPassword(request);
  if (unauthorized) return unauthorized;
  if (!isSupabaseServerConfigured()) return supabaseServerConfigResponse();

  try {
    const body = await request.json().catch(() => ({}));
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) {
      return NextResponse.json(
        { ok: false, message: "IDが必要です。" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    if (!isPersistedDbId(id)) {
      const seededBook = fallbackOfficialWordbooksForApi().find((book) => book.id === id);
      const fallbackWords = seededBook?.words.map((word) => ({
        number: String(word.no),
        english: word.english,
        japanese: word.japanese,
        unit: word.unit ?? "",
      }));
      const incomingWords = Array.isArray(body.words) ? (body.words as IncomingWord[]) : [];
      const materializedWords = cleanWordList(
        incomingWords.length > 0 ? incomingWords : fallbackWords ?? []
      );
      const materializedTitle =
        typeof body.title === "string" && body.title.trim().length > 0
          ? body.title.trim()
          : seededBook?.title ?? "";
      const materializedDescription =
        typeof body.description === "string"
          ? body.description.trim()
          : seededBook?.description ?? "";
      const materializedCover =
        typeof body.cover_image === "string"
          ? body.cover_image.trim()
          : seededBook?.coverImage ?? null;
      const materializedVisibility = normalizeVisibility(
        typeof body.visibility === "string" ? body.visibility : seededBook?.visibility
      );

      if (!materializedTitle) {
        return NextResponse.json(
          { ok: false, message: "タイトルが必要です。" },
          { status: 400 }
        );
      }

      const created = await insertWordbook(supabase, {
        title: materializedTitle,
        description: materializedDescription,
        coverImage: materializedCover,
        visibility: materializedVisibility,
      });

      if (created.error || !created.data) {
        return NextResponse.json(
          { ok: false, message: created.error?.message ?? "Unknown error" },
          { status: 500 }
        );
      }

      if (materializedWords.length > 0) {
        const { error: wordsError } = await supabase.from("words").insert(
          materializedWords.map((word) => ({ wordbook_id: created.data.id, ...word }))
        );
        if (wordsError) {
          return NextResponse.json(
            { ok: false, message: wordsError.message },
            { status: 500 }
          );
        }
      }

      return NextResponse.json({
        ok: true,
        created: true,
        wordbook: created.data,
        wordCount: materializedWords.length,
      });
    }

    const metaUpdate: Record<string, unknown> = {};

    if (typeof body.title === "string") metaUpdate.title = body.title.trim();
    if (typeof body.description === "string") {
      metaUpdate.description = body.description.trim() || null;
    }
    if (typeof body.cover_image === "string") {
      metaUpdate.cover_image = body.cover_image.trim() || null;
    }
    if (
      body.visibility === "public" ||
      body.visibility === "personal" ||
      body.visibility === "teacher" ||
      body.visibility === "admin"
    ) {
      metaUpdate.visibility = body.visibility;
    }

    const skippedColumns: string[] = [];
    if (Object.keys(metaUpdate).length > 0) {
      // 存在しないカラムは自動的に除外して再試行
      let updatePayload = { ...metaUpdate };
      let lastError: DbError = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        if (Object.keys(updatePayload).length === 0) break;
        const { error } = await supabase.from("wordbooks").update(updatePayload).eq("id", id);
        if (!error) { lastError = null; break; }
        lastError = error;
        // "column X does not exist" → Xを除外して再試行
        const colMatch = error.message.match(/column ['"]([\w]+)['"]\s*(of relation .*)? does not exist/i)
          ?? error.message.match(/"([\w]+)" does not exist/i);
        if (colMatch) {
          skippedColumns.push(colMatch[1]);
          delete updatePayload[colMatch[1]];
          continue;
        }
        break; // その他のエラーは再試行しない
      }
      if (lastError) {
        return NextResponse.json({ ok: false, message: lastError.message ?? "DB更新エラー" }, { status: 500 });
      }
    }

    if (Array.isArray(body.words) && body.words.length > 0) {
      const clean = cleanWordList(body.words as IncomingWord[]);
      if (clean.length > 0) {
        await supabase.from("words").delete().eq("wordbook_id", id);
        const { error: wordsError } = await supabase.from("words").insert(
          clean.map((word) => ({ wordbook_id: id, ...word }))
        );
        if (wordsError) {
          return NextResponse.json(
            { ok: false, message: wordsError.message },
            { status: 500 }
          );
        }
        return NextResponse.json({ ok: true, wordCount: clean.length });
      }
    }

    return NextResponse.json({
      ok: true,
      ...(skippedColumns.length > 0 ? { skippedColumns, warning: `DBにカラムが存在しないため保存されませんでした: ${skippedColumns.join(", ")}` } : {}),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const unauthorized = checkAdminPassword(request);
  if (unauthorized) return unauthorized;
  if (!isSupabaseServerConfigured()) return supabaseServerConfigResponse();

  try {
    const body = await request.json().catch(() => ({}));
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) {
      return NextResponse.json(
        { ok: false, message: "IDが必要です。" },
        { status: 400 }
      );
    }

    if (!isPersistedDbId(id)) {
      return NextResponse.json(
        {
          ok: false,
          message: "この単語帳は組み込み公式データです。Supabase に保存された版だけ削除できます。",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    let result = await supabase.from("wordbooks").delete().eq("id", id).eq("is_official", true);
    if (isMissingColumnError(result.error, "is_official")) {
      result = await supabase.from("wordbooks").delete().eq("id", id);
    }

    if (result.error) {
      return NextResponse.json(
        { ok: false, message: result.error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
