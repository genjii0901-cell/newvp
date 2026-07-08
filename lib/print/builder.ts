/* Shared PDF print HTML builder — used by both app/page.tsx and app/admin/page.tsx */

export type PrintWord = { no: number; english: string; japanese: string };
export type PdfType = "list" | "test" | "answer";
export type Direction = "en-ja" | "ja-en" | "spelling";
export type PrintStyle = "standard" | "blank-english" | "blank-japanese" | "red-english" | "red-japanese";
export type PrintPlan = "free" | "personal" | "teacher" | "admin";

export interface BuildPrintHtmlOptions {
  title: string;
  words: PrintWord[];
  type: PdfType;
  direction: Direction;
  showPageNo: boolean;
  plan: PrintPlan;
  printStyle: PrintStyle;
  includeWatermark: boolean;
  showRecordFields: boolean;
  showClassField: boolean;
  showNumberField: boolean;
  showNameField: boolean;
  studentClass: string;
  studentNumber: string;
  studentName: string;
  includeDate: boolean;
  generatedAt: Date;
  expiresAt?: Date;
  /** フッター右の「Created by」表記。未指定なら既定文言。 */
  footerText?: string;
  /** 本文の文字サイズ倍率（0.85=小 / 1=標準 / 1.15=大 など）。既定1。 */
  fontScale?: number;
}

