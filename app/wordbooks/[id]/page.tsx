"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Plan = "free" | "personal" | "teacher";

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
  requiredPlan: Plan;
  words: Word[];
};

function planLabel(plan: Plan) {
  if (plan === "teacher") return "Teacher";
  if (plan === "personal") return "Personal";
  return "Free";
}

export default function WordbookDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [book, setBook] = useState<OfficialWordbook | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedUnit, setSelectedUnit] = useState("all");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");

  useEffect(() => {
    async function loadBook() {
      setLoading(true);
      const response = await fetch("/api/wordbooks/official");
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !Array.isArray(result.wordbooks)) {
        setError(result.message ?? "単語帳の読み込みに失敗しました。");
        setLoading(false);
        return;
      }

      const nextBook = result.wordbooks.find((item: OfficialWordbook) => item.id === id) ?? null;
      if (!nextBook) {
        setError("単語帳が見つかりませんでした。");
        setLoading(false);
        return;
      }

      setBook(nextBook);
      setRangeStart(String(nextBook.words[0]?.no ?? 1));
      setRangeEnd(String(nextBook.words[nextBook.words.length - 1]?.no ?? nextBook.words.length));
      setLoading(false);
    }

    loadBook().catch(() => {
      setError("単語帳の読み込みに失敗しました。");
      setLoading(false);
    });
  }, [id]);

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

  function openInPrinter() {
    if (!book || visibleWords.length === 0) return;

    const payload = {
      title:
        selectedUnit === "all"
          ? book.title
          : `${book.title} - ${selectedUnit}`,
      words: visibleWords.map((word) => ({
        no: word.no,
        english: word.english,
        japanese: word.japanese,
      })),
    };

    sessionStorage.setItem("vpp-import-words", JSON.stringify(payload));
    window.location.href = "/?import=1";
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-5 py-20 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
        <p className="mt-3 text-sm text-slate-400">読み込み中...</p>
      </div>
    );
  }

  if (error || !book) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-20 text-center">
        <p className="text-lg font-bold text-slate-700">{error || "単語帳が見つかりません。"}</p>
        <Link href="/wordbooks" className="mt-5 inline-block rounded-xl border px-4 py-2 text-sm font-bold">
          単語帳一覧へ戻る
        </Link>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/wordbooks" className="text-sm font-bold text-blue-600 hover:underline">
            単語帳一覧へ戻る
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <h1 className="text-2xl font-black text-slate-900">{book.title}</h1>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
              {planLabel(book.requiredPlan)}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            {book.description || "説明はまだありません。"}
          </p>
        </div>
        <button
          onClick={openInPrinter}
          disabled={visibleWords.length === 0}
          className="rounded-2xl bg-blue-600 px-5 py-3 font-black text-white hover:bg-blue-700 disabled:bg-slate-300"
        >
          この範囲を印刷する
        </button>
      </div>

      <section className="mt-6 rounded-3xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black">印刷する範囲を選ぶ</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div>
            <label className="text-sm font-bold">Unit</label>
            <select
              value={selectedUnit}
              onChange={(event) => setSelectedUnit(event.target.value)}
              className="mt-1 w-full rounded-xl border px-3 py-2"
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
              className="mt-1 w-full rounded-xl border px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm font-bold">終了番号</label>
            <input
              value={rangeEnd}
              onChange={(event) => setRangeEnd(event.target.value)}
              type="number"
              className="mt-1 w-full rounded-xl border px-3 py-2"
            />
          </div>
        </div>
        <p className="mt-4 text-sm text-slate-500">
          現在の対象: {visibleWords.length}語
        </p>
      </section>

      <section className="mt-6 overflow-hidden rounded-3xl border bg-white shadow-sm">
        <table className="w-full table-fixed border-collapse text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="w-16 border-b p-3 text-center">番号</th>
              <th className="w-32 border-b p-3 text-left">Unit</th>
              <th className="w-1/3 border-b p-3 text-left">英単語</th>
              <th className="border-b p-3 text-left">日本語</th>
            </tr>
          </thead>
          <tbody>
            {visibleWords.map((word) => (
              <tr key={`${word.no}-${word.english}`} className="border-b last:border-0">
                <td className="p-3 text-center font-bold text-slate-400">{word.no}</td>
                <td className="p-3 text-slate-500">{word.unit ?? "-"}</td>
                <td className="p-3 font-bold text-slate-900">{word.english}</td>
                <td className="p-3 text-slate-600">{word.japanese}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
