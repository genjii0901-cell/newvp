// Teacher向け: 自作の単語帳をCSVで書き出す（列名はTeacherページで設定した値をこの端末から読む）。
// 公式単語帳や、他の単語帳から取り込んだものは権利の関係で出力しない（呼び出し側で判定する）。
export const TEACHER_CSV_HEADER_STORAGE_KEY = "vpp-teacher-csv-headers-v1";

type CsvHeaders = { no: string; english: string; japanese: string; unit: string };
const DEFAULT_HEADERS: CsvHeaders = { no: "番号", english: "英語", japanese: "日本語", unit: "区分" };

export const OWN_WORDBOOK_ONLY_MESSAGE =
  "CSV出力できるのは、マイ単語帳で作った自作の単語帳だけです。公式の単語帳や、ほかの単語帳から取り込んだものは、権利の関係で出力できません。";

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function readHeaders(): CsvHeaders {
  try {
    const saved = window.localStorage.getItem(TEACHER_CSV_HEADER_STORAGE_KEY);
    if (saved) return { ...DEFAULT_HEADERS, ...(JSON.parse(saved) as Partial<CsvHeaders>) };
  } catch {
    // 壊れていても既定の列名で出力する。
  }
  return DEFAULT_HEADERS;
}

export function downloadWordbookCsv(
  title: string,
  words: Array<{ no?: number | string | null; english?: string | null; japanese?: string | null; unit?: string | null }>,
) {
  const headers = readHeaders();
  const rows = [
    [headers.no, headers.english, headers.japanese, headers.unit],
    ...words.map((word, index) => [word.no ?? index + 1, word.english ?? "", word.japanese ?? "", word.unit ?? ""]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${title || "単語帳"}-単語一覧.csv`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
