"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

type Generation = {
  id: string;
  type: string;
  word_count: number;
  wordbook_id: string | null;
  wordbook_title: string | null;
  created_at: string;
};

const typeLabels: Record<string, { label: string; color: string }> = {
  list: { label: "一覧PDF", color: "bg-blue-50 text-blue-700" },
  test: { label: "問題PDF", color: "bg-amber-50 text-amber-700" },
  answer: { label: "解答PDF", color: "bg-emerald-50 text-emerald-700" },
};

export default function HistoryPage() {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [history, setHistory] = useState<Generation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) { setError("Supabaseが未設定です。"); setLoading(false); return; }
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => setUser(session?.user ?? null));
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !user) { if (user === null && !loading) setLoading(false); return; }
    loadHistory();
  }, [supabase, user]);

  async function loadHistory() {
    if (!supabase || !user) return;
    setLoading(true);
    const { data, error: err } = await supabase
      .from("pdf_generations")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (err) setError("履歴の取得に失敗しました。");
    else setHistory(data ?? []);
    setLoading(false);
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  const totalCount = history.length;
  const totalWords = history.reduce((s, h) => s + h.word_count, 0);
  const byType = history.reduce<Record<string, number>>((acc, h) => { acc[h.type] = (acc[h.type] ?? 0) + 1; return acc; }, {});

  if (!user && !loading) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-20 text-center">
        <p className="text-2xl">🔒</p>
        <p className="mt-4 font-bold text-slate-700">ログインが必要です</p>
        <Link href="/" className="mt-4 inline-block rounded-xl bg-blue-600 px-6 py-3 font-bold text-white">ログインへ</Link>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-5 py-8">
      <h1 className="text-2xl font-black text-slate-900">PDF生成履歴</h1>
      <p className="mt-1 text-sm text-slate-500">過去のPDF作成記録</p>

      {/* Stats */}
      {!loading && !error && history.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border bg-white p-4 text-center shadow-sm">
            <p className="text-3xl font-black text-blue-600">{totalCount}</p>
            <p className="mt-1 text-xs text-slate-500">合計生成数</p>
          </div>
          <div className="rounded-2xl border bg-white p-4 text-center shadow-sm">
            <p className="text-3xl font-black text-slate-700">{totalWords.toLocaleString()}</p>
            <p className="mt-1 text-xs text-slate-500">合計語数</p>
          </div>
          <div className="rounded-2xl border bg-white p-4 text-center shadow-sm">
            <p className="text-3xl font-black text-blue-500">{byType.list ?? 0}</p>
            <p className="mt-1 text-xs text-slate-500">一覧PDF</p>
          </div>
          <div className="rounded-2xl border bg-white p-4 text-center shadow-sm">
            <p className="text-3xl font-black text-amber-500">{byType.test ?? 0}</p>
            <p className="mt-1 text-xs text-slate-500">問題PDF</p>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="mt-12 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
          <p className="mt-3 text-sm text-slate-400">読み込み中...</p>
        </div>
      ) : history.length === 0 && !error ? (
        <div className="mt-16 text-center">
          <p className="text-5xl">📄</p>
          <p className="mt-4 text-lg font-black text-slate-700">まだ履歴がありません</p>
          <p className="mt-2 text-sm text-slate-500">PDFを作成すると、ここに記録されます</p>
          <Link href="/" className="mt-6 inline-block rounded-2xl bg-blue-600 px-6 py-3 font-black text-white">
            PDF作成ページへ
          </Link>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="border-b p-3 text-left">日時</th>
                <th className="border-b p-3 text-left">種類</th>
                <th className="border-b p-3 text-left">語数</th>
                <th className="border-b p-3 text-left">単語帳</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => {
                const t = typeLabels[item.type] ?? { label: item.type, color: "bg-slate-50 text-slate-600" };
                return (
                  <tr key={item.id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="p-3 text-slate-500">{formatDate(item.created_at)}</td>
                    <td className="p-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${t.color}`}>{t.label}</span>
                    </td>
                    <td className="p-3 font-bold text-slate-700">{item.word_count}語</td>
                    <td className="p-3 text-slate-500">
                      {item.wordbook_id ? (
                        <Link href={`/wordbooks/${item.wordbook_id}`} className="text-blue-600 hover:underline">
                          {item.wordbook_title ?? "単語帳"}
                        </Link>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
