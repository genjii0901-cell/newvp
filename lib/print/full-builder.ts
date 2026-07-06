/* 共有の印刷HTMLビルダー（メイン画面・管理画面で共通利用）
 * 元はapp/page.tsx内にあった実装を共通化したもの。出力・プレビューを1箇所に統一する。 */

export type PrintWord = { no: number; english: string; japanese: string };
export type PdfType = "list" | "test" | "answer";
export type Direction = "en-ja" | "ja-en" | "spelling";
export type PrintStyle = "standard" | "blank-english" | "blank-japanese" | "red-english" | "red-japanese";
export type PrintPlan = "free" | "personal" | "teacher" | "admin";

export function formatPrintDate(date = new Date()) {
  return date.toLocaleDateString("ja-JP");
}

export function escapeHtml(value: string) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function directionLanguage(value: string, word: PrintWord): "english" | "japanese" {
  if (value === word.english) return "english";
  return "japanese";
}

/** 出題方向に応じた問題/答えの組み立て。 */
export function makeQuestion(word: PrintWord, direction: Direction): { question: string; answer: string } {
  if (direction === "ja-en" || direction === "spelling") {
    return { question: word.japanese, answer: word.english };
  }
  return { question: word.english, answer: word.japanese };
}

export interface BuildPrintHtmlOptions {
  title: string;
  words: PrintWord[];
  type: PdfType;
  showPageNo: boolean;
  makeQuestion: (word: PrintWord) => { question: string; answer: string };
  plan: PrintPlan;
  printStyle: PrintStyle;
  includeWatermark: boolean;
  userEmail?: string;
  showRecordFields: boolean;
  showClassField: boolean;
  showNumberField: boolean;
  showNameField: boolean;
  studentClass: string;
  studentNumber: string;
  studentName: string;
  includeDate: boolean;
  generatedAt: Date;
  /** フッター右の作成者表記。未指定なら従来どおり（購入者メール＋Vocab Print Pro）。 */
  footerText?: string;
  /** 本文の文字サイズ倍率（1=標準）。 */
  fontScale?: number;
  titleOffsetX?: number;
  titleOffsetY?: number;
  dateOffsetX?: number;
  dateOffsetY?: number;
  infoOffsetX?: number;
  infoOffsetY?: number;
  gridOffsetX?: number;
  gridOffsetY?: number;
  pageNoOffsetX?: number;
  pageNoOffsetY?: number;
}

