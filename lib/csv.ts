// Excelで文字化けしないようBOM付きUTF-8・CRLFで出力する。
// 先頭が = + @ などのセルはExcelで数式として実行され得るため（CSVインジェクション）、
// 先頭に ' を付けて文字列として扱わせる。"-ful" のような接尾辞は英単語として残す。
function neutralizeFormula(value: string): string {
  if (/^[=+@\t\r]/.test(value) || /^-[^A-Za-z\s]/.test(value)) return `'${value}`;
  return value;
}

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = neutralizeFormula(String(value));
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows: unknown[][]): string {
  return `﻿${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function csvResponse(csv: string, filename: string): Response {
  const asciiName = filename.replace(/[^\w.-]/g, "_");
  return new Response(csv, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function csvDateStamp(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
