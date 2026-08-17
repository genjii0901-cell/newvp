"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type MessageKind = "service" | "marketing";
type RecipientMode = "all" | "selected";
type FreeAccount = { id: string; email: string; marketingEmailOptIn: boolean };
type Summary = {
  freeUsers: number;
  optedInUsers: number;
  freeAccounts: FreeAccount[];
  emailReady: boolean;
  recentCampaigns: Array<{ id: string; subject: string; recipient_count: number; status: string; created_at: string; sent_at: string | null }>;
};

const serviceTemplate = `Vocab Print Proをご利用いただき、ありがとうございます。

サービスをより使いやすくするため、利用中に困った点や改善してほしい点があれば、サイト内のお問い合わせからお知らせください。

今後ともVocab Print Proをよろしくお願いいたします。`;

const marketingTemplate = `Vocab Print Proをご利用いただき、ありがとうございます。

単語帳を選ぶだけで、単語テストの印刷・聞き流し・単語チェックができます。

無料でも1ページ・50語まで印刷できます。より多くの語を印刷したい、透かしなしで使いたい、苦手な単語を管理したい場合は、Personalプランを7日間無料でお試しいただけます。

https://www.vocabprint.com/
https://www.vocabprint.com/pricing`;

export default function MarketingEmailPanel() {
  const supabase = useMemo(() => createClient(), []);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [messageKind, setMessageKind] = useState<MessageKind>("service");
  const [recipientMode, setRecipientMode] = useState<RecipientMode>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("Vocab Print Proからのお知らせ");
  const [content, setContent] = useState(serviceTemplate);
  const [testEmail, setTestEmail] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [serviceNoticeConfirmed, setServiceNoticeConfirmed] = useState(false);
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

  function changeKind(next: MessageKind) {
    setMessageKind(next);
    setConfirmation("");
    setServiceNoticeConfirmed(false);
    setContent(next === "service" ? serviceTemplate : marketingTemplate);
    setSubject(next === "service" ? "Vocab Print Proからのお知らせ" : "Vocab Print Proをご利用ありがとうございます");
    if (next === "marketing") setRecipientMode("all");
  }

  function toggleRecipient(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  const eligibleAccounts = useMemo(
    () => (summary?.freeAccounts ?? []).filter((account) => messageKind === "service" || account.marketingEmailOptIn),
    [summary, messageKind]
  );
  const filteredAccounts = useMemo(
    () => eligibleAccounts.filter((account) => account.email.toLowerCase().includes(query.trim().toLowerCase())),
    [eligibleAccounts, query]
  );
  const recipientCount = recipientMode === "all" ? eligibleAccounts.length : selectedIds.filter((id) => eligibleAccounts.some((account) => account.id === id)).length;
  const expectedConfirmation = messageKind === "service" ? "NOTICE" : "SEND";

  async function submit(action: "test" | "send") {
    if (action === "send" && !window.confirm(`${recipientCount}名へ、この内容で送信します。送信後は取り消せません。続けますか？`)) return;
    setSending(true);
    setMessage("");
    const response = await fetch("/api/admin/marketing-email", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await headers()) },
      body: JSON.stringify({ action, subject, content, testEmail, confirmation, messageKind, recipientMode, selectedProfileIds: selectedIds, serviceNoticeConfirmed }),
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
        <h2 className="text-xl font-black text-slate-900">メール配信</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">運営連絡はFree会員全員または選択した会員へ、新機能・学習ヒントは受信希望者へ送れます。用途に合う種類を選んでください。</p>
      </div>

      {message && <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700">{message}</p>}

      {loading ? <p className="text-sm text-slate-500">配信設定を読み込み中...</p> : summary && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border bg-white p-4 shadow-sm"><p className="text-xs font-bold text-slate-500">Free会員</p><p className="mt-1 text-2xl font-black">{summary.freeUsers}</p></div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4"><p className="text-xs font-bold text-emerald-700">受信希望者</p><p className="mt-1 text-2xl font-black text-emerald-800">{summary.optedInUsers}</p></div>
            <div className={`rounded-2xl border p-4 ${summary.emailReady ? "border-blue-100 bg-blue-50" : "border-amber-200 bg-amber-50"}`}><p className="text-xs font-bold text-slate-500">Resend設定</p><p className="mt-1 text-sm font-black">{summary.emailReady ? "送信可能" : "未設定"}</p></div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <h3 className="font-black">1. メールの種類</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => changeKind("service")} className={`rounded-xl border p-3 text-left ${messageKind === "service" ? "border-blue-600 bg-blue-50" : "border-slate-200"}`}><strong className="block text-sm">運営・アカウントのお知らせ</strong><span className="mt-1 block text-xs leading-5 text-slate-500">障害・仕様変更・利用確認など。料金、購入、無料体験への誘導は入れません。</span></button>
                <button type="button" onClick={() => changeKind("marketing")} className={`rounded-xl border p-3 text-left ${messageKind === "marketing" ? "border-blue-600 bg-blue-50" : "border-slate-200"}`}><strong className="block text-sm">新機能・学習ヒント</strong><span className="mt-1 block text-xs leading-5 text-slate-500">プラン案内を含められます。受信希望をオンにした方だけへ配信停止リンク付きで送ります。</span></button>
              </div>

              <h3 className="mt-6 font-black">2. 配信先</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => setRecipientMode("all")} className={`rounded-xl px-4 py-2 text-sm font-bold ${recipientMode === "all" ? "bg-blue-600 text-white" : "border bg-white text-slate-700"}`}>対象者へ一斉送信 ({eligibleAccounts.length}名)</button>
                <button type="button" onClick={() => setRecipientMode("selected")} className={`rounded-xl px-4 py-2 text-sm font-bold ${recipientMode === "selected" ? "bg-blue-600 text-white" : "border bg-white text-slate-700"}`}>会員を選んで送信</button>
              </div>
              {recipientMode === "selected" && (
                <div className="mt-3 rounded-xl border bg-slate-50 p-3">
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="メールアドレスで絞り込み" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
                  <div className="mt-3 max-h-56 space-y-1 overflow-y-auto pr-1">
                    {filteredAccounts.map((account) => <label key={account.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm"><span className="min-w-0 truncate font-bold text-slate-700">{account.email}</span><input type="checkbox" checked={selectedIds.includes(account.id)} onChange={() => toggleRecipient(account.id)} className="h-4 w-4" /></label>)}
                    {filteredAccounts.length === 0 && <p className="py-3 text-center text-sm text-slate-500">該当する会員がいません。</p>}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{recipientCount}名を選択中</p>
                </div>
              )}

              {messageKind === "service" && <label className="mt-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><input type="checkbox" checked={serviceNoticeConfirmed} onChange={(event) => setServiceNoticeConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4" /><span>このメールには、料金・購入・無料体験・有料プランへの誘導を含めません。運営またはアカウントに関するお知らせとして送ります。</span></label>}

              <label className="mt-5 block text-sm font-bold text-slate-700">件名<input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={160} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
              <label className="mt-4 block text-sm font-bold text-slate-700">本文<textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={8000} rows={13} className="mt-1 w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm leading-6" /></label>
              <p className="mt-2 text-xs text-slate-400">新機能・学習ヒントには、受信者ごとの配信停止リンクを自動で追加します。</p>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <h3 className="font-black">3. 自分宛てにテスト</h3>
                <input value={testEmail} onChange={(event) => setTestEmail(event.target.value)} type="email" placeholder="確認用メールアドレス" className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                <button onClick={() => void submit("test")} disabled={sending || !testEmail || !summary.emailReady} className="mt-3 w-full rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-bold text-blue-700 disabled:opacity-50">テストメールを送る</button>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
                <h3 className="font-black text-amber-900">4. 本送信</h3>
                <p className="mt-2 text-xs leading-5 text-amber-800">{recipientMode === "all" ? "対象者全員" : "選択した会員"} {recipientCount}名へ送信します。送信後は取り消せません。</p>
                <label className="mt-4 block text-xs font-bold text-amber-900">確認のため <code className="rounded bg-white px-1">{expectedConfirmation}</code> と入力<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1 w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm" /></label>
                <button onClick={() => void submit("send")} disabled={sending || confirmation !== expectedConfirmation || recipientCount === 0 || !summary.emailReady || (messageKind === "service" && !serviceNoticeConfirmed)} className="mt-3 w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white hover:bg-emerald-700 disabled:bg-slate-300">{sending ? "送信中..." : `${recipientCount}名へ送信する`}</button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-5 shadow-sm"><h3 className="font-black">最近の送信</h3><div className="mt-3 space-y-2">{summary.recentCampaigns.length === 0 ? <p className="text-sm text-slate-500">まだ送信履歴はありません。</p> : summary.recentCampaigns.map((campaign) => <div key={campaign.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm"><div className="min-w-0"><p className="truncate font-bold">{campaign.subject}</p><p className="text-xs text-slate-400">{new Date(campaign.created_at).toLocaleString("ja-JP")}</p></div><span className="shrink-0 text-xs font-bold text-slate-600">{campaign.recipient_count}名 / {campaign.status}</span></div>)}</div></div>
        </>
      )}
    </section>
  );
}
