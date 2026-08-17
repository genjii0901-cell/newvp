"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Summary = {
  freeUsers: number;
  optedInUsers: number;
  emailReady: boolean;
  recentCampaigns: Array<{ id: string; subject: string; recipient_count: number; status: string; created_at: string; sent_at: string | null }>;
};

const initialBody = `Vocab Print Proをご利用いただき、ありがとうございます。

単語帳を選ぶだけで、単語テストの印刷・聞き流し・単語チェックができます。

無料でも1ページ・50語まで印刷できます。より多くの語を印刷したい、透かしなしで使いたい、苦手な単語を管理したい場合は、Personalプランを7日間無料でお試しいただけます。

https://www.vocabprint.com/
https://www.vocabprint.com/pricing`;

export default function MarketingEmailPanel() {
  const supabase = useMemo(() => createClient(), []);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [subject, setSubject] = useState("Vocab Print Proをご利用ありがとうございます");
  const [content, setContent] = useState(initialBody);
  const [testEmail, setTestEmail] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  async function headers(): Promise<Record<string, string>> {
    if (!supabase) return {};
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
  }

  async function load() {
    setLoading(true);
    const response = await fetch("/api/admin/marketing-email", { headers: await headers(), cache: "no-store" }).catch(() => null);
    const result = await response?.json().catch(() => ({}));
    if (response?.ok) setSummary(result);
    else setMessage(result?.message ?? "配信設定を読み込めませんでした。");
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function submit(action: "test" | "send") {
    if (action === "send" && !window.confirm("受信を許可したFree会員へ、この内容で送信します。送信後は取り消せません。続けますか？")) return;
    setSending(true);
    setMessage("");
    const response = await fetch("/api/admin/marketing-email", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await headers()) },
      body: JSON.stringify({ action, subject, content, testEmail, confirmation }),
    }).catch(() => null);
    const result = await response?.json().catch(() => ({}));
    setMessage(result?.message ?? "送信処理を完了できませんでした。");
    setSending(false);
    if (response?.ok) {
      if (action === "send") setConfirmation("");
      void load();
    }
  }

  return (
    <section className="mt-6 space-y-5">
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
        <h2 className="text-xl font-black text-slate-900">お知らせメール</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">対象は「お知らせを受け取る」を自分で選んだFree会員だけです。各メールには受信者ごとの配信停止リンクを自動で入れます。</p>
      </div>

      {message && <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700">{message}</p>}

      {loading ? <p className="text-sm text-slate-500">配信設定を読み込み中...</p> : summary && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border bg-white p-4 shadow-sm"><p className="text-xs font-bold text-slate-500">Free会員</p><p className="mt-1 text-2xl font-black">{summary.freeUsers}</p></div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4"><p className="text-xs font-bold text-emerald-700">配信対象</p><p className="mt-1 text-2xl font-black text-emerald-800">{summary.optedInUsers}</p></div>
            <div className={`rounded-2xl border p-4 ${summary.emailReady ? "border-blue-100 bg-blue-50" : "border-amber-200 bg-amber-50"}`}><p className="text-xs font-bold text-slate-500">Resend設定</p><p className="mt-1 text-sm font-black">{summary.emailReady ? "送信可能" : "未設定"}</p></div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <label className="block text-sm font-bold text-slate-700">件名<input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={160} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
              <label className="mt-4 block text-sm font-bold text-slate-700">本文<textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={8000} rows={14} className="mt-1 w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm leading-6" /></label>
              <p className="mt-2 text-xs text-slate-400">メール下部のサービス名・配信停止リンクは自動で追加されます。</p>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <h3 className="font-black">1. 自分宛てにテスト</h3>
                <input value={testEmail} onChange={(event) => setTestEmail(event.target.value)} type="email" placeholder="確認用メールアドレス" className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                <button onClick={() => void submit("test")} disabled={sending || !testEmail || !summary.emailReady} className="mt-3 w-full rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-bold text-blue-700 disabled:opacity-50">テストメールを送る</button>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
                <h3 className="font-black text-amber-900">2. 配信対象へ送信</h3>
                <p className="mt-2 text-xs leading-5 text-amber-800">対象: 受信を許可したFree会員 {summary.optedInUsers}名。まずテストメールで内容とリンクを確認してください。</p>
                <label className="mt-4 block text-xs font-bold text-amber-900">確認のため <code className="rounded bg-white px-1">SEND</code> と入力<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1 w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm" /></label>
                <button onClick={() => void submit("send")} disabled={sending || confirmation !== "SEND" || summary.optedInUsers === 0 || !summary.emailReady} className="mt-3 w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white hover:bg-emerald-700 disabled:bg-slate-300">{sending ? "送信中..." : `${summary.optedInUsers}名へ送信する`}</button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <h3 className="font-black">最近の送信</h3>
            <div className="mt-3 space-y-2">
              {summary.recentCampaigns.length === 0 ? <p className="text-sm text-slate-500">まだ送信履歴はありません。</p> : summary.recentCampaigns.map((campaign) => <div key={campaign.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm"><div className="min-w-0"><p className="truncate font-bold">{campaign.subject}</p><p className="text-xs text-slate-400">{new Date(campaign.created_at).toLocaleString("ja-JP")}</p></div><span className="shrink-0 text-xs font-bold text-slate-600">{campaign.recipient_count}名 / {campaign.status}</span></div>)}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
