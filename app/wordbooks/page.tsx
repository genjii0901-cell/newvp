"use client";

import Link from "next/link";
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
  coverImage?: string | null;
  requiredPlan: Plan;
  words: Word[];
};

function planLabel(plan: Plan) {
  if (plan === "teacher") return "Teacher";
  if (plan === "personal") return "Personal";
  return "Free";
}

export default function WordbooksPage() {
  const [books, setBooks] = useState<OfficialWordbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Plan | "all">("all");

  useEffect(() => {
    async function loadBooks() {
      setLoading(true);
      const response = await fetch("/api/wordbooks/official", { cache: "no-store" });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(result.message ?? "単語帳一覧の読み込みに失敗しました。");
        setLoading(false);
        return;
      }

      setBooks(Array.isArray(result.wordbooks) ? result.wordbooks : []);
      setLoading(false);
    }

    loadBooks().catch(() => {
      setError("単語帳一覧の読み込みに失敗しました。");
      setLoading(false);
    });
  }, []);

  const filteredBooks = useMemo(() => {
    if (filter === "all") return books;
    return books.filter((book) => book.requiredPlan === filter);
  }, [books, filter]);

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-blue-700">Vocab Print Pro</p>
          <h1 className="text-2xl font-black text-slate-900">みんなの単語帳</h1>
          <p className="mt-1 text-sm text-slate-500">
            公開中の単語帳を一覧で見て、そのまま印刷に進めます。
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">
            トップ
          </Link>
          <Link href="/admin" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">
            管理者画面
          </Link>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {(["all", "free", "personal", "teacher"] as const).map((value) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`rounded-full px-4 py-2 text-sm font-bold ${
              filter === value ? "bg-blue-600 text-white" : "border bg-white text-slate-700"
            }`}
          >
            {value === "all" ? "すべて" : planLabel(value)}
          </button>
        ))}
      </div>

      {error && <div className="mt-5 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="mt-16 text-center text-slate-400">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
          <p className="mt-3 text-sm">読み込み中...</p>
        </div>
      ) : filteredBooks.length === 0 ? (
        <div className="mt-16 rounded-3xl border bg-white p-10 text-center">
          <p className="text-lg font-black text-slate-700">まだ単語帳がありません</p>
          <p className="mt-2 text-sm text-slate-500">
            管理者画面から登録すると、ここに一覧表示されます。
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredBooks.map((book) => {
            const units = new Set(book.words.map((word) => word.unit).filter(Boolean)).size;
            return (
              <article key={book.id} className="overflow-hidden rounded-3xl border bg-white shadow-sm">
                {book.coverImage ? (
                  <img src={book.coverImage} alt={book.title} className="h-40 w-full object-cover" />
                ) : null}
                <div className="p-5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                      {planLabel(book.requiredPlan)}
                    </span>
                    <span className="text-xs text-slate-400">{book.words.length}語</span>
                  </div>
                  <h2 className="mt-3 text-xl font-black text-slate-900">{book.title}</h2>
                  <p className="mt-2 line-clamp-3 text-sm text-slate-500">
                    {book.description || "説明はまだありません。"}
                  </p>
                  <div className="mt-4 flex gap-4 text-xs text-slate-500">
                    <span>{units}ユニット</span>
                    <span>最初: {book.words[0]?.english ?? "-"}</span>
                  </div>
                  <Link
                    href={`/wordbooks/${book.id}`}
                    className="mt-5 block rounded-xl bg-blue-600 px-4 py-2 text-center text-sm font-bold text-white hover:bg-blue-700"
                  >
                    この単語帳を見る
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
