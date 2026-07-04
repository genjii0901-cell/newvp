import { NextResponse } from "next/server";
import { getSupabaseAdmin, readableError, requireSupabaseUser } from "@/lib/supabase/admin";

type IncomingWord = {
  no?: number | string;
  english?: string;
  japanese?: string;
  unit?: string | null;
};

function cleanWords(words: IncomingWord[]) {
  return words
    .map((word, index) => ({
      number: String(word.no ?? index + 1),
      english: String(word.english ?? "").trim(),
      japanese: String(word.japanese ?? "").trim(),
      unit: typeof word.unit === "string" ? word.unit.trim() : "",
    }))
    .filter((word) => word.english && word.japanese);
}

async function loadWordbooksForUser(userId: string) {
  const supabase = getSupabaseAdmin();
  const { data: books, error } = await supabase
    .from("wordbooks")
    .select("id,title,description,created_at")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const bookIds = (books ?? []).map((book) => String(book.id));
  const wordsByBookId = new Map<
    string,
    Array<{ no: number; english: string; japanese: string; unit: string | null }>
  >();

  if (bookIds.length > 0) {
    const { data: words, error: wordsError } = await supabase
      .from("words")
      .select("wordbook_id,number,english,japanese,unit,created_at")
      .in("wordbook_id", bookIds)
      .order("created_at", { ascending: true });

    if (wordsError) throw wordsError;

    for (const row of words ?? []) {
      const key = String(row.wordbook_id);
      const current = wordsByBookId.get(key) ?? [];
      current.push({
        no: Number(row.number) || current.length + 1,
        english: row.english ?? "",
        japanese: row.japanese ?? "",
        unit: row.unit ?? null,
      });
      wordsByBookId.set(key, current);
    }
  }

  return (books ?? []).map((book) => {
    const words = wordsByBookId.get(String(book.id)) ?? [];
    return {
      id: String(book.id),
      title: book.title ?? "マイ単語帳",
      description: book.description ?? "",
      wordCount: words.length,
      words,
      requiredPlan: "free" as const,
      level: "自作",
    };
  });
}

export async function GET(request: Request) {
  try {
    const auth = await requireSupabaseUser(request);
    if (auth.response) return auth.response;

    const wordbooks = await loadWordbooksForUser(auth.user.id);
    return NextResponse.json({ ok: true, wordbooks });
  } catch (error) {
    return NextResponse.json({ ok: false, error: readableError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireSupabaseUser(request);
    if (auth.response) return auth.response;

    const body = await request.json().catch(() => ({}));
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "マイ単語帳";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const clean = cleanWords(Array.isArray(body.words) ? body.words : []);

    if (clean.length === 0) {
      return NextResponse.json(
        { ok: false, error: "番号・英語・日本語の3列データを入力してください。" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: wordbook, error: insertBookError } = await supabase
      .from("wordbooks")
      .insert({
        owner_id: auth.user.id,
        title,
        description,
        is_official: false,
        visibility: "private",
      })
      .select("id,title,description")
      .single();

    if (insertBookError || !wordbook) {
      return NextResponse.json({ ok: false, error: readableError(insertBookError) }, { status: 500 });
    }

    const payload = clean.map((word) => ({
      wordbook_id: wordbook.id,
      number: word.number,
      english: word.english,
      japanese: word.japanese,
      unit: word.unit,
    }));

    const { error: insertWordsError } = await supabase.from("words").insert(payload);
    if (insertWordsError) {
      await supabase.from("wordbooks").delete().eq("id", wordbook.id);
      return NextResponse.json({ ok: false, error: readableError(insertWordsError) }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      wordbook: {
        id: String(wordbook.id),
        title: wordbook.title ?? title,
        description: wordbook.description ?? description,
        wordCount: clean.length,
        words: clean.map((word, index) => ({
          no: Number(word.number) || index + 1,
          english: word.english,
          japanese: word.japanese,
          unit: word.unit || null,
        })),
        requiredPlan: "free",
        level: "自作",
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: readableError(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireSupabaseUser(request);
    if (auth.response) return auth.response;

    const body = await request.json().catch(() => ({}));
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) {
      return NextResponse.json({ ok: false, error: "単語帳IDが必要です。" }, { status: 400 });
    }

    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "マイ単語帳";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const clean = cleanWords(Array.isArray(body.words) ? body.words : []);

    if (clean.length === 0) {
      return NextResponse.json(
        { ok: false, error: "番号・英語・日本語の3列データを入力してください。" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: existing, error: existingError } = await supabase
      .from("wordbooks")
      .select("id")
      .eq("id", id)
      .eq("owner_id", auth.user.id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ ok: false, error: readableError(existingError) }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ ok: false, error: "編集対象の単語帳が見つかりません。" }, { status: 404 });
    }

    const { error: updateError } = await supabase
      .from("wordbooks")
      .update({ title, description })
      .eq("id", id)
      .eq("owner_id", auth.user.id);
    if (updateError) {
      return NextResponse.json({ ok: false, error: readableError(updateError) }, { status: 500 });
    }

    const { error: deleteWordsError } = await supabase.from("words").delete().eq("wordbook_id", id);
    if (deleteWordsError) {
      return NextResponse.json({ ok: false, error: readableError(deleteWordsError) }, { status: 500 });
    }

    const payload = clean.map((word) => ({
      wordbook_id: id,
      number: word.number,
      english: word.english,
      japanese: word.japanese,
      unit: word.unit,
    }));
    const { error: insertWordsError } = await supabase.from("words").insert(payload);
    if (insertWordsError) {
      return NextResponse.json({ ok: false, error: readableError(insertWordsError) }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      wordbook: {
        id,
        title,
        description,
        wordCount: clean.length,
        words: clean.map((word, index) => ({
          no: Number(word.number) || index + 1,
          english: word.english,
          japanese: word.japanese,
          unit: word.unit || null,
        })),
        requiredPlan: "free",
        level: "自作",
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: readableError(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireSupabaseUser(request);
    if (auth.response) return auth.response;

    const body = await request.json().catch(() => ({}));
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) {
      return NextResponse.json({ ok: false, error: "単語帳IDが必要です。" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    await supabase.from("words").delete().eq("wordbook_id", id);
    const { error } = await supabase
      .from("wordbooks")
      .delete()
      .eq("id", id)
      .eq("owner_id", auth.user.id);

    if (error) {
      return NextResponse.json({ ok: false, error: readableError(error) }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: readableError(error) }, { status: 500 });
  }
}
