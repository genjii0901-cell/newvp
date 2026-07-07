"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatMeaning } from "@/lib/meaning";
import { buildPrintHtml as buildSharedPrintHtml, makeQuestion as makeSharedQuestion, previewCss as sharedPreviewCss } from "@/lib/print/full-builder";
import { primeSpeechVoices, speakText } from "@/lib/speech";
import { createClient } from "@/lib/supabase/client";
import { buildWordbookPath, extractWordbookIdFromSlug } from "@/lib/wordbook-slug";
import QuizPanel from "./quiz-panel";

type Plan = "free" | "personal" | "teacher";
type DetailTab = "overview" | "test" | "quiz" | "listen";
type TestType = "list" | "test" | "answer";
type TestDirection = "en-ja" | "ja-en";
type PrintStyle = "standard" | "blank-english" | "blank-japanese" | "red-english" | "red-japanese";
type MeaningMode = "main" | "all";
type ListeningMode = "listen" | "test";
type DragTarget = "title" | "date" | "info" | "grid" | "pageNo";

const PREVIEW_SCALE = 0.48;
const PREVIEW_WIDTH = 794;
const PREVIEW_HEIGHT = 1123;

type Word = {
  no: number;
  english: string;
  japanese: string;
  unit: string | null;
};

type OfficialWordbook = {
  id: string;
  title: string;
  description: string;
  coverImage?: string | null;
  requiredPlan: Plan;
  wordCount?: number;
  creator?: string | null;
  words: Word[];
};

function planLabel(plan: Plan) {
  if (plan === "teacher") return "Teacher";
  if (plan === "personal") return "Personal";
  return "Free";
}

function planCopy(plan: Plan) {
  if (plan === "teacher") return "Teacher向け教材";
  if (plan === "personal") return "Personalで全範囲利用";
  return "無料でも1ページまで作成できます";
}

function isJapaneseOnlyText(value: string) {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(value) && !/[A-Za-z]/.test(value);
}

