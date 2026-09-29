import { NextResponse } from "next/server";
import { loadOfficialWordbooks } from "@/lib/server-wordbooks";
import { ensureProfile, requireSupabaseUser } from "@/lib/supabase/admin";

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const auth = await requireSupabaseUser(request);
  if (auth.response) return auth.response;

  const profile = await ensureProfile(auth.user);
  if (profile?.plan !== "teacher" && profile?.role !== "admin") {
    return NextResponse.json({ ok: false, message: "CSV出力はTeacherプランの機能です。" }, { status: 403 });
  }

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ ok: false, message: "単語帳を選択してください。" }, { status: 400 });

  const result = await loadOfficialWordbooks({
    includeAdmin: profile?.role === "admin",
    includeFallback: true,
    includeWords: true,
    includeWordStats: false,
    filterIds: [id],
  });
  const book = result.wordbooks.find((item) => String(item.id) === id);
  if (!book) return NextResponse.json({ ok: false, message: "単語帳が見つかりません。" }, { status: 404 });

  const rows = [
    ["number", "english", "japanese", "unit"],
    ...book.words.map((word) => [word.no, word.english, word.japanese, word.unit ?? ""]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vocabprint-wordbook-${encodeURIComponent(id)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
