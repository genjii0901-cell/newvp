import { NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api-keys";
import { csvDateStamp, csvResponse, toCsv } from "@/lib/csv";
import { loadWordbooksForExport, wordbookSummary, wordCsvRows } from "@/lib/wordbook-export";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// AI連携用: 1冊分の単語（番号・単語・意味・ユニット）。認証は Authorization: Bearer <APIキー>。
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireApiKey(request, "wordbooks:read");
  if (denied) return denied;

  const { id } = await context.params;
  const { wordbooks } = await loadWordbooksForExport({ includeWords: true, id });
  const book = wordbooks[0];
  if (!book) {
    return NextResponse.json({ ok: false, message: "単語帳が見つかりません。" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  if (new URL(request.url).searchParams.get("format") === "csv") {
    return csvResponse(toCsv(wordCsvRows([book], { includeBook: false })), `wordbook_${book.id}_${csvDateStamp()}.csv`);
  }
  return NextResponse.json(
    {
      ok: true,
      wordbook: wordbookSummary(book),
      words: book.words.map((word) => ({
        number: word.label ?? String(word.no),
        word: word.english,
        meaning: word.japanese,
        unit: word.unit,
      })),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