function escapeHtml(value: string): string {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatPrintDate(date = new Date()): string {
  return date.toLocaleDateString("ja-JP");
}

function makeQuestion(word: PrintWord, direction: Direction): { question: string; answer: string } {
  if (direction === "ja-en" || direction === "spelling") {
    return { question: word.japanese, answer: word.english };
  }
  return { question: word.english, answer: word.japanese };
}

function formatStyledText(
  value: string,
  language: "english" | "japanese",
  printStyle: PrintStyle
): string {
  const shouldBlank =
    (printStyle === "blank-english" && language === "english") ||
    (printStyle === "blank-japanese" && language === "japanese");
  const shouldRed =
    (printStyle === "red-english" && language === "english") ||
    (printStyle === "red-japanese" && language === "japanese");

  if (shouldBlank) return `<span class="p-blank"></span>`;
  if (shouldRed) return `<span class="p-red">${escapeHtml(value)}</span>`;
  return escapeHtml(value);
}

export function buildPrintHtml(opts: BuildPrintHtmlOptions): string {
  const {
    title, words, type, direction, showPageNo, plan, printStyle,
    includeWatermark, showRecordFields, showClassField, showNumberField,
    showNameField, studentClass, studentNumber, studentName,
    includeDate, generatedAt, expiresAt, footerText, fontScale = 1,
  } = opts;

  const credit = (footerText ?? "").trim() || "Created by Vocab Print Pro";
  const fs = Math.min(1.4, Math.max(0.8, Number(fontScale) || 1));

  const perPage = 50;
  const isAdmin = plan === "admin";
  const isFree = plan === "free";
  const visibleWords = isFree ? words.slice(0, perPage) : words;
  const pages: PrintWord[][] = [];
  for (let i = 0; i < visibleWords.length; i += perPage) {
    pages.push(visibleWords.slice(i, i + perPage));
  }

  const infoFields: Array<{ label: string; value: string }> = [];
  if (showRecordFields) {
    if (showClassField) infoFields.push({ label: "クラス", value: studentClass.trim() });
    if (showNumberField) infoFields.push({ label: "番号", value: studentNumber.trim() });
    if (showNameField) infoFields.push({ label: "氏名", value: studentName.trim() });
    if (includeDate) infoFields.push({ label: "日付", value: formatPrintDate(generatedAt) });
  }

  const watermark =
    (includeWatermark || isFree)
      ? isFree
        ? "FREE / 1 PAGE / REPRINT IN 7 DAYS"
        : "Vocab Print Pro"
      : "";

  const dirLang = (value: string, word: PrintWord): "english" | "japanese" =>
    value === word.english ? "english" : "japanese";

  return `<style>${PRINT_CSS}</style>` + pages
    .map((pageWords, pageIndex) => {
      const left = pageWords.slice(0, 25);
      const right = pageWords.slice(25, 50);

      const table = (items: PrintWord[]) => {
        const rows = items.map((word) => {
          const qa = makeQuestion(word, direction);
          const leftText = type === "list"
            ? formatStyledText(word.english, "english", printStyle)
            : formatStyledText(qa.question, dirLang(qa.question, word), printStyle);
          const rightText = type === "list"
            ? formatStyledText(word.japanese, "japanese", printStyle)
            : type === "answer"
              ? formatStyledText(qa.answer, dirLang(qa.answer, word), printStyle)
              : "";
          return `<tr>
            <td class="p-no"><div class="p-fit center"><span class="p-text one">${escapeHtml(String(word.no))}</span></div></td>
            <td class="p-word"><div class="p-fit"><span class="p-text two">${leftText}</span></div></td>
            <td class="p-meaning"><div class="p-fit"><span class="p-text two">${rightText}</span></div></td>
          </tr>`;
        }).join("");
        return `<table class="print-table">
          <thead><tr>
            <th class="p-no">番号</th>
            <th class="p-word">${type === "list" ? "単語" : "問題"}</th>
            <th class="p-meaning">${type === "test" ? "解答欄" : type === "answer" ? "答え" : "意味"}</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
      };

      const footerRight = isFree && expiresAt
        ? `${credit} ・ Expires ${formatPrintDate(expiresAt)}`
        : credit;

      return `<section class="print-page" style="--vp-fs:${fs}">
        ${watermark ? `<div class="print-watermark">${escapeHtml(watermark)}</div>` : ""}
        <div class="print-body">
          <h1>${escapeHtml(title)}</h1>
          ${isFree ? `<p class="print-note">Free版は1ページのみです。</p>` : ""}
          <div class="print-grid">
            ${table(left)}
            ${table(right)}
          </div>
        </div>
        ${infoFields.length > 0 ? `
          <div class="print-info-box">
            <div class="print-info-title">記入欄</div>
            <div class="print-info-fields">
              ${infoFields.map((f) => `
                <div class="print-info-field">
                  <span class="print-info-label">${escapeHtml(f.label)}</span>
                  <span class="print-info-line">${escapeHtml(f.value || " ")}</span>
                </div>`).join("")}
            </div>
          </div>` : ""}
        <footer>
          <span></span>
          <span>${showPageNo ? `${pageIndex + 1}/${pages.length}` : ""}</span>
          <span>${escapeHtml(footerRight)}</span>
        </footer>
      </section>`;
    })
    .join("");
}

export const PRINT_CSS = `
@media print {
  body { margin:0!important; background:white!important; }
  body * { visibility:hidden!important; }
  #print-root, #print-root * { visibility:visible!important; }
  #print-root { display:block!important; position:absolute!important; left:0!important; top:0!important; width:100%!important; background:white!important; }
  @page { size: A4 portrait; margin: 9mm 9mm 8mm 9mm; }
  .print-page { width:100%; height:auto; page-break-after:always; box-sizing:border-box; position:relative; overflow:hidden; padding-bottom:2mm; font-family:"Yu Gothic","Meiryo",sans-serif; color:#111; background:white; display:flex; flex-direction:column; }
  .print-page h1 { margin:0 0 6mm; text-align:center; font-size:12pt; font-weight:900; letter-spacing:.04em; }
  .print-note { margin:-2mm 0 4mm; text-align:center; font-size:8.5pt; color:#7c2d12; }
  .print-body { flex:1 1 auto; display:flex; flex-direction:column; gap:2mm; }
  .print-watermark { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:28pt; font-weight:900; letter-spacing:.08em; color:rgba(37,99,235,.08); transform:rotate(-24deg); pointer-events:none; user-select:none; text-transform:uppercase; }
  .print-grid { display:grid; grid-template-columns:1fr 1fr; column-gap:6.5mm; align-items:start; flex:1 1 auto; }
  .print-table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:calc(7.8pt * var(--vp-fs, 1)); line-height:1.22; }
  .print-table th,.print-table td { border:.65pt solid #111; padding:0; height:8.45mm; max-height:8.45mm; overflow:hidden; vertical-align:middle; }
  .print-table th { height:7.8mm; text-align:center; font-weight:800; background:#fff; }
  .p-no { width:10%; text-align:center; } .p-word { width:26%; } .p-meaning { width:64%; }
  .p-fit { box-sizing:border-box; width:100%; height:100%; padding:.8mm 1.05mm; overflow:hidden; display:flex; align-items:center; justify-content:flex-start; overflow-wrap:anywhere; word-break:break-word; }
  .p-fit.center { justify-content:center; text-align:center; }
  .p-text { display:-webkit-box; -webkit-box-orient:vertical; overflow:hidden; }
  .p-text.one { -webkit-line-clamp:1; line-clamp:1; }
  .p-text.two { -webkit-line-clamp:2; line-clamp:2; }
  .p-blank { display:inline-block; width:100%; min-width:22mm; height:1.2em; border-bottom:0!important; transform:none; }
  .p-red { color:#dc2626; font-weight:800; }
  .print-info-box { margin-top:auto; border:.65pt solid #111; padding:2.2mm 3mm 2.5mm; background:white; }
  .print-info-title { margin-bottom:1.8mm; font-size:8.2pt; font-weight:800; text-align:center; }
  .print-info-fields { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:2mm; }
  .print-info-field { display:flex; align-items:center; gap:1.5mm; min-height:7mm; padding:.6mm 1mm; border:.45pt solid #999; border-radius:1mm; background:#fff; }
  .print-info-label { flex:0 0 auto; font-size:7.2pt; font-weight:800; }
  .print-info-line { flex:1 1 auto; min-width:0; border-bottom:.7pt solid #111; font-size:8pt; line-height:1.2; padding-bottom:.3mm; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
  footer { position:static; margin-top:2mm; height:7mm; border-top:.4pt solid #ddd; display:grid; grid-template-columns:1fr 1fr 1fr; align-items:end; font-size:8pt; color:#333; background:white; padding-top:1mm; }
  footer span { min-width:0; }
  footer span:nth-child(2) { text-align:center; }
  footer span:nth-child(3) { text-align:right; word-break:break-word; }
}
@media screen { #print-root { display:none; } }
`;
