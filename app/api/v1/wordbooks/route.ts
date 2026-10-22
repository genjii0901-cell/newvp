import { NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api-keys";
import { csvDateStamp, csvResponse, toCsv } from "@/lib/csv";
import { loadWordbooksForExport, wordbookListCsvRows, wordbookSummary } from "@/lib/wordbook-export";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// AI連携用: 単語帳一覧（読み取り専用）。認証は Authorization: Bearer <APIキー>。
export async function GET(request: Request) {
  const denied = await requireApiKey(request, "wordbooks:read");
  if (denied) return denied;

  const { ok, wordbooks } = await loadWordbooksForExport({ includeWords: false });
  if (new URL(request.url).searchParams.get("format") === "csv") {
    return csvResponse(toCsv(wordbookListCsvRows(wordbooks)), `wordbooks_${csvDateStamp()}.csv`);
  }
  return NextResponse.json(
    { ok, wordbooks: wordbooks.map(wordbookSummary) },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
