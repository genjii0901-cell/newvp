"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { buildWordbookPath, extractWordbookIdFromSlug } from "@/lib/wordbook-slug";

type Plan = "free" | "personal" | "teacher";
type DetailTab = "overview" | "test" | "listen" | "words";
type TestType = "list" | "test" | "answer";
type TestDirection = "en-ja" | "ja-en";

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

function buildQuickPrintHtml({
  title,
  words,
  type,
  direction,
}: {
  title: string;
  words: Word[];
  type: TestType;
  direction: TestDirection;
}) {
  const pageWords = words.slice(0, 50);
  const columns = chunkWords(pageWords, 25);
  const isJapaneseQuestion = direction === "ja-en";
  const heading =
    type === "list" ? `${title} 一覧` : type === "answer" ? `${title} 解答` : `${title} 問題`;
  const questionLabel = type === "list" ? "英語" : "問題";
  const answerLabel = type === "list" ? "日本語" : "解答欄";

  const tableHtml = columns
    .map((columnWords) => {
      const rows = columnWords
        .map((word) => {
          const question = isJapaneseQuestion ? word.japanese : word.english;
          const answer = isJapaneseQuestion ? word.english : word.japanese;
          const leftText = type === "list" ? word.english : question;
          const rightText = type === "test" ? "" : answer;
          return `
            <tr>
              <td class="p-no">${escapeHtml(word.no)}</td>
              <td class="p-word"><div class="p-fit"><span class="p-text one">${escapeHtml(leftText)}</span></div></td>
              <td class="p-meaning"><div class="p-fit"><span class="p-text two">${escapeHtml(rightText)}</span></div></td>
            </tr>`;
        })
        .join("");
      return `
        <table class="print-table">
          <thead>
            <tr>
              <th class="p-no">番号</th>
              <th class="p-word">${questionLabel}</th>
              <th class="p-meaning">${answerLabel}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`;
    })
    .join("");

  return `
    <div id="print-root">
      <section class="print-page">
        <div class="print-watermark">Vocab Print Pro</div>
        <div class="print-page-header">
          <div class="print-record-fields">
            <span>組</span><span>番</span><span>氏名</span>
          </div>
          <h1>${escapeHtml(heading)}</h1>
          <p></p>
        </div>
        <div class="print-grid">${tableHtml}</div>
        <div class="print-footer"><span>1/1</span><span>Created by Vocab Print Pro</span></div>
      </section>
    </div>`;
}

