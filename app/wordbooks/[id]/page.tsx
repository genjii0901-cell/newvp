"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { buildWordbookPath, extractWordbookIdFromSlug } from "@/lib/wordbook-slug";

type Plan = "free" | "personal" | "teacher";
type DetailTab = "overview" | "test" | "listen" | "words";

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
        window.history.replaceState(null, "", canonicalPath);
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

  function openInPrinter() {
    if (!storeSelectedRange()) return;
    window.location.href = "/?import=1";
  }

  function openInListening() {
    if (!storeSelectedRange()) return;
    window.location.href = "/listening?import=1";
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
              無料利用では印刷は1ページまで。有料プランならより多くのページを作成できます。
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
        <section className="mt-4 grid gap-3 sm:grid-cols-3">
          <button
            onClick={() => setActiveTab("test")}
            className="rounded-3xl border bg-white p-5 text-left shadow-sm hover:border-blue-200 hover:bg-blue-50"
          >
            <p className="text-sm font-black text-blue-700">小テスト作成</p>
            <h2 className="mt-2 text-xl font-black text-slate-950">範囲を選んでPDFへ</h2>
            <p className="mt-2 text-sm leading-7 text-slate-500">一覧、問題、解答、空欄、赤字などの設定に進めます。</p>
          </button>
          <button
            onClick={() => setActiveTab("listen")}
            className="rounded-3xl border bg-white p-5 text-left shadow-sm hover:border-blue-200 hover:bg-blue-50"
          >
            <p className="text-sm font-black text-blue-700">聞き流し</p>
            <h2 className="mt-2 text-xl font-black text-slate-950">表示しながら学習</h2>
            <p className="mt-2 text-sm leading-7 text-slate-500">英語と意味を見ながら、音声学習ページへ進めます。</p>
          </button>
          <button
            onClick={() => setActiveTab("words")}
            className="rounded-3xl border bg-white p-5 text-left shadow-sm hover:border-blue-200 hover:bg-blue-50"
          >
            <p className="text-sm font-black text-blue-700">単語一覧</p>
            <h2 className="mt-2 text-xl font-black text-slate-950">中身を確認</h2>
            <p className="mt-2 text-sm leading-7 text-slate-500">選択範囲の単語番号、単語、意味を確認できます。</p>
          </button>
        </section>
      )}

      {activeTab === "test" && (
        <section className="mt-4 rounded-3xl border bg-white p-5 shadow-sm">
          <p className="text-sm font-black text-blue-700">単語テスト</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">この単語帳から小テストを作る</h2>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            今は詳細設定の多い作成画面へ選択範囲を渡します。次の段階で、このタブ内にPDFプレビューと詳細設定を統合できます。
          </p>
          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            <button
              onClick={openInPrinter}
              disabled={visibleWords.length === 0}
              className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:bg-slate-300"
            >
              単語テストを作る
            </button>
            <Link href="/pricing" className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-center text-sm font-black text-blue-700 hover:bg-blue-100">
              7日無料を確認
            </Link>
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
          <p className="text-sm font-black text-blue-700">聞き流し</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">この範囲を音声で確認する</h2>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            選択した範囲を聞き流しページへ渡します。英語→日本語、意味の表示、範囲指定を続けて使えます。
          </p>
          <button
            onClick={openInListening}
            disabled={visibleWords.length === 0}
            className="mt-5 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:bg-slate-300"
          >
            聞き流しで学習
          </button>
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
