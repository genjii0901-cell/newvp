import { NextResponse } from "next/server";
import {
  getSupabaseAdmin,
  isSupabaseServerConfigured,
  supabaseServerConfigResponse,
} from "@/lib/supabase/admin";
import {
  fallbackOfficialWordbooksForApi,
  HIDDEN_TEMPLATE_DESCRIPTION_PREFIX,
  normalizeBookTitle,
} from "@/lib/official-wordbooks";
import { requireAdmin } from "@/lib/admin-auth";
import { embedWordbookMeta } from "@/lib/wordbook-meta";

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

const checkAdminPassword = requireAdmin;

function cleanWordList(words: IncomingWord[]) {
  return words
    .map((word, index) => ({
      number: String(word.number ?? word.no ?? index + 1),
      english: String(word.english ?? "").trim(),
      japanese: String(word.japanese ?? "").trim(),
      unit: String(word.unit ?? "").trim() || null,
    }))
    .filter((word) => word.english && word.japanese);
}

function isMissingColumnError(error: DbError, column: string) {
  const message = error?.message ?? "";
  return message.includes(column) || message.includes("does not exist") || message.includes("schema cache");
}

function normalizeVisibility(value: unknown): Visibility {
  if (value === "personal" || value === "teacher" || value === "admin") return value;
  return "public";
}

function isPersistedDbId(value: string) {
  return /^\d+$/.test(value) || /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value);
}

async function insertHiddenTemplateTombstone(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  title: string
) {
  const description = `${HIDDEN_TEMPLATE_DESCRIPTION_PREFIX}${title}`;
  const attempts: Record<string, unknown>[] = [
    { owner_id: null, title, description, is_official: true, visibility: "private" },
    { owner_id: null, title, description, visibility: "private" },
    { title, description, visibility: "private" },
    { owner_id: null, title, description, is_official: true },
    { owner_id: null, title, description },
    { title, description },
  ];

  let lastError: DbError = null;
  for (const payload of attempts) {
    const result = await supabase.from("wordbooks").insert(payload).select("id,title").single();
    if (!result.error) return result;
    lastError = result.error;
    const expectedSchemaMismatch =
      isMissingColumnError(result.error, "is_official") ||
      isMissingColumnError(result.error, "owner_id") ||
      isMissingColumnError(result.error, "visibility") ||
      result.error.message.includes("null value") ||
      result.error.message.includes("violates not-null") ||
      result.error.message.includes("does not exist");
    if (!expectedSchemaMismatch) return result;
  }

  return { data: null, error: lastError ?? { message: "Failed to hide template wordbook." } };
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
  const embeddedDescription = embedWordbookMeta(description, { coverImage, visibility });
  const attempts: Record<string, unknown>[] = [
    { owner_id: null, title, description: embeddedDescription || null, cover_image: coverImage || null, is_official: true, visibility },
    { owner_id: null, title, description: embeddedDescription || null, is_official: true, visibility },
    { owner_id: null, title, description: embeddedDescription || null, cover_image: coverImage || null, visibility },
    { owner_id: null, title, description: embeddedDescription || null, visibility },
    { title, description: embeddedDescription || null, cover_image: coverImage || null, visibility },
    { title, description: embeddedDescription || null, visibility },
    { owner_id: null, title, description: embeddedDescription || null, cover_image: coverImage || null, is_official: true },
    { owner_id: null, title, description: embeddedDescription || null, is_official: true },
    { owner_id: null, title, description: embeddedDescription || null, cover_image: coverImage || null },
    { owner_id: null, title, description: embeddedDescription || null },
    { title, description: embeddedDescription || null, cover_image: coverImage || null },
    { title, description: embeddedDescription || null },
  ];

  let lastError: DbError = null;
  for (const payload of attempts) {
    const result = await supabase.from("wordbooks").insert(payload).select("id,title").single();
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

  return { data: null, error: lastError ?? { message: "Failed to insert wordbook." } };
}

async function findExistingOfficialWordbookByTitle(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  title: string
) {
  const matches = await listExistingOfficialWordbooksByTitle(supabase, title);
  if (matches.length === 0) return null;
  return matches[matches.length - 1];
}

async function listExistingOfficialWordbooksByTitle(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  title: string
) {
  const trimmed = title.trim();
  if (!trimmed) return [];
  const normalizedTitle = normalizeBookTitle(trimmed);

  let result = await supabase.from("wordbooks").select("id,title").eq("is_official", true).limit(500);

  if (isMissingColumnError(result.error, "is_official")) {
    result = await supabase.from("wordbooks").select("id,title").limit(500);
  }

  if (result.error || !result.data || result.data.length === 0) return [];
  return (result.data as Array<{ id: string; title: string | null }>).filter(
    (row) => normalizeBookTitle(row.title ?? "") === normalizedTitle
  ) as Array<{ id: string; title: string }>;
}

async function cleanupDuplicateWordbooksByTitle(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  title: string,
  keepId: string
) {
  const matches = await listExistingOfficialWordbooksByTitle(supabase, title);
  const duplicateIds = matches.map((item) => String(item.id)).filter((id) => id !== keepId);

  for (const duplicateId of duplicateIds) {
    await supabase.from("words").delete().eq("wordbook_id", duplicateId);
    let result = await supabase.from("wordbooks").delete().eq("id", duplicateId).eq("is_official", true);
    if (isMissingColumnError(result.error, "is_official")) {
      result = await supabase.from("wordbooks").delete().eq("id", duplicateId);
    }
  }

  return duplicateIds;
}

async function getWordbookTitleById(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  id: string
) {
  const { data, error } = await supabase.from("wordbooks").select("title").eq("id", id).maybeSingle();
  if (error || !data?.title || typeof data.title !== "string") return "";
  return data.title;
}

async function replaceWords(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  wordbookId: string,
  words: ReturnType<typeof cleanWordList>
) {
  await supabase.from("words").delete().eq("wordbook_id", wordbookId);
  if (words.length === 0) return { error: null };
  // 大きな単語帳（数千語）でも確実に保存できるよう、まとめて1回ではなく分割して挿入する。
  const rows = words.map((word) => ({ wordbook_id: wordbookId, ...word }));
  const INSERT_CHUNK = 500;
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const { error } = await supabase.from("words").insert(rows.slice(i, i + INSERT_CHUNK));
    if (error) return { error };
  }

  const countResult = await supabase
    .from("words")
    .select("id", { count: "exact", head: true })
    .eq("wordbook_id", wordbookId);

  if (countResult.error) {
    return { error: countResult.error };
  }

  const persistedCount = countResult.count ?? 0;
  if (persistedCount !== words.length) {
    return {
      error: {
        message: `Saved ${persistedCount} words, but expected ${words.length}.`,
      },
    };
  }

  return { error: null };
}