function speak(text: string, lang: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = lang.startsWith("en") ? 0.86 : 0.92;
  window.speechSynthesis.speak(utterance);
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
  const [randomOrder, setRandomOrder] = useState(false);
  const [listenIndex, setListenIndex] = useState(0);
  const [showMeaning, setShowMeaning] = useState(false);

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab === "overview" || tab === "test" || tab === "listen" || tab === "words") setActiveTab(tab);
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

  const listenWord = visibleWords[listenIndex] ?? null;

  useEffect(() => {
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

  function openQuickPrint() {
    if (!book || visibleWords.length === 0) return;
    const title = selectedUnit === "all" ? book.title : `${book.title} - ${selectedUnit}`;
    const html = buildQuickPrintHtml({
      title,
      words: testWords,
      type: testType,
      direction: testDirection,
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

  function playCurrentWord() {
    if (!listenWord) return;
    window.speechSynthesis?.cancel();
    speak(listenWord.english, /^[\x00-\x7F\s.,!?'-]+$/.test(listenWord.english) ? "en-US" : "ja-JP");
    window.setTimeout(() => speak(listenWord.japanese, "ja-JP"), 900);
  }

  function goListen(delta: number) {
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
    { key: "overview", label: "概要", hint: "単語帳の内容" },
    { key: "test", label: "単語テスト", hint: "PDF作成" },
    { key: "listen", label: "聞き流し", hint: "音声学習" },
    { key: "words", label: "単語一覧", hint: "中身を見る" },
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
              className={`min-w-[104px] rounded-2xl border px-3 py-2 text-left transition ${
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
        <section className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="grid gap-3 sm:grid-cols-3">
            <button
              onClick={() => setActiveTab("test")}
              className="rounded-3xl border bg-white p-5 text-left shadow-sm hover:border-blue-200 hover:bg-blue-50"
            >
              <p className="text-sm font-black text-blue-700">小テスト作成</p>
              <h2 className="mt-2 text-xl font-black text-slate-950">この単語帳で作る</h2>
              <p className="mt-2 text-sm leading-7 text-slate-500">まずは1ページの簡易PDF。細かい設定は自由作成へ送れます。</p>
            </button>
            <button
              onClick={() => setActiveTab("listen")}
              className="rounded-3xl border bg-white p-5 text-left shadow-sm hover:border-blue-200 hover:bg-blue-50"
            >
              <p className="text-sm font-black text-blue-700">聞き流し</p>
              <h2 className="mt-2 text-xl font-black text-slate-950">表示しながら学習</h2>
              <p className="mt-2 text-sm leading-7 text-slate-500">英語と日本語をカード表示しながら音声で確認できます。</p>
            </button>
            <button
              onClick={() => setActiveTab("words")}
              className="rounded-3xl border bg-white p-5 text-left shadow-sm hover:border-blue-200 hover:bg-blue-50"
            >
              <p className="text-sm font-black text-blue-700">単語一覧</p>
              <h2 className="mt-2 text-xl font-black text-slate-950">中身を確認</h2>
              <p className="mt-2 text-sm leading-7 text-slate-500">選択範囲の単語番号、単語、意味を確認できます。</p>
            </button>
          </div>

          <div className="rounded-3xl border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black text-slate-700">単語一覧プレビュー</h2>
              <button onClick={() => setActiveTab("words")} className="text-xs font-black text-blue-600">
                全体を見る
              </button>
            </div>
            <div className="mt-3 space-y-2 select-none">
              {visibleWords.slice(0, 8).map((word) => (
                <div key={`${word.no}-${word.english}`} className="grid grid-cols-[42px_1fr] gap-2 rounded-xl bg-slate-50 p-2 text-sm">
                  <span className="text-center font-black text-slate-400">{word.no}</span>
                  <span className="min-w-0">
                    <b className="block truncate text-slate-900">{word.english}</b>
                    <span className="block truncate text-xs text-slate-500">{word.japanese}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {activeTab === "test" && (
        <section className="mt-4 rounded-3xl border bg-white p-5 shadow-sm">
          <p className="text-sm font-black text-blue-700">単語テスト</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">この単語帳から小テストを作る</h2>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            専用ページではすぐ使える1ページPDFを作れます。赤字・ページ数・詳細レイアウトまで調整したい場合は自由作成で開いてください。
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <label className="rounded-2xl border p-3">
              <span className="text-xs font-black text-slate-500">形式</span>
              <select value={testType} onChange={(event) => setTestType(event.target.value as TestType)} className="mt-1 w-full bg-transparent text-sm font-bold">
                <option value="test">問題</option>
                <option value="answer">解答入り</option>
                <option value="list">一覧</option>
              </select>
            </label>
            <label className="rounded-2xl border p-3">
              <span className="text-xs font-black text-slate-500">出題</span>
              <select value={testDirection} onChange={(event) => setTestDirection(event.target.value as TestDirection)} className="mt-1 w-full bg-transparent text-sm font-bold">
                <option value="en-ja">英語 → 日本語</option>
                <option value="ja-en">日本語 → 英語</option>
              </select>
            </label>
            <label className="flex items-center justify-between rounded-2xl border p-3 text-sm font-bold">
              ランダム順
              <input type="checkbox" checked={randomOrder} onChange={(event) => setRandomOrder(event.target.checked)} className="h-5 w-5" />
            </label>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            <button
              onClick={openQuickPrint}
              disabled={visibleWords.length === 0}
              className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:bg-slate-300"
            >
              1ページPDFを作る
            </button>
            <button
              onClick={openAdvancedPrinter}
              disabled={visibleWords.length === 0}
              className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-black text-blue-700 hover:bg-blue-100 disabled:bg-slate-100 disabled:text-slate-300"
            >
              自由作成で開く
            </button>
            <button
              onClick={() => setActiveTab("words")}
              className="rounded-2xl border px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50"
            >
              単語一覧を確認
            </button>
          </div>
        </section>
      )}

      {activeTab === "listen" && (
        <section className="mt-4 rounded-3xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-black text-blue-700">聞き流し</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">この範囲を音声で確認する</h2>
            </div>
            <button
              onClick={openInListening}
              disabled={visibleWords.length === 0}
              className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-black text-blue-700 hover:bg-blue-100 disabled:bg-slate-100 disabled:text-slate-300"
            >
              詳細な聞き流し設定
            </button>
          </div>

          <div className="mt-5 rounded-3xl border bg-gradient-to-br from-blue-50 to-white p-5 text-center">
            {listenWord ? (
              <>
                <p className="text-xs font-black text-slate-400">
                  {listenIndex + 1} / {visibleWords.length} ・ No.{listenWord.no}
                </p>
                <div className="mt-5 min-h-[150px] rounded-3xl bg-white p-5 shadow-sm">
                  <p className="break-words text-4xl font-black leading-tight text-slate-950 sm:text-5xl">{listenWord.english}</p>
                  <p className={`mt-4 text-xl font-black text-blue-700 transition ${showMeaning ? "opacity-100" : "opacity-0"}`}>
                    {listenWord.japanese}
                  </p>
                </div>
                <div className="mt-5 grid gap-2 sm:grid-cols-4">
                  <button onClick={() => goListen(-1)} className="rounded-2xl border bg-white px-4 py-3 text-sm font-black text-slate-700">
                    前へ
                  </button>
                  <button onClick={() => setShowMeaning((value) => !value)} className="rounded-2xl border bg-white px-4 py-3 text-sm font-black text-slate-700">
                    答え表示
                  </button>
                  <button onClick={playCurrentWord} className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white">
                    音声再生
                  </button>
                  <button onClick={() => goListen(1)} className="rounded-2xl border bg-white px-4 py-3 text-sm font-black text-slate-700">
                    次へ
                  </button>
                </div>
              </>
            ) : (
              <p className="py-12 text-sm font-bold text-slate-400">範囲に単語がありません。</p>
            )}
          </div>
        </section>
      )}

      {activeTab === "words" && (
        <section className="mt-4 overflow-hidden rounded-3xl border bg-white shadow-sm">
          <div className="border-b bg-slate-50 px-4 py-3">
            <h2 className="text-sm font-black text-slate-700">単語一覧プレビュー</h2>
          </div>
          <div className="max-h-[520px] overflow-auto select-none">
            <table className="w-full min-w-[620px] table-fixed border-collapse text-sm">
              <thead className="bg-white text-slate-500">
                <tr>
                  <th className="w-16 border-b p-3 text-center">番号</th>
                  <th className="w-28 border-b p-3 text-left">Unit</th>
                  <th className="w-1/3 border-b p-3 text-left">単語</th>
                  <th className="border-b p-3 text-left">意味</th>
                </tr>
              </thead>
              <tbody>
                {visibleWords.slice(0, 300).map((word) => (
                  <tr key={`${word.no}-${word.english}`} className="border-b last:border-0">
                    <td className="p-3 text-center font-bold text-slate-400">{word.no}</td>
                    <td className="p-3 text-slate-500">{word.unit ?? "-"}</td>
                    <td className="p-3 font-bold text-slate-900">{word.english}</td>
                    <td className="p-3 text-slate-600">{word.japanese}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleWords.length > 300 ? (
              <p className="p-4 text-center text-xs font-bold text-slate-400">
                プレビューは先頭300語まで表示しています。印刷・聞き流しには選択範囲全体を使えます。
              </p>
            ) : null}
          </div>
        </section>
      )}
    </main>
  );
}
