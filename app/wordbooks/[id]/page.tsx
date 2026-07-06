"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatMeaning } from "@/lib/meaning";
import { primeSpeechVoices, speakText } from "@/lib/speech";
import { buildWordbookPath, extractWordbookIdFromSlug } from "@/lib/wordbook-slug";

type Plan = "free" | "personal" | "teacher";
type DetailTab = "overview" | "test" | "listen";
type TestType = "list" | "test" | "answer";
type TestDirection = "en-ja" | "ja-en";
type PrintStyle = "standard" | "blank-english" | "blank-japanese" | "red-english" | "red-japanese";
type MeaningMode = "main" | "all";
type ListeningMode = "listen" | "test";

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
  includeWatermark,
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
  includeWatermark: boolean;
}) {
  const perPage = 50;
  const visibleWords = words.slice(0, perPage * pageLimit);
  const pages = chunkWords(visibleWords, perPage);
  const isJapaneseQuestion = direction === "ja-en";
  const heading = type === "list" ? `${title} 一覧` : type === "answer" ? `${title} 解答` : `${title} 問題`;
  const dateLabel = includeDate ? formatPrintDate(new Date()) : "";
  const watermark = includeWatermark ? "Vocab Print Pro" : "";

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
        <section class="print-page${showRecordFields ? " has-info" : ""}">
          ${watermarkHtml}
          <div class="print-page-header">
            <h1>${escapeHtml(heading)}</h1>
            ${dateLabel ? `<div class="print-date">${escapeHtml(dateLabel)}</div>` : ""}
          </div>
          <div class="print-grid">${tables}</div>
          ${
            showRecordFields
              ? `<div class="print-info-box"><div class="print-info-fields"><div class="pif pif-sm"><span class="pif-label">組</span><span class="pif-value"></span></div><div class="pif pif-sm"><span class="pif-label">番</span><span class="pif-value"></span></div><div class="pif pif-lg"><span class="pif-label">氏名</span><span class="pif-value"></span></div></div></div>`
              : ""
          }
          <footer><span></span><span>${showPageNo ? `${pageIndex + 1}/${pages.length}` : ""}</span><span>Created by Vocab Print Pro</span></footer>
        </section>`;
    })
    .join("");

  return `<div id="print-root">${pagesHtml}</div>`;
}

export default function WordbookDetailPage() {
  const params = useParams();
  const slug = String(params.id ?? "");
  const lookupId = extractWordbookIdFromSlug(slug);

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
  const [includeWatermark, setIncludeWatermark] = useState(true);
  const [listenIndex, setListenIndex] = useState(0);
  const [showMeaning, setShowMeaning] = useState(false);
  const [meaningMode, setMeaningMode] = useState<MeaningMode>("main");
  const [listeningMode, setListeningMode] = useState<ListeningMode>("listen");
  const [isPlaying, setIsPlaying] = useState(false);
  const speechRunRef = useRef({ stopped: false, id: 0 });

  useEffect(() => {
    primeSpeechVoices();
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab === "test" || tab === "listen") setActiveTab(tab);
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

  const printPreviewWords = testWords.slice(0, 50);
  const listenWord = visibleWords[listenIndex] ?? null;
  const displayMeaning = listenWord ? formatMeaning(listenWord.japanese, meaningMode) : "";

  useEffect(() => {
    stopListening();
    setListenIndex(0);
    setShowMeaning(false);
  }, [rangeStart, rangeEnd, selectedUnit]);

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
    if (!book || visibleWords.length === 0) return;
    const title = selectedUnit === "all" ? book.title : `${book.title} - ${selectedUnit}`;
    const html = buildPrintHtml({
      title,
      words: testWords,
      type: testType,
      direction: testDirection,
      printStyle,
      pageLimit,
      showPageNo,
      includeDate,
      showRecordFields,
      includeWatermark,
    });
    sessionStorage.setItem(
      "vpp-print-job",
      JSON.stringify({
        html,
        title,
        sourceLabel: "wordbook-detail",
        createdAt: new Date().toISOString(),
      }),
    );
    window.location.href = "/print";
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
    await speakText(word.english, { preferred: "english", rate: 0.9, signal });
    if (signal.stopped) return;
    setShowMeaning(true);
    await speakText(formatMeaning(word.japanese, meaningMode), { preferred: "japanese", rate: 0.95, signal });
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
      await new Promise((resolve) => window.setTimeout(resolve, 450));
    }

    if (!run.stopped && speechRunRef.current.id === run.id) stopListening();
  }

  function goListen(delta: number) {
    stopListening();
    setShowMeaning(false);
    setListenIndex((current) => Math.min(Math.max(current + delta, 0), Math.max(visibleWords.length - 1, 0)));
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
    { key: "test", label: "単語テスト", hint: "PDF作成" },
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
        <div className="flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0">
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
          <div className="rounded-3xl border bg-white p-5 shadow-sm">
            <p className="text-sm font-black text-blue-700">単語テスト</p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">PDF設定</h2>
            <div className="mt-5 space-y-3">
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
                  ["日付", includeDate, setIncludeDate],
                  ["組・番・氏名欄", showRecordFields, setShowRecordFields],
                  ["Created by / 透かし", includeWatermark, setIncludeWatermark],
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
            </div>

            <div className="mt-5 grid gap-2">
              <button
                onClick={openPrintPage}
                disabled={visibleWords.length === 0}
                className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:bg-slate-300"
              >
                PDFプレビューへ進む
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

          <div className="rounded-3xl border bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-black text-blue-700">プレビュー</p>
                <h2 className="mt-1 text-xl font-black text-slate-950">最初の1ページ</h2>
              </div>
              <p className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">
                {Math.min(testWords.length, pageLimit * 50)}語 / 最大{pageLimit}ページ
              </p>
            </div>
            <div className="mt-4 overflow-hidden rounded-2xl border bg-slate-50 p-3">
              <div className="mx-auto max-w-[760px] bg-white p-4 shadow-sm">
                <div className="mb-3 text-center">
                  <h3 className="text-base font-black">{selectedUnit === "all" ? book.title : `${book.title} - ${selectedUnit}`}</h3>
                  <p className="text-xs text-slate-400">{includeDate ? formatPrintDate(new Date()) : ""}</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {chunkWords(printPreviewWords, 25).map((columnWords, columnIndex) => (
                    <table key={columnIndex} className="w-full table-fixed border-collapse text-[11px]">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="w-10 border p-1">番号</th>
                          <th className="w-24 border p-1">{testType === "list" ? "単語" : "問題"}</th>
                          <th className="border p-1">{testType === "test" ? "解答欄" : testType === "answer" ? "答え" : "意味"}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {columnWords.map((word) => {
                          const question = testDirection === "ja-en" ? word.japanese : word.english;
                          const answer = testDirection === "ja-en" ? word.english : word.japanese;
                          const left = testType === "list" ? word.english : question;
                          const right = testType === "list" ? word.japanese : testType === "answer" ? answer : "";
                          return (
                            <tr key={`${columnIndex}-${word.no}-${word.english}`}>
                              <td className="border p-1 text-center font-bold text-slate-400">{word.no}</td>
                              <td className={`border p-1 ${printStyle === "red-english" ? "font-black text-red-600" : "font-bold"}`}>
                                {printStyle === "blank-english" && (testType === "list" || testDirection === "en-ja") ? "________" : left}
                              </td>
                              <td className={`border p-1 ${printStyle === "red-japanese" ? "font-black text-red-600" : "text-slate-600"}`}>
                                {printStyle === "blank-japanese" && right ? "________" : right}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ))}
                </div>
                {showRecordFields ? <div className="mt-5 grid grid-cols-[1fr_1fr_2fr] gap-3 text-xs"><span className="border-b p-1">組</span><span className="border-b p-1">番</span><span className="border-b p-1">氏名</span></div> : null}
                <div className="mt-4 flex justify-between text-xs text-slate-400">
                  <span>{showPageNo ? "1/1" : ""}</span>
                  <span>{includeWatermark ? "Created by Vocab Print Pro" : ""}</span>
                </div>
              </div>
            </div>
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
