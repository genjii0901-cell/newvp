"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type MyWordbook = {
  id: string;
  title: string;
  description: string;
  wordCount: number;
  words: Array<{ no: number; english: string; japanese: string; unit: string | null }>;
};

export default function MyWordbooksPage() {
  const supabase = useMemo(() => createClient(), []);
  const [books, setBooks] = useState<MyWordbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    async function load() {
      if (!supabase) {
        setError("Supabase が未設定です。");
        setLoading(false);
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setLoggedIn(false);
        setLoading(false);
        return;
      }
      setLoggedIn(true);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setLoading(false);
        return;
      }

      const response = await fetch("/api/me/wordbooks", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(result.error ?? "マイ単語帳の読み込みに失敗しました。");
        setLoading(false);
        return;
      }

      setBooks(Array.isArray(result.wordbooks) ? result.wordbooks : []);
      setLoading(false);
    }

    load();
  }, [supabase]);

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-blue-700">Vocab Print Pro</p>
          <h1 className="text-2xl font-black text-slate-900">マイ単語帳</h1>
          <p className="mt-1 text-sm text-slate-500">
            自分で保存した単語帳を見直したり、聞き流しや印刷に進めます。
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/wordbooks" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">
            みんなの単語帳
          </Link>
          <Link href="/listening" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">
            聞き流し
          </Link>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/wordbooks" className="rounded-full border bg-white px-4 py-2 text-sm font-bold text-slate-700">
          みんなの単語帳
        </Link>
        <span className="rounded-full bg-blue-600 px-4 py-2 text-sm font-bold text-white">
          マイ単語帳
        </span>
      </div>

      {loading ? (
        <div className="mt-16 text-center text-slate-400">読み込み中...</div>
      ) : !loggedIn ? (
        <div className="mt-16 rounded-3xl border bg-white p-10 text-center">
          <p className="text-lg font-black text-slate-700">ログインするとマイ単語帳を見られます</p>
          <Link href="/#auth" className="mt-4 inline-block rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white">
            ログインする
          </Link>
        </div>
      ) : error ? (
        <div className="mt-6 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : books.length === 0 ? (
        <div className="mt-16 rounded-3xl border bg-white p-10 text-center">
          <p className="text-lg font-black text-slate-700">まだマイ単語帳はありません</p>
          <p className="mt-2 text-sm text-slate-500">
            トップページの「貼り付けから単語テストを作成」から保存できます。
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {books.map((book) => (
            <article key={book.id} className="rounded-3xl border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                  自作
                </span>
                <span className="text-xs text-slate-400">{book.wordCount}語</span>
              </div>
              <h2 className="mt-3 text-xl font-black text-slate-900">{book.title}</h2>
              <p className="mt-2 line-clamp-3 text-sm text-slate-500">
                {book.description || "自分で保存した単語帳です。"}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  href={`/listening?source=my&id=${encodeURIComponent(book.id)}`}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
                >
                  聞き流しへ
                </Link>
                <Link
                  href={`/?book=${encodeURIComponent(book.id)}`}
                  className="rounded-xl border px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  印刷で開く
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