function rateValue(speed: number, base: number) {
  return Math.max(0.5, Math.min(1.4, Math.round(base * speed * 100) / 100));
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function chunkWords(words: Word[], size: number) {
  const chunks: Word[][] = [];
  for (let index = 0; index < words.length; index += size) chunks.push(words.slice(index, index + size));
  return chunks;
}

function formatPrintDate(date: Date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function styledPrintText(value: string, language: "english" | "japanese", style: PrintStyle) {
  const blank =
    (style === "blank-english" && language === "english") ||
    (style === "blank-japanese" && language === "japanese");
  const red =
    (style === "red-english" && language === "english") ||
    (style === "red-japanese" && language === "japanese");
  if (blank) return `<span class="p-blank"></span>`;
  if (red) return `<span class="p-red">${escapeHtml(value)}</span>`;
  return escapeHtml(value);
}

function buildPrintHtml({
  title,
  words,
  type,
  direction,
  printStyle,
  pageLimit,
  showPageNo,
  includeDate,
  showRecordFields,
  showClassField,
  showNumberField,
  showNameField,
  studentClass,
  studentNumber,
  studentName,
  includeWatermark,
  titleOffsetX,
  titleOffsetY,
  dateOffsetX,
  dateOffsetY,
  infoOffsetX,
  infoOffsetY,
  gridOffsetX,
  gridOffsetY,
  pageNoOffsetX,
  pageNoOffsetY,
}: {
  title: string;
  words: Word[];
  type: TestType;
  direction: TestDirection;
  printStyle: PrintStyle;
  pageLimit: number;
  showPageNo: boolean;
  includeDate: boolean;
  showRecordFields: boolean;
  showClassField: boolean;
  showNumberField: boolean;
  showNameField: boolean;
  studentClass: string;
  studentNumber: string;
  studentName: string;
  includeWatermark: boolean;
  titleOffsetX: number;
  titleOffsetY: number;
  dateOffsetX: number;
  dateOffsetY: number;
  infoOffsetX: number;
  infoOffsetY: number;
  gridOffsetX: number;
  gridOffsetY: number;
  pageNoOffsetX: number;
  pageNoOffsetY: number;
}) {
  const perPage = 50;
  const visibleWords = words.slice(0, perPage * pageLimit);
  const pages = chunkWords(visibleWords, perPage);
  const isJapaneseQuestion = direction === "ja-en";
  const heading = type === "list" ? `${title} 一覧` : type === "answer" ? `${title} 解答` : `${title} 問題`;
  const dateLabel = includeDate ? formatPrintDate(new Date()) : "";
  const watermark = includeWatermark ? "Vocab Print Pro" : "";
  const hasInfoBox = showRecordFields && (showClassField || showNumberField || showNameField);

  const pagesHtml = pages
    .map((pageWords, pageIndex) => {
      const tables = chunkWords(pageWords, 25)
        .map((columnWords) => {
          const rows = columnWords
            .map((word) => {
              const question = isJapaneseQuestion ? word.japanese : word.english;
              const answer = isJapaneseQuestion ? word.english : word.japanese;
              const questionLanguage = isJapaneseQuestion ? "japanese" : "english";
              const answerLanguage = isJapaneseQuestion ? "english" : "japanese";
              const leftText =
                type === "list"
                  ? styledPrintText(word.english, "english", printStyle)
                  : styledPrintText(question, questionLanguage, printStyle);
              const rightText =
                type === "list"
                  ? styledPrintText(word.japanese, "japanese", printStyle)
                  : type === "answer"
                    ? styledPrintText(answer, answerLanguage, printStyle)
                    : "";
              return `
                <tr>
                  <td class="p-no"><div class="p-fit center"><span class="p-text one">${escapeHtml(word.no)}</span></div></td>
                  <td class="p-word"><div class="p-fit"><span class="p-text two">${leftText}</span></div></td>
                  <td class="p-meaning"><div class="p-fit"><span class="p-text two">${rightText}</span></div></td>
                </tr>`;
            })
            .join("");
          return `
            <table class="print-table">
              <thead>
                <tr>
                  <th class="p-no">番号</th>
                  <th class="p-word">${type === "list" ? "単語" : "問題"}</th>
                  <th class="p-meaning">${type === "test" ? "解答欄" : type === "answer" ? "答え" : "意味"}</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>`;
        })
        .join("");

      const watermarkHtml = watermark
        ? `<div class="print-watermark">${Array.from({ length: 10 })
            .map(() => `<div class="wm-row">${escapeHtml(watermark)}&nbsp;&nbsp;&nbsp;${escapeHtml(watermark)}&nbsp;&nbsp;&nbsp;${escapeHtml(watermark)}</div>`)
            .join("")}</div>`
        : "";

      return `
        <section class="print-page${hasInfoBox ? " has-info" : ""}">
          ${watermarkHtml}
          <div class="print-page-header"${titleOffsetY ? ` style="margin-top:${titleOffsetY}mm"` : ""}>
            <h1${titleOffsetX ? ` style="transform:translateX(${titleOffsetX}mm)"` : ""}>${escapeHtml(heading)}</h1>
            ${dateLabel ? `<div class="print-date"${dateOffsetX || dateOffsetY ? ` style="transform:translate(${dateOffsetX}mm,${dateOffsetY}mm)"` : ""}>${escapeHtml(dateLabel)}</div>` : ""}
          </div>
          <div class="print-grid"${gridOffsetX || gridOffsetY ? ` style="transform:translate(${gridOffsetX}mm,${gridOffsetY}mm)"` : ""}>${tables}</div>
          ${
            hasInfoBox
              ? `<div class="print-info-box"${infoOffsetX || infoOffsetY ? ` style="transform:translate(${infoOffsetX}mm,${infoOffsetY}mm)"` : ""}><div class="print-info-fields">
                ${showClassField ? `<div class="pif pif-sm"><span class="pif-label">クラス</span><span class="pif-value">${escapeHtml(studentClass)}</span></div>` : ""}
                ${showNumberField ? `<div class="pif pif-sm"><span class="pif-label">番号</span><span class="pif-value">${escapeHtml(studentNumber)}</span></div>` : ""}
                ${showNameField ? `<div class="pif pif-lg"><span class="pif-label">氏名</span><span class="pif-value">${escapeHtml(studentName)}</span></div>` : ""}
              </div></div>`
              : ""
          }
          <footer><span></span><span${pageNoOffsetX || pageNoOffsetY ? ` style="transform:translate(${pageNoOffsetX}mm,${pageNoOffsetY}mm);display:inline-block"` : ""}>${showPageNo ? `${pageIndex + 1}/${pages.length}` : ""}</span><span>Created by Vocab Print Pro</span></footer>
        </section>`;
    })
    .join("");

  return `<style>@media print{.paper-preview .print-page:last-child{page-break-after:auto!important;break-after:auto!important}}.print-page:last-child{page-break-after:auto;break-after:auto}</style><div id="print-root">${pagesHtml}</div>`;
}

const detailPreviewCss = `
  body { margin:0; background:#f8fafc; font-family:"Yu Gothic","Meiryo",sans-serif; overflow:hidden; }
  .preview-stage { width: 794px; min-height: 1123px; box-sizing:border-box; transform-origin: top center; transform:scale(.72); margin:0 auto; }
  @media (max-width: 699px) { .preview-stage { transform:scale(.72); } }
  #print-root { display:block; }
  .print-page {
    width:192mm; height:280mm; box-sizing:border-box; position:relative; overflow:hidden;
    font-family:"Yu Gothic","Meiryo",sans-serif; color:#111; background:white; display:flex; flex-direction:column;
    padding-bottom:1mm; margin:9mm 9mm 8mm; border:1px solid #e2e8f0;
  }
  .print-page:last-child { page-break-after:auto; break-after:auto; }
  .print-page-header { position:relative; text-align:center; margin-bottom:4mm; flex:0 0 auto; }
  .print-page-header h1 { margin:0; font-size:12pt; font-weight:900; letter-spacing:.04em; }
  .print-date { position:absolute; right:0; top:0; font-size:7.5pt; color:#333; font-weight:600; line-height:1.2; }
  .print-watermark { position:absolute; inset:-20% -20%; z-index:0; overflow:hidden; display:flex; flex-direction:column; justify-content:space-around; align-items:center; transform:rotate(-30deg); pointer-events:none; user-select:none; }
  .print-watermark .wm-row { white-space:nowrap; font-size:13pt; font-weight:800; letter-spacing:.18em; color:rgba(37,99,235,.08); }
  .print-page-header,.print-grid,.print-info-box,footer { position:relative; z-index:1; }
  .print-grid { display:grid; grid-template-columns:1fr 1fr; column-gap:6.5mm; align-items:start; flex:1 1 0; min-height:0; }
  .print-table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:8.4pt; line-height:1.2; }
  .print-table th,.print-table td { border:.65pt solid #111; padding:0; height:9.5mm; max-height:9.5mm; overflow:hidden; vertical-align:middle; }
  .print-table th { height:8.5mm; text-align:center; font-weight:800; background:#fff; }
  .has-info .print-table { font-size:7.8pt; }
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
  footer { flex:0 0 auto; margin-top:9mm; height:6mm; display:grid; grid-template-columns:1fr 1fr 1fr; align-items:end; font-size:7.5pt; color:#555; background:white; }
  footer span:nth-child(2) { text-align:center; }
  footer span:nth-child(3) { text-align:right; word-break:break-word; }
`;

export default function WordbookDetailPage() {
  const params = useParams();
  const slug = String(params.id ?? "");
  const lookupId = extractWordbookIdFromSlug(slug);

  const supabase = useMemo(() => createClient(), []);
  const [userPlan, setUserPlan] = useState<Plan>("free");
  const isPaid = userPlan === "personal" || userPlan === "teacher";
  const FREE_WORD_LIMIT = 50;

  const [book, setBook] = useState<OfficialWordbook | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedUnit, setSelectedUnit] = useState("all");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  const [testType, setTestType] = useState<TestType>("test");
  const [testDirection, setTestDirection] = useState<TestDirection>("en-ja");
  const [printStyle, setPrintStyle] = useState<PrintStyle>("standard");
  const [pageLimit, setPageLimit] = useState(1);
  const [randomOrder, setRandomOrder] = useState(false);
  const [showPageNo, setShowPageNo] = useState(true);
  const [includeDate, setIncludeDate] = useState(false);
  const [showRecordFields, setShowRecordFields] = useState(true);
  const [showClassField, setShowClassField] = useState(true);
  const [showNumberField, setShowNumberField] = useState(true);
  const [showNameField, setShowNameField] = useState(true);
  const [studentClass, setStudentClass] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [studentName, setStudentName] = useState("");
  const [includeWatermark, setIncludeWatermark] = useState(true);
  const [customTitle, setCustomTitle] = useState("");
  const [showLayoutTools, setShowLayoutTools] = useState(false);
  const [titleOffsetX, setTitleOffsetX] = useState(0);
  const [titleOffsetY, setTitleOffsetY] = useState(0);
  const [dateOffsetX, setDateOffsetX] = useState(0);
  const [dateOffsetY, setDateOffsetY] = useState(0);
  const [infoOffsetX, setInfoOffsetX] = useState(0);
  const [infoOffsetY, setInfoOffsetY] = useState(0);
  const [gridOffsetX, setGridOffsetX] = useState(0);
  const [gridOffsetY, setGridOffsetY] = useState(0);
  const [pageNoOffsetX, setPageNoOffsetX] = useState(0);
  const [pageNoOffsetY, setPageNoOffsetY] = useState(0);
  const [dragging, setDragging] = useState<DragTarget | null>(null);
  const [dragStart, setDragStart] = useState({ cx: 0, cy: 0, ox: 0, oy: 0 });
  const [listenIndex, setListenIndex] = useState(0);
  const [showMeaning, setShowMeaning] = useState(false);
  const [meaningMode, setMeaningMode] = useState<MeaningMode>("main");
  const [listeningMode, setListeningMode] = useState<ListeningMode>("listen");
  const [listeningSpeed, setListeningSpeed] = useState(1);
  const [listeningGapMs, setListeningGapMs] = useState(650);
  const [isPlaying, setIsPlaying] = useState(false);
  const speechRunRef = useRef({ stopped: false, id: 0 });

  useEffect(() => {
    primeSpeechVoices();
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab === "test" || tab === "quiz" || tab === "listen") setActiveTab(tab);
    if (tab === "words") setActiveTab("overview");
  }, []);

  useEffect(() => {
    async function loadBook() {
      setLoading(true);
      setError("");
      const response = await fetch(`/api/wordbooks/official?id=${encodeURIComponent(lookupId)}&includeWords=1`);
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !Array.isArray(result.wordbooks)) {
        setError(result.message ?? "単語帳を読み込めませんでした。");
        setLoading(false);
        return;
      }

      const nextBook =
        result.wordbooks.find((item: OfficialWordbook) => String(item.id) === lookupId) ?? null;
      if (!nextBook) {
        setError("単語帳が見つかりませんでした。");
        setLoading(false);
        return;
      }

      setBook(nextBook);
      setRangeStart(String(nextBook.words[0]?.no ?? 1));
      setRangeEnd(String(nextBook.words[nextBook.words.length - 1]?.no ?? nextBook.words.length));

      const canonicalPath = buildWordbookPath(nextBook.id, nextBook.title);
      if (typeof window !== "undefined" && window.location.pathname !== canonicalPath) {
        window.history.replaceState(null, "", `${canonicalPath}${window.location.search}`);
      }
      setLoading(false);
    }

    loadBook().catch(() => {
      setError("単語帳を読み込めませんでした。");
      setLoading(false);
    });
  }, [lookupId]);

  // ログインユーザーのプランを取得（無料は50語まで／それ以上はPersonal案内）
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token;
      if (!token) return;
      const response = await fetch("/api/me/profile", { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
      if (!response) return;
      const result = await response.json().catch(() => ({}));
      const plan = result?.profile?.plan;
      if (active && response.ok && (plan === "personal" || plan === "teacher")) setUserPlan(plan);
    });
    return () => {
      active = false;
    };
  }, [supabase]);

  const units = useMemo(() => {
    if (!book) return [];
    return Array.from(new Set(book.words.map((word) => word.unit).filter(Boolean))) as string[];
  }, [book]);

  const visibleWords = useMemo(() => {
    if (!book) return [];
    const start = Number(rangeStart) || 1;
    const end = Number(rangeEnd) || book.words.length;

    return book.words.filter((word) => {
      const inUnit = selectedUnit === "all" || word.unit === selectedUnit;
      const inRange = word.no >= start && word.no <= end;
      return inUnit && inRange;
    });
  }, [book, rangeStart, rangeEnd, selectedUnit]);

  const testWords = useMemo(() => {
    if (!randomOrder) return visibleWords;
    return [...visibleWords].sort(() => Math.random() - 0.5);
  }, [randomOrder, visibleWords]);

  const listenWord = visibleWords[listenIndex] ?? null;
  const displayMeaning = listenWord ? formatMeaning(listenWord.japanese, meaningMode) : "";
  const printTitle = customTitle.trim() || (selectedUnit === "all" ? book?.title ?? "" : `${book?.title ?? ""} - ${selectedUnit}`);
  const printHtml = useMemo(() => {
    if (!book || visibleWords.length === 0) return "";
    const headingTitle = `${printTitle} ${testType === "list" ? "一覧" : testType === "answer" ? "解答" : "問題"}`;
    return buildSharedPrintHtml({
      title: headingTitle,
      words: testWords.slice(0, 50 * pageLimit),
      type: testType,
      showPageNo,
      makeQuestion: (word) => makeSharedQuestion(word, testDirection),
      plan: isPaid ? userPlan : "free",
      printStyle,
      includeWatermark,
      includeDate,
      generatedAt: new Date(),
      userEmail: "",
      showRecordFields,
      showClassField,
      showNumberField,
      showNameField,
      studentClass,
      studentNumber,
      studentName,
      titleOffsetX,
      titleOffsetY,
      dateOffsetX,
      dateOffsetY,
      infoOffsetX,
      infoOffsetY,
      gridOffsetX,
      gridOffsetY,
      pageNoOffsetX,
      pageNoOffsetY,
    });
  }, [
    book,
    dateOffsetX,
    dateOffsetY,
    gridOffsetX,
    gridOffsetY,
    includeDate,
    includeWatermark,
    infoOffsetX,
    infoOffsetY,
    pageLimit,
    pageNoOffsetX,
    pageNoOffsetY,
    printStyle,
    printTitle,
    showClassField,
    showNameField,
    showNumberField,
    showPageNo,
    showRecordFields,
    studentClass,
    studentName,
    studentNumber,
    testDirection,
    testType,
    testWords,
    titleOffsetX,
    titleOffsetY,
    visibleWords.length,
    isPaid,
    userPlan,
  ]);
  const previewDoc = useMemo(() => {
    // メイン画面と同じ共有プレビューCSSを使い、独立iframe内で描画する（画面崩れ防止）
    return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><style>${sharedPreviewCss}</style></head><body>${printHtml}</body></html>`;
  }, [printHtml]);
  const printedWordCount = Math.min(testWords.length, pageLimit * 50);
  const previewPageCount = Math.max(1, printHtml.match(/<section class=["']print-page/g)?.length ?? 1);

  useEffect(() => {
    stopListening();
    setListenIndex(0);
    setShowMeaning(false);
  }, [rangeStart, rangeEnd, selectedUnit]);

  useEffect(() => {
    if (!dragging) return;
    const ppMM = PREVIEW_SCALE * 3.78;
    const snapX = (value: number) => (Math.abs(value) <= 3 ? 0 : value);
    const snapY = (value: number) => (Math.abs(value) <= 2 ? 0 : value);
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
    const onMove = (event: MouseEvent) => {
      const dx = (event.clientX - dragStart.cx) / ppMM;
      const dy = (event.clientY - dragStart.cy) / ppMM;
      const nextX = dragStart.ox + dx;
      const nextY = dragStart.oy + dy;

      if (dragging === "title") {
        setTitleOffsetX(snapX(clamp(nextX, -80, 80)));
        setTitleOffsetY(snapY(clamp(nextY, -5, 15)));
      } else if (dragging === "date") {
        setDateOffsetX(snapX(clamp(nextX, -80, 80)));
        setDateOffsetY(snapY(clamp(nextY, -5, 20)));
      } else if (dragging === "info") {
        setInfoOffsetX(snapX(clamp(nextX, -80, 80)));
        setInfoOffsetY(snapY(clamp(nextY, -10, 10)));
      } else if (dragging === "grid") {
        setGridOffsetX(snapX(clamp(nextX, -80, 80)));
        setGridOffsetY(snapY(clamp(nextY, -30, 30)));
      } else if (dragging === "pageNo") {
        setPageNoOffsetX(snapX(clamp(nextX, -80, 80)));
        setPageNoOffsetY(snapY(clamp(nextY, -20, 20)));
      }
    };
    const onUp = () => setDragging(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, dragStart]);

  function storeSelectedRange() {
    if (!book || visibleWords.length === 0) return false;
    const payload = {
      title: selectedUnit === "all" ? book.title : `${book.title} - ${selectedUnit}`,
      words: visibleWords.map((word) => ({
        no: word.no,
        english: word.english,
        japanese: word.japanese,
      })),
    };
    sessionStorage.setItem("vpp-import-words", JSON.stringify(payload));
    return true;
  }

  function openAdvancedPrinter() {
    if (!storeSelectedRange()) return;
    window.location.href = "/?import=1";
  }

  function openPrintPage() {
    if (!book || visibleWords.length === 0 || !printHtml) return;
    const safeTitle = printTitle.replace(/[<>"&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", '"': "&quot;", "&": "&amp;" }[c] ?? c));
    const copyGuardStyle = `<style>#print-root,#print-root *{ -webkit-user-select:none!important; -moz-user-select:none!important; -ms-user-select:none!important; user-select:none!important; -webkit-touch-callout:none!important; }</style>`;
    const copyGuardScript = `<script>(function(){var b=["contextmenu","copy","cut","selectstart","dragstart"];b.forEach(function(e){document.addEventListener(e,function(ev){ev.preventDefault();return false;});});document.addEventListener("keydown",function(e){if((e.ctrlKey||e.metaKey)&&["c","x","a","u"].indexOf((e.key||"").toLowerCase())>-1){e.preventDefault();return false;}});})();<\/script>`;
    const fullDoc = `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>${safeTitle}</title>${copyGuardStyle}</head><body style="margin:0">${copyGuardScript}<div id="print-root">${printHtml}</div></body></html>`;

    // メイン画面と同じ挙動：スマホは/printページで表示（iframe印刷が不安定なため）、PCは隠しiframeで直接ダイアログ。
    const usePrintPage =
      typeof window !== "undefined" &&
      (window.matchMedia("(max-width: 767px)").matches ||
        /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent));
    if (usePrintPage) {
      sessionStorage.setItem(
        "vpp-print-job",
        JSON.stringify({
          html: `${copyGuardStyle}${copyGuardScript}<div id="print-root">${printHtml}</div>`,
          title: printTitle,
          sourceLabel: "wordbook-detail",
          createdAt: new Date().toISOString(),
        }),
      );
      window.location.href = "/print";
      return;
    }

    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;visibility:hidden;";
    document.body.appendChild(iframe);
    const iframeDoc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (iframeDoc) {
      iframeDoc.open();
      iframeDoc.write(fullDoc);
      iframeDoc.close();
      iframe.contentWindow?.focus();
      setTimeout(() => {
        try { iframe.contentWindow?.print(); } catch { /* ignore */ }
        setTimeout(() => { try { iframe.remove(); } catch { /* ignore */ } }, 60_000);
      }, 400);
    } else {
      iframe.remove();
    }
  }

  function openInListening() {
    if (!storeSelectedRange()) return;
    window.location.href = "/listening?import=1";
  }

  function stopListening() {
    speechRunRef.current.stopped = true;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setIsPlaying(false);
  }

  async function speakWord(word: Word, signal = speechRunRef.current) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setShowMeaning(listeningMode === "listen");
    const japanesePair = isJapaneseOnlyText(word.english);
    await speakText(word.english, {
      preferred: japanesePair ? "japanese" : "english",
      rate: rateValue(listeningSpeed, japanesePair ? 0.95 : 0.9),
      voiceHint: japanesePair ? "male" : undefined,
      signal,
    });
    if (signal.stopped) return;
    setShowMeaning(true);
    await speakText(formatMeaning(word.japanese, meaningMode), {
      preferred: "japanese",
      rate: rateValue(listeningSpeed, 0.95),
      voiceHint: japanesePair ? "female" : undefined,
      signal,
    });
  }

  async function startAutoListening() {
    if (!visibleWords.length) return;
    const run = { stopped: false, id: speechRunRef.current.id + 1 };
    speechRunRef.current = run;
    setIsPlaying(true);

    for (let index = listenIndex; index < visibleWords.length; index += 1) {
      if (run.stopped || speechRunRef.current.id !== run.id) return;
      setListenIndex(index);
      setShowMeaning(listeningMode === "listen");
      await speakWord(visibleWords[index], run);
      await new Promise((resolve) => window.setTimeout(resolve, Math.max(200, listeningGapMs)));
    }

    if (!run.stopped && speechRunRef.current.id === run.id) stopListening();
  }

  function goListen(delta: number) {
    stopListening();
    setShowMeaning(false);
    setListenIndex((current) => Math.min(Math.max(current + delta, 0), Math.max(visibleWords.length - 1, 0)));
  }

  function LayoutSlider({
    label,
    value,
    onChange,
    min = -12,
    max = 12,
  }: {
    label: string;
    value: number;
    onChange: (next: number) => void;
    min?: number;
    max?: number;
  }) {
    return (
      <label className="block rounded-xl bg-white px-3 py-2">
        <span className="flex items-center justify-between text-xs font-black text-slate-500">
          {label}
          <span>{value}mm</span>
        </span>
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="mt-2 w-full"
        />
      </label>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-5 py-20 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
        <p className="mt-3 text-sm text-slate-400">単語帳を読み込んでいます...</p>
      </div>
    );
  }

  if (error || !book) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-20 text-center">
        <p className="text-lg font-bold text-slate-700">{error || "単語帳が見つかりませんでした。"}</p>
        <Link href="/wordbooks" className="mt-5 inline-block rounded-xl border px-4 py-2 text-sm font-bold">
          単語帳一覧へ戻る
        </Link>
      </div>
    );
  }

  const tabs: Array<{ key: DetailTab; label: string; hint: string }> = [
    { key: "overview", label: "概要", hint: "単語一覧" },
    { key: "test", label: "単語テスト", hint: "印刷作成" },
    { key: "quiz", label: "単語チェック", hint: "4択・カード" },
    { key: "listen", label: "聞き流し", hint: "音声学習" },
  ];

  return (
    <main className="mx-auto max-w-6xl px-3 py-5 sm:px-5 sm:py-8">
      <Link href="/wordbooks" className="text-sm font-bold text-blue-600 hover:underline">
        ← 単語帳一覧へ
      </Link>

      <section className="mt-4 overflow-hidden rounded-3xl border bg-white shadow-sm">
        <div className="grid gap-0 md:grid-cols-[320px_1fr]">
          <div className="relative h-44 bg-slate-100 md:h-full">
            {book.coverImage ? (
              <img src={book.coverImage} alt={book.title} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center bg-gradient-to-br from-blue-100 to-slate-100 text-4xl font-black text-blue-600">
                VP
              </div>
            )}
            <div className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-xs font-black text-blue-700 shadow-sm">
              {planLabel(book.requiredPlan)}
            </div>
          </div>

          <div className="p-5 sm:p-7">
            <p className="text-xs font-black text-blue-700">{planCopy(book.requiredPlan)}</p>
            <h1 className="mt-2 text-2xl font-black leading-tight text-slate-950 sm:text-4xl">{book.title}</h1>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              {book.description || "単語テスト・一覧プリント・聞き流しに使える単語帳です。"}
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
              <span className="rounded-full bg-slate-100 px-3 py-1">{book.wordCount ?? book.words.length}語</span>
              {units.length > 0 ? <span className="rounded-full bg-slate-100 px-3 py-1">{units.length}ユニット</span> : null}
              <span className="rounded-full bg-slate-100 px-3 py-1">作成者: {book.creator ?? "Vocab Print Pro"}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="sticky top-0 z-10 mt-4 border-y bg-slate-50/95 py-2 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:py-0">
        <div className="flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-4 sm:overflow-visible sm:pb-0">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`min-w-[116px] rounded-2xl border px-3 py-2 text-left transition ${
                activeTab === tab.key
                  ? "border-blue-500 bg-blue-600 text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <span className="block text-sm font-black">{tab.label}</span>
              <span className={`block text-[11px] font-bold ${activeTab === tab.key ? "text-blue-100" : "text-slate-400"}`}>
                {tab.hint}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-3xl border bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black">使う範囲を選ぶ</h2>
            <p className="mt-1 text-sm text-slate-500">
              ここで選んだ範囲を、単語テスト・聞き流し・単語一覧にそのまま使います。
            </p>
          </div>
          <p className="rounded-full bg-slate-100 px-3 py-1 text-sm font-black text-slate-700">
            選択中: {visibleWords.length}語
          </p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <label className="text-sm font-bold">ユニット</label>
            <select
              value={selectedUnit}
              onChange={(event) => setSelectedUnit(event.target.value)}
              className="mt-1 w-full rounded-xl border px-3 py-3 text-sm"
            >
              <option value="all">すべて</option>
              {units.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-bold">開始番号</label>
            <input
              value={rangeStart}
              onChange={(event) => setRangeStart(event.target.value)}
              type="number"
              className="mt-1 w-full rounded-xl border px-3 py-3 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-bold">終了番号</label>
            <input
              value={rangeEnd}
              onChange={(event) => setRangeEnd(event.target.value)}
              type="number"
              className="mt-1 w-full rounded-xl border px-3 py-3 text-sm"
            />
          </div>
        </div>
      </section>

      {activeTab === "overview" && (
        <section className="mt-4 overflow-hidden rounded-3xl border bg-white shadow-sm">
          <div className="border-b bg-slate-50 px-4 py-3">
            <div>
              <h2 className="text-lg font-black text-slate-900">単語一覧</h2>
              <p className="mt-1 text-xs font-bold text-slate-500">コピーできないプレビューとして表示しています。</p>
            </div>
          </div>
          <div className="max-h-[620px] overflow-auto select-none">
            <table className="w-full min-w-[620px] table-fixed border-collapse text-sm">
              <thead className="sticky top-0 bg-white text-slate-500">
                <tr>
                  <th className="w-16 border-b p-3 text-center">番号</th>
                  <th className="w-28 border-b p-3 text-left">Unit</th>
                  <th className="w-1/3 border-b p-3 text-left">単語</th>
                  <th className="border-b p-3 text-left">意味</th>
                </tr>
              </thead>
              <tbody>
                {visibleWords.slice(0, 500).map((word) => (
                  <tr key={`${word.no}-${word.english}`} className="border-b last:border-0">
                    <td className="p-3 text-center font-bold text-slate-400">{word.no}</td>
                    <td className="p-3 text-slate-500">{word.unit ?? "-"}</td>
                    <td className="p-3 font-bold text-slate-900">{word.english}</td>
                    <td className="p-3 text-slate-600">{word.japanese}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleWords.length > 500 ? (
              <p className="p-4 text-center text-xs font-bold text-slate-400">
                表示は先頭500語までです。テスト作成・聞き流しには選択範囲全体を使えます。
              </p>
            ) : null}
          </div>
        </section>
      )}

      {activeTab === "test" && (
        <section className="mt-4 grid gap-4 lg:grid-cols-[360px_1fr]">
          <div className="min-w-0 rounded-3xl border bg-white p-5 shadow-sm">
            <p className="text-sm font-black text-blue-700">単語テスト</p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">印刷設定</h2>

            <div className="mt-4 rounded-2xl bg-blue-50 p-4 text-sm font-bold text-blue-900">
              <p>{rangeStart || "-"}番から{rangeEnd || "-"}番まで / {visibleWords.length}語</p>
              <p className="mt-1 text-xs text-blue-700">
                この設定では{printedWordCount}語、{previewPageCount}ページ分を印刷します。
              </p>
            </div>

            <div className="mt-5 space-y-3">
              <label className="block rounded-2xl border p-3">
                <span className="text-xs font-black text-slate-500">印刷タイトル</span>
                <input
                  value={customTitle}
                  onChange={(event) => setCustomTitle(event.target.value)}
                  placeholder={selectedUnit === "all" ? book?.title : `${book?.title} - ${selectedUnit}`}
                  className="mt-1 w-full bg-transparent text-sm font-bold outline-none"
                />
              </label>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block rounded-2xl border p-3">
                  <span className="text-xs font-black text-slate-500">プリントの種類</span>
                  <select value={testType} onChange={(event) => setTestType(event.target.value as TestType)} className="mt-1 w-full bg-transparent text-sm font-bold">
                    <option value="test">問題プリント</option>
                    <option value="answer">解答プリント</option>
                    <option value="list">単語一覧</option>
                  </select>
                </label>
                <label className="block rounded-2xl border p-3">
                  <span className="text-xs font-black text-slate-500">出題方向</span>
                  <select value={testDirection} onChange={(event) => setTestDirection(event.target.value as TestDirection)} className="mt-1 w-full bg-transparent text-sm font-bold">
                    <option value="en-ja">英語 → 日本語</option>
                    <option value="ja-en">日本語 → 英語</option>
                  </select>
                </label>
              </div>

              <label className="block rounded-2xl border p-3">
                <span className="text-xs font-black text-slate-500">表示の加工</span>
                <select value={printStyle} onChange={(event) => setPrintStyle(event.target.value as PrintStyle)} className="mt-1 w-full bg-transparent text-sm font-bold">
                  <option value="standard">通常</option>
                  <option value="blank-english">英語を空欄</option>
                  <option value="blank-japanese">日本語を空欄</option>
                  <option value="red-english">英語を赤字</option>
                  <option value="red-japanese">日本語を赤字</option>
                </select>
              </label>

              <label className="block rounded-2xl border p-3">
                <span className="flex items-center justify-between text-xs font-black text-slate-500">
                  最大ページ数
                  <span>{pageLimit}ページまで</span>
                </span>
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  value={pageLimit}
                  onChange={(event) => setPageLimit(Number(event.target.value))}
                  className="mt-3 w-full"
                />
                <p className="mt-1 text-xs font-bold text-slate-400">1ページ50語で計算します。Personalは1回5ページまでです。</p>
              </label>

              <div className="grid gap-2 text-sm font-bold sm:grid-cols-2">
                {[
                  ["ランダム順", randomOrder, setRandomOrder],
                  ["ページ番号", showPageNo, setShowPageNo],
                ].map(([label, value, setter]) => (
                  <label key={String(label)} className="flex items-center justify-between rounded-2xl border px-3 py-2">
                    {label as string}
                    <input
                      type="checkbox"
                      checked={value as boolean}
                      onChange={(event) => (setter as (next: boolean) => void)(event.target.checked)}
                      className="h-5 w-5"
                    />
                  </label>
                ))}
              </div>

              <details className="rounded-2xl border bg-slate-50 p-3">
                <summary className="cursor-pointer list-none text-sm font-black text-slate-800">詳細設定</summary>
                <div className="mt-3 grid gap-2 text-sm font-bold">
                  <label className="flex items-center justify-between rounded-xl bg-white px-3 py-2">
                    日付を入れる
                    <input type="checkbox" checked={includeDate} onChange={(event) => setIncludeDate(event.target.checked)} className="h-5 w-5" />
                  </label>
                  <label className="flex items-center justify-between rounded-xl bg-white px-3 py-2">
                    組・番・氏名欄
                    <input type="checkbox" checked={showRecordFields} onChange={(event) => setShowRecordFields(event.target.checked)} className="h-5 w-5" />
                  </label>
                  <label className="flex items-center justify-between rounded-xl bg-white px-3 py-2">
                    Created by / 透かし
                    <input type="checkbox" checked={includeWatermark} onChange={(event) => setIncludeWatermark(event.target.checked)} className="h-5 w-5" />
                  </label>
                </div>

                {showRecordFields ? (
                  <div className="mt-3 rounded-2xl border bg-white p-3">
                    <p className="text-xs font-black text-slate-500">記入欄</p>
                    <div className="mt-3 grid gap-2">
                      <label className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold">
                        クラス欄
                        <input type="checkbox" checked={showClassField} onChange={(event) => setShowClassField(event.target.checked)} className="h-5 w-5" />
                      </label>
                      {showClassField ? <input value={studentClass} onChange={(event) => setStudentClass(event.target.value)} placeholder="例: 3-A" className="rounded-xl border bg-white px-3 py-2 text-sm" /> : null}
                      <label className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold">
                        番号欄
                        <input type="checkbox" checked={showNumberField} onChange={(event) => setShowNumberField(event.target.checked)} className="h-5 w-5" />
                      </label>
                      {showNumberField ? <input value={studentNumber} onChange={(event) => setStudentNumber(event.target.value)} placeholder="例: 12" className="rounded-xl border bg-white px-3 py-2 text-sm" /> : null}
                      <label className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold">
                        氏名欄
                        <input type="checkbox" checked={showNameField} onChange={(event) => setShowNameField(event.target.checked)} className="h-5 w-5" />
                      </label>
                      {showNameField ? <input value={studentName} onChange={(event) => setStudentName(event.target.value)} placeholder="空欄のままでも使えます" className="rounded-xl border bg-white px-3 py-2 text-sm" /> : null}
                    </div>
                  </div>
                ) : null}

                <div className="mt-3 rounded-2xl border bg-white p-3">
                  <button
                    type="button"
                    onClick={() => setShowLayoutTools((value) => !value)}
                    className="flex w-full items-center justify-between text-left text-sm font-black text-slate-800"
                  >
                    レイアウトを細かく調整
                    <span className="text-xs text-blue-600">{showLayoutTools ? "閉じる" : "開く"}</span>
                  </button>
                  <p className="mt-1 text-xs leading-5 text-slate-500">右のプレビュー上の色付き枠をドラッグしても動かせます。</p>
                  {showLayoutTools ? (
                    <div className="mt-3 grid gap-2">
                      <LayoutSlider label="タイトル 左右" value={titleOffsetX} onChange={setTitleOffsetX} />
                      <LayoutSlider label="タイトル 上下" value={titleOffsetY} onChange={setTitleOffsetY} min={-6} max={10} />
                      <LayoutSlider label="表 左右" value={gridOffsetX} onChange={setGridOffsetX} />
                      <LayoutSlider label="表 上下" value={gridOffsetY} onChange={setGridOffsetY} min={-10} max={10} />
                      {includeDate ? (
                        <>
                          <LayoutSlider label="日付 左右" value={dateOffsetX} onChange={setDateOffsetX} />
                          <LayoutSlider label="日付 上下" value={dateOffsetY} onChange={setDateOffsetY} />
                        </>
                      ) : null}
                      {showRecordFields ? (
                        <>
                          <LayoutSlider label="記入欄 左右" value={infoOffsetX} onChange={setInfoOffsetX} />
                          <LayoutSlider label="記入欄 上下" value={infoOffsetY} onChange={setInfoOffsetY} />
                        </>
                      ) : null}
                      {showPageNo ? (
                        <>
                          <LayoutSlider label="ページ番号 左右" value={pageNoOffsetX} onChange={setPageNoOffsetX} />
                          <LayoutSlider label="ページ番号 上下" value={pageNoOffsetY} onChange={setPageNoOffsetY} />
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </details>
            </div>

            {!isPaid && visibleWords.length > FREE_WORD_LIMIT ? (
              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-black text-amber-800">51語以上はPersonalプランが必要です</p>
                <p className="mt-1 text-xs leading-5 text-amber-700">
                  無料プランは1回{FREE_WORD_LIMIT}語まで。選択中は{visibleWords.length}語なので、印刷は先頭{FREE_WORD_LIMIT}語＋「見本」の透かし入りになります。全範囲をまとめて印刷するにはPersonal（初月無料）へ。
                </p>
                <Link
                  href="/pricing"
                  className="mt-3 inline-block rounded-xl bg-amber-600 px-4 py-2 text-xs font-black text-white hover:bg-amber-700"
                >
                  プランを見る
                </Link>
              </div>
            ) : null}

            <div className="mt-5 grid gap-2">
              <button
                onClick={openPrintPage}
                disabled={visibleWords.length === 0}
                className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:bg-slate-300"
              >
                単語テストを印刷
              </button>
              <button
                onClick={openAdvancedPrinter}
                disabled={visibleWords.length === 0}
                className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-black text-blue-700 hover:bg-blue-100 disabled:bg-slate-100 disabled:text-slate-300"
              >
                メイン画面の詳細作成で開く
              </button>
            </div>
          </div>

          <div className="min-w-0 rounded-3xl border bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-black text-blue-700">プレビュー</p>
                <h2 className="mt-1 text-xl font-black text-slate-950">実際の印刷イメージ</h2>
              </div>
              <p className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">
                {printedWordCount}語 / {previewPageCount}ページ
              </p>
            </div>
            <div className="mt-4 overflow-auto rounded-2xl border bg-slate-100 p-4">
              <div className="relative mx-auto bg-white shadow-sm" style={{ width: PREVIEW_WIDTH * PREVIEW_SCALE, height: PREVIEW_HEIGHT * PREVIEW_SCALE * previewPageCount }}>
                <iframe
                  title="単語テスト印刷プレビュー"
                  srcDoc={previewDoc}
                  aria-label="単語テスト印刷プレビュー"
                  className="origin-top-left border-0"
                  style={{ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT * previewPageCount, transform: `scale(${PREVIEW_SCALE})` }}
                />
                {false && (
                <div className="absolute inset-0" onMouseLeave={() => { if (dragging) setDragging(null); }}>
                  {(() => {
                    const ppMM = PREVIEW_SCALE * 3.78;
                    const hasInfoFields = showRecordFields && (showClassField || showNumberField || showNameField);
                    const startDrag = (type: DragTarget, event: ReactMouseEvent, ox: number, oy: number) => {
                      event.preventDefault();
                      setDragging(type);
                      setDragStart({ cx: event.clientX, cy: event.clientY, ox, oy });
                    };
                    const handleBase = "absolute flex items-center justify-center rounded border border-dashed text-[9px] font-black cursor-move select-none";
                    return (
                      <>
                        <div className={`${handleBase} border-blue-500 bg-blue-500/15 text-blue-700`} style={{ top: Math.round((9 + titleOffsetY) * ppMM), left: "12%", right: "12%", height: Math.round(13 * ppMM), transform: `translateX(${titleOffsetX * ppMM}px)` }} onMouseDown={(event) => startDrag("title", event, titleOffsetX, titleOffsetY)}>タイトル</div>
                        {includeDate ? <div className={`${handleBase} border-yellow-500 bg-yellow-400/20 text-yellow-700`} style={{ top: Math.round((9 + titleOffsetY + dateOffsetY) * ppMM), right: Math.max(2, Math.round((9 - dateOffsetX) * ppMM)), width: 56, height: Math.round(8 * ppMM) }} onMouseDown={(event) => startDrag("date", event, dateOffsetX, dateOffsetY)}>日付</div> : null}
                        <div className={`${handleBase} border-violet-500 bg-violet-500/15 text-violet-700`} style={{ top: Math.round((9 + 95 + gridOffsetY) * ppMM), left: "3%", right: "3%", height: Math.round(16 * ppMM), transform: `translateX(${gridOffsetX * ppMM}px)` }} onMouseDown={(event) => startDrag("grid", event, gridOffsetX, gridOffsetY)}>単語リスト</div>
                        {hasInfoFields ? <div className={`${handleBase} border-emerald-500 bg-emerald-500/15 text-emerald-700`} style={{ bottom: Math.round((28 - infoOffsetY) * ppMM), left: "5%", right: "5%", height: Math.round(10 * ppMM), transform: `translateX(${infoOffsetX * ppMM}px)` }} onMouseDown={(event) => startDrag("info", event, infoOffsetX, infoOffsetY)}>記入欄</div> : null}
                        {showPageNo ? <div className={`${handleBase} border-slate-500 bg-slate-500/15 text-slate-600`} style={{ bottom: Math.round((14 - pageNoOffsetY) * ppMM), left: "35%", right: "35%", height: Math.round(8 * ppMM), transform: `translateX(${pageNoOffsetX * ppMM}px)` }} onMouseDown={(event) => startDrag("pageNo", event, pageNoOffsetX, pageNoOffsetY)}>ページ番号</div> : null}
                      </>
                    );
                  })()}
                </div>
                )}
              </div>
            </div>
            <p className="mt-2 text-xs font-bold text-slate-400">メイン画面と同じレイアウトのプレビューです。細かい位置調整は「メイン画面の詳細作成で開く」から。</p>
          </div>
        </section>
      )}

      {false && activeTab === "test" && (
        <section className="mt-4 grid gap-4 lg:grid-cols-[360px_1fr]">
          <div className="min-w-0 rounded-3xl border bg-white p-5 shadow-sm">
            <p className="text-sm font-black text-blue-700">単語テスト</p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">印刷設定</h2>
            <div className="mt-5 space-y-3">
              <label className="block rounded-2xl border p-3">
                <span className="text-xs font-black text-slate-500">印刷タイトル</span>
                <input
                  value={customTitle}
                  onChange={(event) => setCustomTitle(event.target.value)}
                  placeholder={selectedUnit === "all" ? book?.title : `${book?.title} - ${selectedUnit}`}
                  className="mt-1 w-full bg-transparent text-sm font-bold outline-none"
                />
              </label>
              <label className="block rounded-2xl border p-3">
                <span className="text-xs font-black text-slate-500">形式</span>
                <select value={testType} onChange={(event) => setTestType(event.target.value as TestType)} className="mt-1 w-full bg-transparent text-sm font-bold">
                  <option value="test">問題PDF</option>
                  <option value="answer">解答PDF</option>
                  <option value="list">一覧PDF</option>
                </select>
              </label>
              <label className="block rounded-2xl border p-3">
                <span className="text-xs font-black text-slate-500">出題方向</span>
                <select value={testDirection} onChange={(event) => setTestDirection(event.target.value as TestDirection)} className="mt-1 w-full bg-transparent text-sm font-bold">
                  <option value="en-ja">英語 → 日本語</option>
                  <option value="ja-en">日本語 → 英語</option>
                </select>
              </label>
              <label className="block rounded-2xl border p-3">
                <span className="text-xs font-black text-slate-500">表示加工</span>
                <select value={printStyle} onChange={(event) => setPrintStyle(event.target.value as PrintStyle)} className="mt-1 w-full bg-transparent text-sm font-bold">
                  <option value="standard">通常</option>
                  <option value="blank-english">英語を空欄</option>
                  <option value="blank-japanese">日本語を空欄</option>
                  <option value="red-english">英語を赤字</option>
                  <option value="red-japanese">日本語を赤字</option>
                </select>
              </label>
              <label className="block rounded-2xl border p-3">
                <span className="text-xs font-black text-slate-500">作成ページ数</span>
                <select value={pageLimit} onChange={(event) => setPageLimit(Number(event.target.value))} className="mt-1 w-full bg-transparent text-sm font-bold">
                  <option value={1}>1ページ</option>
                  <option value={5}>最大5ページ</option>
                </select>
              </label>
              <div className="grid gap-2 text-sm font-bold">
                {[
                  ["ランダム順", randomOrder, setRandomOrder],
                  ["ページ番号", showPageNo, setShowPageNo],
                ].map(([label, value, setter]) => (
                  <label key={String(label)} className="flex items-center justify-between rounded-2xl border px-3 py-2">
                    {label as string}
                    <input
                      type="checkbox"
                      checked={value as boolean}
                      onChange={(event) => (setter as (next: boolean) => void)(event.target.checked)}
                      className="h-5 w-5"
                    />
                  </label>
                ))}
              </div>

              <details className="rounded-2xl border bg-slate-50 p-3">
                <summary className="cursor-pointer list-none text-sm font-black text-slate-800">
                  詳細設定
                </summary>
                <div className="mt-3 grid gap-2 text-sm font-bold">
                  <label className="flex items-center justify-between rounded-xl bg-white px-3 py-2">
                    日付
                    <input type="checkbox" checked={includeDate} onChange={(event) => setIncludeDate(event.target.checked)} className="h-5 w-5" />
                  </label>
                  <label className="flex items-center justify-between rounded-xl bg-white px-3 py-2">
                    組・番・氏名欄
                    <input type="checkbox" checked={showRecordFields} onChange={(event) => setShowRecordFields(event.target.checked)} className="h-5 w-5" />
                  </label>
                  <label className="flex items-center justify-between rounded-xl bg-white px-3 py-2">
                    Created by / 透かし
                    <input type="checkbox" checked={includeWatermark} onChange={(event) => setIncludeWatermark(event.target.checked)} className="h-5 w-5" />
                  </label>
                </div>

              {showRecordFields ? (
                <div className="rounded-2xl border bg-slate-50 p-3">
                  <p className="text-xs font-black text-slate-500">記入欄の詳細</p>
                  <div className="mt-3 grid gap-2">
                    <label className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm font-bold">
                      クラス欄
                      <input type="checkbox" checked={showClassField} onChange={(event) => setShowClassField(event.target.checked)} className="h-5 w-5" />
                    </label>
                    {showClassField ? (
                      <input value={studentClass} onChange={(event) => setStudentClass(event.target.value)} placeholder="例: 3-A" className="rounded-xl border bg-white px-3 py-2 text-sm" />
                    ) : null}
                    <label className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm font-bold">
                      番号欄
                      <input type="checkbox" checked={showNumberField} onChange={(event) => setShowNumberField(event.target.checked)} className="h-5 w-5" />
                    </label>
                    {showNumberField ? (
                      <input value={studentNumber} onChange={(event) => setStudentNumber(event.target.value)} placeholder="例: 12" className="rounded-xl border bg-white px-3 py-2 text-sm" />
                    ) : null}
                    <label className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm font-bold">
                      氏名欄
                      <input type="checkbox" checked={showNameField} onChange={(event) => setShowNameField(event.target.checked)} className="h-5 w-5" />
                    </label>
                    {showNameField ? (
                      <input value={studentName} onChange={(event) => setStudentName(event.target.value)} placeholder="空欄のままでも使えます" className="rounded-xl border bg-white px-3 py-2 text-sm" />
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="rounded-2xl border bg-slate-50 p-3">
                <button
                  type="button"
                  onClick={() => setShowLayoutTools((value) => !value)}
                  className="flex w-full items-center justify-between text-left text-sm font-black text-slate-800"
                >
                  詳細レイアウト調整
                  <span className="text-xs text-blue-600">{showLayoutTools ? "閉じる" : "開く"}</span>
                </button>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  メイン画面の印刷調整と同じように、印刷される位置を少しだけ動かせます。
                </p>
                {showLayoutTools ? (
                  <div className="mt-3 grid gap-2">
                    <LayoutSlider label="タイトル 左右" value={titleOffsetX} onChange={setTitleOffsetX} />
                    <LayoutSlider label="タイトル 上下" value={titleOffsetY} onChange={setTitleOffsetY} min={-6} max={10} />
                    <LayoutSlider label="表 左右" value={gridOffsetX} onChange={setGridOffsetX} />
                    <LayoutSlider label="表 上下" value={gridOffsetY} onChange={setGridOffsetY} min={-10} max={10} />
                    {includeDate ? (
                      <>
                        <LayoutSlider label="日付 左右" value={dateOffsetX} onChange={setDateOffsetX} />
                        <LayoutSlider label="日付 上下" value={dateOffsetY} onChange={setDateOffsetY} />
                      </>
                    ) : null}
                    {showRecordFields ? (
                      <>
                        <LayoutSlider label="記入欄 左右" value={infoOffsetX} onChange={setInfoOffsetX} />
                        <LayoutSlider label="記入欄 上下" value={infoOffsetY} onChange={setInfoOffsetY} />
                      </>
                    ) : null}
                    {showPageNo ? (
                      <>
                        <LayoutSlider label="ページ番号 左右" value={pageNoOffsetX} onChange={setPageNoOffsetX} />
                        <LayoutSlider label="ページ番号 上下" value={pageNoOffsetY} onChange={setPageNoOffsetY} />
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
              </details>
            </div>

            {!isPaid && visibleWords.length > FREE_WORD_LIMIT ? (
              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-black text-amber-800">51語以上はPersonalプランが必要です</p>
                <p className="mt-1 text-xs leading-5 text-amber-700">
                  無料プランは1回{FREE_WORD_LIMIT}語まで。選択中は{visibleWords.length}語なので、印刷は先頭{FREE_WORD_LIMIT}語＋「見本」の透かし入りになります。全範囲をまとめて印刷するにはPersonal（初月無料）へ。
                </p>
                <Link
                  href="/pricing"
                  className="mt-3 inline-block rounded-xl bg-amber-600 px-4 py-2 text-xs font-black text-white hover:bg-amber-700"
                >
                  プランを見る
                </Link>
              </div>
            ) : null}

            <div className="mt-5 grid gap-2">
              <button
                onClick={openPrintPage}
                disabled={visibleWords.length === 0}
                className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:bg-slate-300"
              >
                単語テストを印刷
              </button>
              <button
                onClick={openAdvancedPrinter}
                disabled={visibleWords.length === 0}
                className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-black text-blue-700 hover:bg-blue-100 disabled:bg-slate-100 disabled:text-slate-300"
              >
                メイン画面の詳細作成で開く
              </button>
            </div>
          </div>

          <div className="min-w-0 rounded-3xl border bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-black text-blue-700">プレビュー</p>
                <h2 className="mt-1 text-xl font-black text-slate-950">実際の印刷イメージ</h2>
              </div>
              <p className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">
                {Math.min(testWords.length, pageLimit * 50)}語 / 最大{pageLimit}ページ
              </p>
            </div>
            <div className="mt-4 overflow-auto rounded-2xl border bg-slate-100 p-4">
              <iframe
                title="単語テスト印刷プレビュー"
                srcDoc={previewDoc}
                className="mx-auto block h-[840px] w-[572px] rounded-xl bg-white shadow-sm"
              />
            </div>
          </div>
        </section>
      )}

      {activeTab === "quiz" && (
        <section className="mt-4 grid gap-4 lg:grid-cols-[320px_1fr]">
          <div className="rounded-3xl border bg-white p-5 shadow-sm">
            <p className="text-sm font-black text-blue-700">単語チェック</p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">選んだ範囲で解く</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              上の「使う範囲」で選んだ{visibleWords.length}語をそのまま使います。印刷用の設定は変えずに、画面上だけで練習できます。
            </p>
            <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-600">
              <p>対象: {selectedUnit === "all" ? "すべて" : selectedUnit}</p>
              <p className="mt-1">番号: {rangeStart || "-"} - {rangeEnd || "-"}</p>
              <p className="mt-1">語数: {visibleWords.length}語</p>
            </div>
          </div>
          <div className="min-w-0">
            <QuizPanel
              words={visibleWords.map((word) => ({
                no: word.no,
                english: word.english,
                japanese: word.japanese,
              }))}
            />
          </div>
        </section>
      )}

      {activeTab === "listen" && (
        <section className="mt-4 grid gap-4 lg:grid-cols-[360px_1fr]">
          <div className="rounded-3xl border bg-white p-5 shadow-sm">
            <p className="text-sm font-black text-blue-700">聞き流し</p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">再生設定</h2>
            <div className="mt-5 space-y-3">
              <label className="block rounded-2xl border p-3">
                <span className="text-xs font-black text-slate-500">モード</span>
                <select value={listeningMode} onChange={(event) => setListeningMode(event.target.value as ListeningMode)} className="mt-1 w-full bg-transparent text-sm font-bold">
                  <option value="listen">聞き流し: 英語 → 日本語</option>
                  <option value="test">テスト: 英語 → 答え表示</option>
                </select>
              </label>
              <label className="block rounded-2xl border p-3">
                <span className="text-xs font-black text-slate-500">意味の表示</span>
                <select value={meaningMode} onChange={(event) => setMeaningMode(event.target.value as MeaningMode)} className="mt-1 w-full bg-transparent text-sm font-bold">
                  <option value="main">メインの意味だけ</option>
                  <option value="all">意味を全部表示</option>
                </select>
              </label>
              <label className="block rounded-2xl border p-3">
                <span className="flex items-center justify-between text-xs font-black text-slate-500">
                  読み上げ速度
                  <span>x{listeningSpeed.toFixed(2)}</span>
                </span>
                <input
                  type="range"
                  min={0.7}
                  max={1.35}
                  step={0.05}
                  value={listeningSpeed}
                  onChange={(event) => setListeningSpeed(Number(event.target.value))}
                  className="mt-3 w-full"
                />
              </label>
              <label className="block rounded-2xl border p-3">
                <span className="flex items-center justify-between text-xs font-black text-slate-500">
                  単語の間隔
                  <span>{(listeningGapMs / 1000).toFixed(1)}秒</span>
                </span>
                <input
                  type="range"
                  min={200}
                  max={2000}
                  step={100}
                  value={listeningGapMs}
                  onChange={(event) => setListeningGapMs(Number(event.target.value))}
                  className="mt-3 w-full"
                />
              </label>
              <button
                onClick={openInListening}
                disabled={visibleWords.length === 0}
                className="w-full rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-black text-blue-700 hover:bg-blue-100 disabled:bg-slate-100 disabled:text-slate-300"
              >
                聞き流し専用ページで開く
              </button>
            </div>
          </div>

          <div className="rounded-3xl border bg-white p-5 shadow-sm">
            <div className="rounded-3xl border bg-gradient-to-br from-blue-50 to-white p-5 text-center">
              {listenWord ? (
                <>
                  <p className="text-xs font-black text-slate-400">
                    {listenIndex + 1} / {visibleWords.length} ・ No.{listenWord.no}
                  </p>
                  <div className="mt-5 min-h-[220px] rounded-3xl bg-white p-5 shadow-sm">
                    <p className="break-words text-[clamp(2.2rem,9vw,4.5rem)] font-black leading-tight text-slate-950">{listenWord.english}</p>
                    <p className={`mt-5 min-h-[72px] text-2xl font-black text-blue-700 transition ${showMeaning ? "opacity-100" : "opacity-0"}`}>
                      {displayMeaning}
                    </p>
                  </div>
                  <div className="mt-5 grid gap-2 sm:grid-cols-5">
                    <button onClick={() => goListen(-1)} className="rounded-2xl border bg-white px-4 py-3 text-sm font-black text-slate-700">前へ</button>
                    <button onClick={() => setShowMeaning((value) => !value)} className="rounded-2xl border bg-white px-4 py-3 text-sm font-black text-slate-700">答え表示</button>
                    <button onClick={() => speakWord(listenWord)} className="rounded-2xl border bg-white px-4 py-3 text-sm font-black text-slate-700">1語再生</button>
                    {isPlaying ? (
                      <button onClick={stopListening} className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white">停止</button>
                    ) : (
                      <button onClick={startAutoListening} className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white">連続再生</button>
                    )}
                    <button onClick={() => goListen(1)} className="rounded-2xl border bg-white px-4 py-3 text-sm font-black text-slate-700">次へ</button>
                  </div>
                </>
              ) : (
                <p className="py-12 text-sm font-bold text-slate-400">範囲に単語がありません。</p>
              )}
            </div>
          </div>
        </section>
      )}

      {false && activeTab === "listen" && (
        <section className="mt-4 grid gap-4 lg:grid-cols-[360px_1fr]">
          <div className="rounded-3xl border bg-white p-5 shadow-sm">
            <p className="text-sm font-black text-blue-700">聞き流し</p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">再生設定</h2>
            <div className="mt-5 space-y-3">
              <label className="block rounded-2xl border p-3">
                <span className="text-xs font-black text-slate-500">モード</span>
                <select value={listeningMode} onChange={(event) => setListeningMode(event.target.value as ListeningMode)} className="mt-1 w-full bg-transparent text-sm font-bold">
                  <option value="listen">聞き流し: 英語 → 日本語</option>
                  <option value="test">テスト: 英語 → 答え表示</option>
                </select>
              </label>
              <label className="block rounded-2xl border p-3">
                <span className="text-xs font-black text-slate-500">意味の表示</span>
                <select value={meaningMode} onChange={(event) => setMeaningMode(event.target.value as MeaningMode)} className="mt-1 w-full bg-transparent text-sm font-bold">
                  <option value="main">メインの意味だけ</option>
                  <option value="all">意味を全部表示</option>
                </select>
              </label>
              <label className="block rounded-2xl border p-3">
                <span className="text-xs font-black text-slate-500">読み上げ速度</span>
                <select value={listeningSpeed} onChange={(event) => setListeningSpeed(Number(event.target.value))} className="mt-1 w-full bg-transparent text-sm font-bold">
                  <option value={0.82}>ゆっくり</option>
                  <option value={1}>ふつう</option>
                  <option value={1.14}>少し速い</option>
                  <option value={1.28}>速い</option>
                </select>
              </label>
              <label className="block rounded-2xl border p-3">
                <span className="text-xs font-black text-slate-500">単語の間隔</span>
                <select value={listeningGapMs} onChange={(event) => setListeningGapMs(Number(event.target.value))} className="mt-1 w-full bg-transparent text-sm font-bold">
                  <option value={350}>短め</option>
                  <option value={650}>標準</option>
                  <option value={1100}>ゆっくり</option>
                </select>
              </label>
              <button
                onClick={openInListening}
                disabled={visibleWords.length === 0}
                className="w-full rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-black text-blue-700 hover:bg-blue-100 disabled:bg-slate-100 disabled:text-slate-300"
              >
                聞き流し専用ページで開く
              </button>
            </div>
          </div>

          <div className="rounded-3xl border bg-white p-5 shadow-sm">
            <div className="rounded-3xl border bg-gradient-to-br from-blue-50 to-white p-5 text-center">
              {listenWord ? (
                <>
                  <p className="text-xs font-black text-slate-400">
                    {listenIndex + 1} / {visibleWords.length} ・ No.{listenWord.no}
                  </p>
                  <div className="mt-5 min-h-[190px] rounded-3xl bg-white p-5 shadow-sm">
                    <p className="break-words text-4xl font-black leading-tight text-slate-950 sm:text-6xl">{listenWord.english}</p>
                    <p className={`mt-5 min-h-[64px] text-2xl font-black text-blue-700 transition ${showMeaning ? "opacity-100" : "opacity-0"}`}>
                      {displayMeaning}
                    </p>
                  </div>
                  <div className="mt-5 grid gap-2 sm:grid-cols-5">
                    <button onClick={() => goListen(-1)} className="rounded-2xl border bg-white px-4 py-3 text-sm font-black text-slate-700">
                      前へ
                    </button>
                    <button onClick={() => setShowMeaning((value) => !value)} className="rounded-2xl border bg-white px-4 py-3 text-sm font-black text-slate-700">
                      答え表示
                    </button>
                    <button onClick={() => speakWord(listenWord)} className="rounded-2xl border bg-white px-4 py-3 text-sm font-black text-slate-700">
                      1語再生
                    </button>
                    {isPlaying ? (
                      <button onClick={stopListening} className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white">
                        停止
                      </button>
                    ) : (
                      <button onClick={startAutoListening} className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white">
                        連続再生
                      </button>
                    )}
                    <button onClick={() => goListen(1)} className="rounded-2xl border bg-white px-4 py-3 text-sm font-black text-slate-700">
                      次へ
                    </button>
                  </div>
                </>
              ) : (
                <p className="py-12 text-sm font-bold text-slate-400">範囲に単語がありません。</p>
              )}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
