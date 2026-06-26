import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServerConfigured } from "@/lib/supabase/admin";

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

  if (!isSupabaseServerConfigured()) {
    return NextResponse.json({
      ok: false,
      supabaseConfigured: false,
      wordbooks: [],
      message: "Supabaseが未設定のため、単語帳を読み込めません。VercelにSUPABASE_SERVICE_ROLE_KEYとNEXT_PUBLIC_SUPABASE_URLを設定してください。",
    });
  }

  try {
    const supabase = getSupabaseAdmin();

    type WbRow = { id: string; title: string; description: string | null; visibility?: string | null; cover_image?: string | null };
    let wordbooks: WbRow[] | null = null;
    let dbError: string | null = null;

    // wordbooks.created_at は本番スキーマに無いので、存在する列だけ段階的に取得する。
    const queries = [
      () => supabase.from("wordbooks").select("id,title,description,visibility,cover_image"),
      () => supabase.from("wordbooks").select("id,title,description,visibility"),
      () => supabase.from("wordbooks").select("id,title,description"),
    ];

    for (const run of queries) {
      const r = await run();
      if (!r.error) { wordbooks = r.data as WbRow[]; dbError = null; break; }
      dbError = r.error.message;
    }

    if (dbError) {
      return NextResponse.json({
        ok: false,
        supabaseConfigured: true,
        wordbooks: [],
        message: `DBエラー: ${dbError}`,
      });
    }

    if (!wordbooks?.length) {
      return NextResponse.json({
        ok: true,
        supabaseConfigured: true,
        wordbooks: [],
        message: "Supabaseに単語帳がまだ登録されていません。",
      });
    }

    const ids = wordbooks.map((w) => w.id);

    type WordRow = { wordbook_id: string; number: string | number | null; english: string | null; japanese: string | null; unit?: string | null };
    let words: WordRow[] = [];

    const rw1 = await supabase
      .from("words")
      .select("wordbook_id,number,english,japanese,unit")
      .in("wordbook_id", ids)
      .order("number", { ascending: true });

    if (!rw1.error) {
      words = rw1.data as WordRow[];
    } else {
      const rw2 = await supabase
        .from("words")
        .select("wordbook_id,number,english,japanese")
        .in("wordbook_id", ids);
      if (!rw2.error) {
        words = rw2.data as WordRow[];
      } else {
        const rw3 = await supabase
          .from("words")
          .select("wordbook_id,english,japanese")
          .in("wordbook_id", ids);
        words = (rw3.data ?? []) as WordRow[];
      }
    }

    const byBook = new Map<string, Array<{ no: number; english: string; japanese: string; unit: string | null }>>();
    for (const w of words) {
      const key = String(w.wordbook_id);
      const bucket = byBook.get(key) ?? [];
      bucket.push({
        no: Number(w.number) || bucket.length + 1,
        english: w.english ?? "",
        japanese: w.japanese ?? "",
        unit: (w as { unit?: string | null }).unit ?? null,
      });
      byBook.set(key, bucket);
    }

    function planFromVisibility(v: string | null | undefined) {
      if (v === "teacher") return "teacher";
      if (v === "personal") return "personal";
      if (v === "admin") return "admin";
      return "free";
    }

    const liveBooks = wordbooks.map((wb) => ({
      id: String(wb.id),
      title: wb.title,
      description: wb.description ?? "",
      coverImage: wb.cover_image ?? null,
      requiredPlan: planFromVisibility(wb.visibility),
      visibility: wb.visibility ?? "public",
      words: byBook.get(String(wb.id)) ?? [],
    }));

    return NextResponse.json({
      ok: true,
      supabaseConfigured: true,
      wordbooks: liveBooks,
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      supabaseConfigured: true,
      wordbooks: [],
      message: e instanceof Error ? e.message : "Unknown error",
    });
  }
}