export function buildPrintHtml({
  title,
  words,
  type,
  showPageNo,
  makeQuestion,
  plan,
  printStyle,
  includeWatermark,
  showRecordFields,
  showClassField,
  showNumberField,
  showNameField,
  studentClass,
  studentNumber,
  studentName,
  includeDate,
  generatedAt,
  userEmail = "",
  footerText,
  fontScale = 1,
  titleOffsetX = 0,
  titleOffsetY = 0,
  dateOffsetX = 0,
  dateOffsetY = 0,
  infoOffsetX = 0,
  infoOffsetY = 0,
  gridOffsetX = 0,
  gridOffsetY = 0,
  pageNoOffsetX = 0,
  pageNoOffsetY = 0,
}: BuildPrintHtmlOptions) {
  const perPage = 50;
  const visibleWords = plan === "free" ? words.slice(0, perPage) : words;
  const pages: PrintWord[][] = [];

  for (let index = 0; index < visibleWords.length; index += perPage) {
    pages.push(visibleWords.slice(index, index + perPage));
  }

  const fs = Math.min(1.4, Math.max(0.8, Number(fontScale) || 1));

  const formatStyledText = (value: string, language: "english" | "japanese") => {
    const shouldBlank =
      (printStyle === "blank-english" && language === "english") ||
      (printStyle === "blank-japanese" && language === "japanese");
    const shouldRed =
      (printStyle === "red-english" && language === "english") ||
      (printStyle === "red-japanese" && language === "japanese");

    if (shouldBlank) {
      return `<span class="p-blank"></span>`;
    }

    if (shouldRed) {
      return `<span class="p-red">${escapeHtml(value)}</span>`;
    }

    return escapeHtml(value);
  };

  const hasInfoBox = showRecordFields && (showClassField || showNumberField || showNameField);
  const showDateHeader = includeDate;
  const dateStr = showDateHeader ? formatPrintDate(generatedAt) : "";

  // 透かし: 有料は購入者メール入り（流出・編集の抑止）、無料はFREE表記
  const watermark = includeWatermark || plan === "free"
    ? plan === "free"
      ? "FREE ・ 1ページのみ ・ 見本"
      : userEmail
        ? userEmail
        : "Vocab Print Pro"
    : "";

  const credit = (footerText ?? "").trim()
    ? (footerText as string).trim()
    : (userEmail ? userEmail + " ・ Vocab Print Pro" : "Vocab Print Pro");

  return `<style>${printCss}</style>` + pages
    .map((pageWords, pageIndex) => {
      const left = pageWords.slice(0, 25);
      const right = pageWords.slice(25, 50);

      const table = (items: PrintWord[]) => `
        <table class="print-table">
          <thead>
            <tr>
              <th class="p-no">番号</th>
              <th class="p-word">${type === "list" ? "単語" : "問題"}</th>
              <th class="p-meaning">${type === "test" ? "解答欄" : type === "answer" ? "答え" : "意味"}</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((word) => {
              const qa = makeQuestion(word);
              const leftText = type === "list" ? formatStyledText(word.english, "english") : formatStyledText(qa.question, directionLanguage(qa.question, word));
              const rightText = type === "list"
                ? formatStyledText(word.japanese, "japanese")
                : type === "answer"
                  ? formatStyledText(qa.answer, directionLanguage(qa.answer, word))
                  : "";
              return `<tr>
                <td class="p-no"><div class="p-fit center"><span class="p-text one">${escapeHtml(String(word.no))}</span></div></td>
                <td class="p-word"><div class="p-fit"><span class="p-text two">${leftText}</span></div></td>
                <td class="p-meaning"><div class="p-fit"><span class="p-text two">${rightText}</span></div></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>`;

      const headerStyle = titleOffsetY ? `margin-top:${titleOffsetY}mm` : "";
      const h1Style = titleOffsetX ? `transform:translateX(${titleOffsetX}mm)` : "";
      const dateStyle = (dateOffsetX || dateOffsetY) ? `transform:translate(${dateOffsetX}mm,${dateOffsetY}mm)` : "";
      const infoTransform = (infoOffsetX || infoOffsetY) ? `transform:translate(${infoOffsetX}mm,${infoOffsetY}mm)` : "";
      const infoStyle = `flex:0 0 auto;margin-top:8mm;background:white${infoTransform ? `;${infoTransform}` : ""}`;
      const pageNoStyle = (pageNoOffsetX || pageNoOffsetY) ? `transform:translate(${pageNoOffsetX}mm,${pageNoOffsetY}mm);display:inline-block` : "";
      // タイル状の透かし: ページ全体に繰り返し表示（流出抑止）
      const wmTiled = watermark
        ? `<div class="print-watermark">${Array.from({ length: 16 })
            .map(
              () =>
                `<div class="wm-row">${Array.from({ length: 6 })
                  .map(() => escapeHtml(watermark))
                  .join("&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;")}</div>`
            )
            .join("")}</div>`
        : "";
      return `<section class="print-page${hasInfoBox ? " has-info" : ""}" style="--vp-fs:${fs}">
        ${wmTiled}
        <div class="print-page-header"${headerStyle ? ` style="${headerStyle}"` : ""}>
          <h1${h1Style ? ` style="${h1Style}"` : ""}>${escapeHtml(title)}</h1>
          ${dateStr ? `<div class="print-date"${dateStyle ? ` style="${dateStyle}"` : ""}>${escapeHtml(dateStr)}</div>` : ""}
        </div>
        ${plan === "free" ? `<p class="print-note">Free版は1ページのみです。</p>` : ""}
        <div class="print-grid"${(gridOffsetX || gridOffsetY) ? ` style="transform:translate(${gridOffsetX}mm,${gridOffsetY}mm)"` : ""}>${table(left)}${table(right)}</div>
        ${hasInfoBox ? `<div class="print-info-box" style="${infoStyle}"><div class="print-info-fields">
          ${showClassField ? `<div class="pif pif-sm"><span class="pif-label">クラス</span><span class="pif-value">${escapeHtml(studentClass)}</span></div>` : ""}
          ${showNumberField ? `<div class="pif pif-sm"><span class="pif-label">番号</span><span class="pif-value">${escapeHtml(studentNumber)}</span></div>` : ""}
          ${showNameField ? `<div class="pif pif-lg"><span class="pif-label">氏名</span><span class="pif-value">${escapeHtml(studentName)}</span></div>` : ""}
        </div></div>` : ""}
        <footer>
          <span></span>
          <span${pageNoStyle ? ` style="${pageNoStyle}"` : ""}>${showPageNo ? `${pageIndex + 1}/${pages.length}` : ""}</span>
          <span>${escapeHtml(credit)}</span>
        </footer>
      </section>`;
    })
    .join("");
}

export const printCss = `
@media print {
  body { margin:0!important; background:white!important; }
  body * { visibility:hidden!important; }
  #print-root, #print-root * { visibility:visible!important; }
  #print-root { display:block!important; position:absolute!important; left:0!important; top:0!important; width:100%!important; background:white!important; }

  @page { size:A4 portrait; margin:9mm 9mm 8mm 9mm; }

  .print-page {
    width:100%; height:280mm; page-break-after:always;
    box-sizing:border-box; position:relative; overflow:hidden;
    font-family:"Yu Gothic","Meiryo",sans-serif; color:#111; background:white;
    display:flex; flex-direction:column; padding-bottom:1mm;
  }

  /* ヘッダー: タイトル中央・日付右上 */
  .print-page-header { position:relative; text-align:center; margin-bottom:4mm; }
  .print-page-header h1 { margin:0; font-size:12pt; font-weight:900; letter-spacing:.04em; }
  .print-date { position:absolute; right:0; top:2mm; font-size:7.5pt; color:#333; font-weight:600; line-height:1.2; }

  .print-note { margin:-1mm 0 3mm; text-align:center; font-size:8.5pt; color:#7c2d12; }

  .print-watermark {
    position:absolute; inset:-20% -20%; z-index:0; overflow:hidden;
    display:flex; flex-direction:column; justify-content:space-around; align-items:center;
    transform:rotate(-30deg); pointer-events:none; user-select:none;
  }
  .print-watermark .wm-row {
    white-space:nowrap; font-size:13pt; font-weight:800; letter-spacing:.18em;
    color:rgba(37,99,235,.08);
  }
  .print-page-header, .print-note, .print-grid, .print-info-box, footer { position:relative; z-index:1; }

  .print-grid { display:grid; grid-template-columns:1fr 1fr; column-gap:6.5mm; align-items:start; flex:1 1 0; min-height:0; }

  /* 記入欄なし: footer margin 9mm込み → grid ~254mm。td=9.5mm×25+th=8.5mm=246mm */
  .print-table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:calc(8.4pt * var(--vp-fs, 1)); line-height:1.2; }
  .print-table th, .print-table td { border:.65pt solid #111; padding:0; height:9.5mm; max-height:9.5mm; overflow:hidden; vertical-align:middle; }
  .print-table th { height:8.5mm; text-align:center; font-weight:800; background:#fff; }

  /* 記入欄あり: footer margin 9mm込み → grid ~237mm。td=9.0mm×25+th=8.0mm=233mm */
  .has-info .print-table { font-size:calc(7.8pt * var(--vp-fs, 1)); }
  .has-info .print-table td { height:9.0mm; max-height:9.0mm; }
  .has-info .print-table th { height:8.0mm; max-height:8.0mm; }

  .p-no { width:10%; text-align:center; }
  .p-word { width:26%; }
  .p-meaning { width:64%; }

  .p-fit { box-sizing:border-box; width:100%; height:100%; padding:.8mm 1.05mm; overflow:hidden; display:flex; align-items:center; justify-content:flex-start; overflow-wrap:anywhere; word-break:break-word; }
  .p-fit.center { justify-content:center; text-align:center; }
  .p-text { display:-webkit-box; -webkit-box-orient:vertical; overflow:hidden; }
  .p-text.one { -webkit-line-clamp:1; line-clamp:1; }
  .p-text.two { -webkit-line-clamp:2; line-clamp:2; }
  .p-blank { display:inline-block; width:100%; min-width:22mm; border-bottom:1.2pt solid #111; transform:translateY(-.5mm); }
  .p-red { color:#dc2626; font-weight:800; }

  /* 記入欄: クラス(小)・番号(小)・氏名(大) */
  .print-info-box { flex:0 0 auto; margin-top:8mm; background:white; }
  .print-info-fields { display:flex; gap:3mm; align-items:flex-end; }
  .pif { display:flex; align-items:baseline; gap:1.5mm; border-bottom:.75pt solid #111; padding-bottom:1mm; padding-top:.5mm; }
  .pif-sm { flex:0 0 26mm; }
  .pif-lg { flex:1 1 auto; }
  .pif-label { flex:0 0 auto; font-size:6.8pt; font-weight:800; white-space:nowrap; color:#333; }
  .pif-value { flex:1 1 auto; font-size:8.2pt; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; min-width:0; }

  footer {
    flex:0 0 auto; margin-top:9mm; height:6mm;
    display:grid; grid-template-columns:1fr 1fr 1fr; align-items:end;
    font-size:7.5pt; color:#555; background:white;
  }
  footer span { min-width:0; }
  footer span:nth-child(2) { text-align:center; }
  footer span:nth-child(3) { text-align:right; word-break:break-word; }
}
`;

export const PREVIEW_SCALE = 0.48;

export const previewCss = `
body { margin:0; background:white; overflow:hidden; }
#print-root { display:block; }
.print-page {
  width:192mm; height:280mm; page-break-after:always;
  box-sizing:border-box; position:relative; overflow:hidden;
  font-family:"Yu Gothic","Meiryo",sans-serif; color:#111; background:white;
  display:flex; flex-direction:column; padding-bottom:1mm; margin:9mm 9mm 8mm;
}
.print-page-header { position:relative; text-align:center; margin-bottom:4mm; flex:0 0 auto; }
.print-page-header h1 { margin:0; font-size:12pt; font-weight:900; letter-spacing:.04em; }
.print-date { position:absolute; right:0; top:0; font-size:7.5pt; color:#333; font-weight:600; line-height:1.2; }
.print-note { margin:-1mm 0 3mm; text-align:center; font-size:8.5pt; color:#7c2d12; }
.print-watermark {
  position:absolute; inset:-20% -20%; z-index:0; overflow:hidden;
  display:flex; flex-direction:column; justify-content:space-around; align-items:center;
  transform:rotate(-30deg); pointer-events:none; user-select:none;
}
.print-watermark .wm-row {
  white-space:nowrap; font-size:13pt; font-weight:800; letter-spacing:.18em;
  color:rgba(37,99,235,.08);
}
.print-page-header, .print-note, .print-grid, .print-info-box, footer { position:relative; z-index:1; }
.print-grid { display:grid; grid-template-columns:1fr 1fr; column-gap:6.5mm; align-items:start; flex:1 1 0; min-height:0; }
.print-table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:calc(8.4pt * var(--vp-fs, 1)); line-height:1.2; }
.print-table th, .print-table td { border:.65pt solid #111; padding:0; height:9.5mm; max-height:9.5mm; overflow:hidden; vertical-align:middle; }
.print-table th { height:8.5mm; text-align:center; font-weight:800; background:#fff; }
.has-info .print-table { font-size:calc(7.8pt * var(--vp-fs, 1)); }
.has-info .print-table td { height:9.0mm; max-height:9.0mm; }
.has-info .print-table th { height:8.0mm; max-height:8.0mm; }
.p-no { width:10%; text-align:center; }
.p-word { width:26%; }
.p-meaning { width:64%; }
.p-fit { box-sizing:border-box; width:100%; height:100%; padding:.8mm 1.05mm; overflow:hidden; display:flex; align-items:center; justify-content:flex-start; overflow-wrap:anywhere; word-break:break-word; }
.p-fit.center { justify-content:center; text-align:center; }
.p-text { display:-webkit-box; -webkit-box-orient:vertical; overflow:hidden; }
.p-text.one { -webkit-line-clamp:1; line-clamp:1; }
.p-text.two { -webkit-line-clamp:2; line-clamp:2; }
.p-blank { display:inline-block; width:100%; min-width:22mm; border-bottom:1.2pt solid #111; transform:translateY(-.5mm); }
.p-red { color:#dc2626; font-weight:800; }
.print-info-box { flex:0 0 auto; margin-top:8mm; background:white; }
.print-info-fields { display:flex; gap:3mm; align-items:flex-end; }
.pif { display:flex; align-items:baseline; gap:1.5mm; border-bottom:.75pt solid #111; padding-bottom:1mm; padding-top:.5mm; }
.pif-sm { flex:0 0 26mm; }
.pif-lg { flex:1 1 auto; }
.pif-label { flex:0 0 auto; font-size:6.8pt; font-weight:800; white-space:nowrap; color:#333; }
.pif-value { flex:1 1 auto; font-size:8.2pt; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; min-width:0; }
footer {
  flex:0 0 auto; margin-top:9mm; height:6mm;
  display:grid; grid-template-columns:1fr 1fr 1fr; align-items:end;
  font-size:7.5pt; color:#555; background:white;
}
footer span { min-width:0; }
footer span:nth-child(2) { text-align:center; }
footer span:nth-child(3) { text-align:right; word-break:break-word; }
`;