async function updateWordbookMeta(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  id: string,
  meta: {
    title?: string;
    description?: string;
    coverImage?: string | null;
    visibility?: Visibility;
  }
) {
  const updatePayload: Record<string, unknown> = {};
  if (typeof meta.title === "string") updatePayload.title = meta.title.trim();
  const embeddedDescription =
    meta.description !== undefined || meta.coverImage !== undefined || meta.visibility !== undefined
      ? embedWordbookMeta(meta.description, { coverImage: meta.coverImage, visibility: meta.visibility })
      : null;
  if (embeddedDescription !== null) updatePayload.description = embeddedDescription || null;
  if (meta.coverImage !== undefined) updatePayload.cover_image = meta.coverImage?.trim() || null;
  if (meta.visibility) updatePayload.visibility = meta.visibility;

  if (Object.keys(updatePayload).length === 0) {
    return { error: null as DbError, skippedColumns: [] as string[] };
  }

  const skippedColumns: string[] = [];
  let currentPayload = { ...updatePayload };
  let lastError: DbError = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    if (Object.keys(currentPayload).length === 0) break;
    const { data: updatedRows, error } = await supabase
      .from("wordbooks")
      .update(currentPayload)
      .eq("id", id)
      .select("id,title,visibility");
    if (!error) {
      lastError = null;
      if (!updatedRows || updatedRows.length === 0) {
        return { error: { message: `Wordbook ${id} was not found.` }, skippedColumns };
      }
      break;
    }
    lastError = error;
    const colMatch =
      error.message.match(/column ['"]([\w]+)['"]\s*(of relation .*)? does not exist/i) ??
      error.message.match(/"([\w]+)" does not exist/i) ??
      error.message.match(/Could not find the ['"]?([\w]+)['"]? column/i);
    if (colMatch) {
      skippedColumns.push(colMatch[1]);
      delete currentPayload[colMatch[1]];
      continue;
    }
    break;
  }

  return { error: lastError, skippedColumns };
}

export async function POST(request: Request) {
  const unauthorized = checkAdminPassword(request);
  if (unauthorized) return unauthorized;
  if (!isSupabaseServerConfigured()) return supabaseServerConfigResponse();

  try {
    const body = await request.json().catch(() => ({}));
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const coverImage = typeof body.cover_image === "string" ? body.cover_image.trim() : null;
    const visibility = normalizeVisibility(body.visibility);
    const words = Array.isArray(body.words) ? (body.words as IncomingWord[]) : [];
    const clean = cleanWordList(words);

    if (!title) {
      return NextResponse.json({ ok: false, message: "タイトルを入力してください。" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const existing = await findExistingOfficialWordbookByTitle(supabase, title);
    let wordbook = existing;

    if (existing) {
      const metaResult = await updateWordbookMeta(supabase, String(existing.id), {
        title,
        description,
        coverImage,
        visibility,
      });
      if (metaResult.error) {
        return NextResponse.json({ ok: false, message: metaResult.error.message ?? "Unknown error" }, { status: 500 });
      }
    } else {
      const created = await insertWordbook(supabase, {
        title,
        description,
        coverImage,
        visibility,
      });
      if (created.error || !created.data) {
        return NextResponse.json(
          { ok: false, message: `DBエラー: ${created.error?.message ?? "Unknown error"}` },
          { status: 500 }
        );
      }
      wordbook = created.data;
    }

    if (!wordbook?.id) {
      return NextResponse.json({ ok: false, message: "保存先の単語帳IDを特定できませんでした。" }, { status: 500 });
    }

    const wordsResult = await replaceWords(supabase, String(wordbook.id), clean);
    if (wordsResult.error) {
      return NextResponse.json({ ok: false, message: wordsResult.error.message }, { status: 500 });
    }

    const removedDuplicateIds = await cleanupDuplicateWordbooksByTitle(
      supabase,
      title,
      String(wordbook.id)
    );

    return NextResponse.json({
      ok: true,
      wordbook,
      wordCount: clean.length,
      removedDuplicateIds,
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
    const id =
      typeof body.id === "string" ? body.id.trim() : typeof body.id === "number" ? String(body.id) : "";
    if (!id) {
      return NextResponse.json({ ok: false, message: "IDが必要です。" }, { status: 400 });
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
      const materializedWords = cleanWordList(incomingWords.length > 0 ? incomingWords : fallbackWords ?? []);
      const materializedTitle =
        typeof body.title === "string" && body.title.trim().length > 0
          ? body.title.trim()
          : seededBook?.title ?? "";
      const materializedDescription =
        typeof body.description === "string" ? body.description.trim() : seededBook?.description ?? "";
      const materializedCover =
        typeof body.cover_image === "string" ? body.cover_image.trim() : seededBook?.coverImage ?? null;
      const materializedVisibility = normalizeVisibility(
        typeof body.visibility === "string" ? body.visibility : seededBook?.visibility
      );

      if (!materializedTitle) {
        return NextResponse.json({ ok: false, message: "タイトルが必要です。" }, { status: 400 });
      }

      const existing = await findExistingOfficialWordbookByTitle(supabase, materializedTitle);
      let wordbook = existing;

      if (existing) {
        const metaResult = await updateWordbookMeta(supabase, String(existing.id), {
          title: materializedTitle,
          description: materializedDescription,
          coverImage: materializedCover,
          visibility: materializedVisibility,
        });
        if (metaResult.error) {
          return NextResponse.json({ ok: false, message: metaResult.error.message ?? "Unknown error" }, { status: 500 });
        }
      } else {
        const created = await insertWordbook(supabase, {
          title: materializedTitle,
          description: materializedDescription,
          coverImage: materializedCover,
          visibility: materializedVisibility,
        });
        if (created.error || !created.data) {
          return NextResponse.json({ ok: false, message: created.error?.message ?? "Unknown error" }, { status: 500 });
        }
        wordbook = created.data;
      }

      if (!wordbook?.id) {
        return NextResponse.json({ ok: false, message: "保存先の単語帳IDを特定できませんでした。" }, { status: 500 });
      }

      const wordsResult = await replaceWords(supabase, String(wordbook.id), materializedWords);
      if (wordsResult.error) {
        return NextResponse.json({ ok: false, message: wordsResult.error.message }, { status: 500 });
      }

      const removedDuplicateIds = await cleanupDuplicateWordbooksByTitle(
        supabase,
        materializedTitle,
        String(wordbook.id)
      );

      return NextResponse.json({
        ok: true,
        created: !existing,
        wordbook,
        wordCount: materializedWords.length,
        removedDuplicateIds,
      });
    }

    const metaResult = await updateWordbookMeta(supabase, id, {
      title: typeof body.title === "string" ? body.title : undefined,
      description: typeof body.description === "string" ? body.description : undefined,
      coverImage: typeof body.cover_image === "string" ? body.cover_image : undefined,
      visibility:
        body.visibility === "public" ||
        body.visibility === "personal" ||
        body.visibility === "teacher" ||
        body.visibility === "admin"
          ? body.visibility
          : undefined,
    });

    if (metaResult.error) {
      return NextResponse.json({ ok: false, message: metaResult.error.message ?? "DB更新エラー" }, { status: 500 });
    }

    if (Array.isArray(body.words)) {
      const clean = cleanWordList(body.words as IncomingWord[]);
      const wordsResult = await replaceWords(supabase, id, clean);
      if (wordsResult.error) {
        return NextResponse.json({ ok: false, message: wordsResult.error.message }, { status: 500 });
      }
      const titleForCleanup =
        typeof body.title === "string" && body.title.trim().length > 0
          ? body.title.trim()
          : await getWordbookTitleById(supabase, id);
      const removedDuplicateIds = titleForCleanup
        ? await cleanupDuplicateWordbooksByTitle(supabase, titleForCleanup, id)
        : [];
      return NextResponse.json({
        ok: true,
        wordCount: clean.length,
        removedDuplicateIds,
        ...(metaResult.skippedColumns.length > 0
          ? { skippedColumns: metaResult.skippedColumns, warning: `Skipped columns: ${metaResult.skippedColumns.join(", ")}` }
          : {}),
      });
    }

    const requiredSkipped = metaResult.skippedColumns.filter(
      (column) => !["cover_image", "is_official", "owner_id", "visibility"].includes(column)
    );
    const titleForCleanup =
      typeof body.title === "string" && body.title.trim().length > 0
        ? body.title.trim()
        : await getWordbookTitleById(supabase, id);
    const removedDuplicateIds = titleForCleanup
      ? await cleanupDuplicateWordbooksByTitle(supabase, titleForCleanup, id)
      : [];

    return NextResponse.json({
      ok: true,
      removedDuplicateIds,
      ...(requiredSkipped.length > 0
        ? { skippedColumns: requiredSkipped, warning: `Skipped columns: ${requiredSkipped.join(", ")}` }
        : {}),
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
    const id =
      typeof body.id === "string" ? body.id.trim() : typeof body.id === "number" ? String(body.id) : "";
    if (!id) {
      return NextResponse.json({ ok: false, message: "IDが必要です。" }, { status: 400 });
    }

    if (!isPersistedDbId(id) && false) {
      return NextResponse.json(
        { ok: false, message: "テンプレート単語帳は直接削除できません。保存済みの単語帳を削除してください。" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    if (!isPersistedDbId(id)) {
      const seededBook = fallbackOfficialWordbooksForApi().find((book) => book.id === id);
      if (!seededBook) {
        return NextResponse.json(
          { ok: false, message: "削除対象のテンプレート単語帳が見つかりませんでした。" },
          { status: 404 }
        );
      }

      const existing = await findExistingOfficialWordbookByTitle(supabase, seededBook.title);
      if (existing?.id) {
        await supabase.from("words").delete().eq("wordbook_id", String(existing.id));
        let deleteExisting = await supabase.from("wordbooks").delete().eq("id", String(existing.id)).eq("is_official", true);
        if (isMissingColumnError(deleteExisting.error, "is_official")) {
          deleteExisting = await supabase.from("wordbooks").delete().eq("id", String(existing.id));
        }
        if (deleteExisting.error) {
          return NextResponse.json({ ok: false, message: deleteExisting.error.message }, { status: 500 });
        }
      }

      const hidden = await insertHiddenTemplateTombstone(supabase, seededBook.title);
      if (hidden.error) {
        return NextResponse.json(
          { ok: false, message: hidden.error.message ?? "テンプレート単語帳の非表示化に失敗しました。" },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true, hiddenTemplate: true });
    }
    const wordsDeleteResult = await supabase.from("words").delete().eq("wordbook_id", id);
    if (wordsDeleteResult.error) {
      return NextResponse.json(
        { ok: false, message: wordsDeleteResult.error.message ?? "関連単語の削除に失敗しました。" },
        { status: 500 }
      );
    }

    let result = await supabase.from("wordbooks").delete().eq("id", id).eq("is_official", true);
    if (isMissingColumnError(result.error, "is_official")) {
      result = await supabase.from("wordbooks").delete().eq("id", id);
    }

    if (result.error) {
      return NextResponse.json({ ok: false, message: result.error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
