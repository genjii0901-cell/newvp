"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import OverlapTool from "@/app/overlap-tool";
import { createClient } from "@/lib/supabase/client";

type Book = { id: string; title: string; wordCount?: number };
type Word = { no: number; english: string; japanese: string };

export default function OverlapPageClient() {
  const supabase = useMemo(() => createClient(), []);
  const [books, setBooks] = useState<Book[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [plan, setPlan] = useState("free");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/wordbooks/official")
      .then((response) => response.json())
      .then((result) => {
        if (Array.isArray(result.wordbooks)) {
          setBooks(result.wordbooks.map((book: Book) => ({
            id: String(book.id),
            title: book.title,
            wordCount: book.wordCount,
          })));
        }
      })
      .catch(() => setMessage("単語帳を読み込めませんでした。時間をおいて再度お試しください。"));

    if (!supabase) return;
    void supabase.auth.getUser().then(async ({ data }) => {
      setUserId(data.user?.id ?? null);
      if (!data.user) return;
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return;
      const response = await fetch("/api/me/profile", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }).catch(() => null);
      const result = await response?.json().catch(() => ({}));
      if (!response?.ok) return;
      const profile = result.profile;
      setPlan(profile?.adminAccess === true ? "teacher" : profile?.plan === "teacher" || profile?.plan === "personal" ? profile.plan : "free");
    });
  }, [supabase]);

  function useWords(words: Word[], title: string) {
    const tsv = [
      "number\tenglish\tjapanese",
      ...words.map((word, index) => `${index + 1}\t${word.english}\t${word.japanese}`),
    ].join("\n");
    window.localStorage.setItem("vpp-pasted-words", tsv);
    window.localStorage.setItem("vpp-overlap-title", title);
    window.location.href = "/#pdf-builder";
  }

  async function saveWords(words: Word[], title: string, description: string) {
    if (!supabase || !userId) {
      setMessage("マイ単語帳への保存には無料会員登録が必要です。");
      return;
    }
    if (plan === "free") {
      setMessage("マイ単語帳への保存はPersonalまたはTeacherで利用できます。印刷用データへの反映は無料です。");
      return;
    }
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    const response = await fetch("/api/me/wordbooks", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title, description, words }),
    });
    const result = await response.json().catch(() => ({}));
    setMessage(response.ok && result.ok ? "マイ単語帳に保存しました。" : result.error ?? "保存できませんでした。");
  }

  return (
    <main className="min-h-screen bg-slate-50 px-3 py-6 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black text-blue-700">VOCABULARY COMPARE</p>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">単語帳かぶり調査</h1>
            <p className="mt-2 text-sm font-bold leading-6 text-slate-600">比べる単語帳を選び、共通する語や片方にだけある語を抽出します。</p>
          </div>
          <Link href="/" className="rounded-xl border bg-white px-4 py-2 text-sm font-black text-slate-700">単語テスト印刷へ</Link>
        </div>
        {message ? <p className="mt-4 rounded-xl bg-blue-50 p-3 text-sm font-bold text-blue-800">{message}</p> : null}
        <div className="mt-5">
          <OverlapTool books={books} isPaid={plan !== "free"} onUseWords={useWords} onSaveWords={saveWords} />
        </div>
      </div>
    </main>
  );
}
