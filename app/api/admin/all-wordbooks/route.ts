import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServerConfigured } from "@/lib/supabase/admin";
import { fallbackOfficialWordbooksForApi, mergeWordbooksById } from "@/lib/official-wordbooks";

function checkAdminPassword(request: Request) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return NextResponse.json({ ok: false, message: "ADMIN_PASSWORD未設定" }, { status: 500 });
  const supplied = request.headers.get("x-admin-password") ?? "";
  if (supplied !== adminPassword) return NextResponse.json({ ok: false, message: "認証失敗" }, { status: 401 });
  return null;
}

export async function GET(request: Request) {
  const unauthorized = checkAdminPassword(request);
  if (unauthorized) return unauthorized;
  const fallbackBooks = fallbackOfficialWordbooksForApi();

  if (!isSupabaseServerConfigured()) {
    return NextResponse.json({
      ok: true,
      wordbooks: fallbackBooks,
    });
  }

  try {
    const supabase = getSupabaseAdmin();

    // カラムが存在しない場合のフォールバック付きクエリ
    type WbRow = { id: string; title: string; description: string | null; visibility?: string | null; cover_image?: string | null };
    let wordbooks: WbRow[] | null = null;
    let wbErr: { message: string } | null = null;

    // 管理者画面はPW保護済みなので is_official フィルタ不要 — DB内の全単語帳を表示
    const r1 = await supabase
      .from("wordbooks")
      .select("id,title,description,visibility,cover_image")
      .order("created_at", { ascending: false });

    if (!r1.error) {
      wordbooks = r1.data as WbRow[];
    } else if (r1.error.message.includes("cover_image") || r1.error.message.includes("does not exist")) {
      // cover_imageカラムがない場合
      const r2 = await supabase
        .from("wordbooks")
        .select("id,title,description,visibility")
        .order("created_at", { ascending: false });
      if (!r2.error) {
        wordbooks = r2.data as WbRow[];
      } else if (r2.error.message.includes("visibility") || r2.error.message.includes("does not exist")) {
        const r3 = await supabase
          .from("wordbooks")
          .select("id,title,description")
          .order("created_at", { ascending: false });
        wordbooks = r3.data as WbRow[];
        wbErr = r3.error;
      } else {
        wbErr = r2.error;
      }
    } else {
      wbErr = r1.error;
    }

    if (wbErr) {
      return NextResponse.json({
        ok: true,
        wordbooks: fallbackBooks,
        message: wbErr.message,
      });
    }
    if (!wordbooks?.length) {
      return NextResponse.json({
        ok: true,
        wordbooks: fallbackBooks,
      });
    }

    const ids = wordbooks.map((w) => w.id);

    // wordsテーブルもカラム存在確認付き
    type WordRow = { wordbook_id: string; number: string | number | null; english: string | null; japanese: string | null; unit?: string | null };
    let words: WordRow[] | null = null;

    const rw1 = await supabase
      .from("words")
      .select("wordbook_id,number,english,japanese,unit")
      .in("wordbook_id", ids)
      .order("number", { ascending: true });

    if (!rw1.error) {
      words = rw1.data as WordRow[];
    } else {
      // unitカラムがない or numberでのsortが失敗した場合
      const rw2 = await supabase
        .from("words")
        .select("wordbook_id,number,english,japanese")
        .in("wordbook_id", ids);
      if (!rw2.error) {
        words = rw2.data as WordRow[];
      } else {
        // numberカラムもない場合
        const rw3 = await supabase
          .from("words")
          .select("wordbook_id,english,japanese")
          .in("wordbook_id", ids);
        words = (rw3.data ?? []) as WordRow[];
      }
    }

    const byBook = new Map<string, Array<{ no: number; english: string; japanese: string; unit: string | null }>>();
    for (const w of words ?? []) {
      const bucket = byBook.get(w.wordbook_id) ?? [];
      bucket.push({
        no: Number(w.number) || bucket.length + 1,
        english: w.english ?? "",
        japanese: w.japanese ?? "",
        unit: (w as { unit?: string | null }).unit ?? null,
      });
      byBook.set(w.wordbook_id, bucket);
    }

    function planFromVisibility(v: string | null | undefined) {
      if (v === "teacher") return "teacher";
      if (v === "personal") return "personal";
      if (v === "admin") return "admin";
      return "free";
    }

    const liveBooks = wordbooks.map((wb) => ({
      id: wb.id,
      title: wb.title,
      description: wb.description ?? "",
      coverImage: wb.cover_image ?? null,
      requiredPlan: planFromVisibility(wb.visibility),
      visibility: wb.visibility ?? "public",
      words: byBook.get(wb.id) ?? [],
    }));

    return NextResponse.json({
      ok: true,
      wordbooks: mergeWordbooksById(liveBooks, fallbackBooks),
    });
  } catch (e) {
    return NextResponse.json({
      ok: true,
      wordbooks: fallbackBooks,
      message: e instanceof Error ? e.message : "Unknown error",
    });
  }
}
