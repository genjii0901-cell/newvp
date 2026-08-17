"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function NotificationsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [signedIn, setSignedIn] = useState(false);

  async function headers(): Promise<Record<string, string>> {
    if (!supabase) return {};
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
  }

  useEffect(() => {
    async function load() {
      if (!supabase) {
        setLoading(false);
        return;
      }
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setSignedIn(false);
        setLoading(false);
        return;
      }
      setSignedIn(true);
      const response = await fetch("/api/me/marketing-preferences", { headers: await headers(), cache: "no-store" }).catch(() => null);
      const result = await response?.json().catch(() => ({}));
      if (response?.ok) setEnabled(result.marketingEmailOptIn === true);
      else setMessage(result?.message ?? "設定を読み込めませんでした。");
      setLoading(false);
    }
    void load();
  }, [supabase]);

  async function save(next: boolean) {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/me/marketing-preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await headers()) },
      body: JSON.stringify({ marketingEmailOptIn: next }),
    }).catch(() => null);
    const result = await response?.json().catch(() => ({}));
    if (response?.ok) {
      setEnabled(next);
      setMessage(next ? "お知らせメールを受け取る設定にしました。" : "お知らせメールの配信を停止しました。");
    } else {
      setMessage(result?.message ?? "設定を変更できませんでした。");
    }
    setSaving(false);
  }

  return (
    <main className="mx-auto max-w-xl px-5 py-10 text-slate-900">
      <Link href="/account" className="text-sm font-bold text-blue-700 hover:underline">アカウントへ戻る</Link>
      <h1 className="mt-5 text-2xl font-black">お知らせメールの設定</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">新機能、学習のヒント、Vocab Print Proからのお知らせをメールで受け取るかを設定できます。いつでも停止できます。</p>
      <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
        {loading ? <p className="text-sm text-slate-500">読み込み中...</p> : !signedIn ? <p className="text-sm text-slate-600">設定するにはログインしてください。</p> : (
          <>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
              <input type="checkbox" checked={enabled} onChange={(event) => void save(event.target.checked)} disabled={saving} className="mt-0.5 h-4 w-4" />
              <span><strong className="block text-slate-900">Vocab Print Proのお知らせを受け取る</strong><span className="mt-1 block leading-6">料金案内だけを目的とする頻繁なメールは送りません。不要になった場合は、この画面またはメール末尾のリンクからいつでも停止できます。</span></span>
            </label>
            {message && <p className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700">{message}</p>}
          </>
        )}
      </section>
    </main>
  );
}
