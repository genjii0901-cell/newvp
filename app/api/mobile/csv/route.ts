import { NextResponse } from "next/server";
import { loadOfficialWordbooks } from "@/lib/server-wordbooks";
import { ensureProfile, requireSupabaseUser } from "@/lib/supabase/admin";

function cell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const auth = await requireSupabaseUser(request);
  if (auth.response) return auth.response;
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ ok: false, message: "単語帳を選択してください。" }, { status: 400 });
  try {
    // 単語帳データの一括出力は管理者のみ（会員には渡さない）
    const profile = await ensureProfile(auth.user);
    if (profile?.role !== "admin") {
      return NextResponse.json({ ok: false, message: "CSV出力は管理者のみ利用できます。" }, { status: 403 });
    }
    const result = await loadOfficialWordbooks({ includeAdmin: false, includeFallback: true, includeWords: true, includeWordStats: false, filterIds: [id] });
    const book = result.wordbooks.find((item) => String(item.id) === id);
    if (!book) return NextResponse.json({ ok: false, message: "単語帳が見つかりません。" }, { status: 404 });
    const rows = [["number", "english", "japanese", "unit"], ...book.words.map((word) => [word.no, word.english, word.japanese, word.unit ?? ""])];
    return new Response(`\uFEFF${rows.map((row) => row.map(cell).join(",")).join("\r\n")}`, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="vocabprint-${encodeURIComponent(id)}.csv"`, "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ ok: false, message: "CSVを作成できませんでした。もう一度お試しください。" }, { status: 503 });
  }
}
