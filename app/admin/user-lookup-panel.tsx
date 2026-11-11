"use client";

import { useState } from "react";

type Finding = { level: "error" | "warn" | "ok" | "info"; text: string };
type Result = {
  email: string;
  authUsers: Array<{ id: string; email: string; createdAt: string; lastSignInAt: string | null; emailConfirmedAt: string | null; providers: string[] }>;
  profile: { id: string; plan: string; role: string; trialUsed: boolean; stripeCustomerId: string | null } | null;
  siteSubscriptions: Array<Record<string, unknown>>;
  stripeSubscriptions: Array<{ id: string | null; status: string | null; plan: string | null; cancelAtPeriodEnd: boolean; currentPeriodEnd: string | null; trialEnd: string | null }>;
  stripeErrors: string[];
  findings: Finding[];
};

const LEVEL_STYLE: Record<Finding["level"], string> = {
  error: "border-red-200 bg-red-50 text-red-800",
  warn: "border-amber-200 bg-amber-50 text-amber-900",
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  info: "border-slate-200 bg-slate-50 text-slate-700",
};
const LEVEL_LABEL: Record<Finding["level"], string> = { error: "要対応", warn: "注意", ok: "問題なし", info: "参考" };

function date(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("ja-JP") : "なし";
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2 text-sm last:border-0">
      <dt className="font-bold text-slate-500">{label}</dt>
      <dd className="text-right font-black text-slate-900 break-all">{value}</dd>
    </div>
  );
}

export default function UserLookupPanel({ getHeaders }: { getHeaders: () => Promise<Record<string, string>> }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginUrl, setLoginUrl] = useState("");
  const [loginMessage, setLoginMessage] = useState("");
  const [copied, setCopied] = useState(false);

  async function createLoginLink(targetEmail: string) {
    if (!window.confirm(`${targetEmail} のアカウントでログインするための住所を作ります（1回だけ使えます）。よろしいですか？`)) return;
    setLoginBusy(true);
    setLoginMessage("");
    setLoginUrl("");
    setCopied(false);
    const response = await fetch("/api/admin/user-login-link", {
      method: "POST",
      headers: { ...(await getHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify({ email: targetEmail }),
      cache: "no-store",
    }).catch(() => null);
    const json = await response?.json().catch(() => null);
    setLoginBusy(false);
    if (!response?.ok || !json?.ok) {
      setLoginMessage(json?.message ?? "作れませんでした。管理者としてログインしているか確認してください。");
      return;
    }
    setLoginUrl(`${window.location.origin}/support-login#token_hash=${encodeURIComponent(json.tokenHash)}&email=${encodeURIComponent(json.email)}`);
  }

  async function copyLoginUrl() {
    await navigator.clipboard.writeText(loginUrl).then(() => setCopied(true)).catch(() => setCopied(false));
  }

  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setMessage("");
    setResult(null);
    setLoginUrl("");
    setLoginMessage("");
    const response = await fetch(`/api/admin/user-lookup?email=${encodeURIComponent(email.trim())}`, {
      headers: await getHeaders(),
      cache: "no-store",
    }).catch(() => null);
    const json = await response?.json().catch(() => null);
    setBusy(false);
    if (!response?.ok || !json?.ok) {
      setMessage(json?.message ?? "調査できませんでした。管理者としてログインしているか確認してください。");
      return;
    }
    setResult(json as Result);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <section className="rounded-3xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black">ユーザー調査</h2>
        <p className="mt-1 text-sm font-bold text-slate-500">「契約したのに使えない」という連絡があったとき、メールアドレスから原因の手がかりを調べます。表示だけで、データは変更しません。自分のプランを切り替えて試すときは<a href="/account#admin-trial" className="text-blue-700 underline">アカウント画面の「管理者の試用」</a>を使います。</p>
        <form onSubmit={search} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="user@example.com"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-xl border px-4 py-3 text-base font-bold sm:text-sm"
          />
          <button type="submit" disabled={busy || !email.trim()} className="rounded-xl bg-blue-700 px-6 py-3 text-sm font-black text-white disabled:opacity-50">
            {busy ? "調査中..." : "調べる"}
          </button>
        </form>
        {message ? <p role="alert" className="mt-3 text-sm font-bold text-red-700">{message}</p> : null}
      </section>

      {result ? (
        <>
          <section className="rounded-3xl border bg-white p-6 shadow-sm">
            <h3 className="font-black">原因の手がかり</h3>
            <ul className="mt-3 space-y-2">
              {result.findings.map((finding, index) => (
                <li key={index} className={`rounded-xl border p-3 text-sm font-bold leading-6 ${LEVEL_STYLE[finding.level]}`}>
                  <span className="mr-2 rounded-full bg-white/70 px-2 py-0.5 text-xs font-black">{LEVEL_LABEL[finding.level]}</span>
                  {finding.text}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs font-bold text-slate-400">自動判定による推定です。断定ではなく、確認の手がかりとして使ってください。</p>
          </section>

          {result.profile && result.profile.role !== "admin" ? (
            <section className="rounded-3xl border border-amber-300 bg-amber-50 p-6 shadow-sm">
              <h3 className="font-black text-amber-900">お客さんのアカウントで画面を確認する</h3>
              <p className="mt-1 text-sm font-bold leading-6 text-amber-900">
                このお客さんとしてログインし、同じ画面・同じ制限で不具合を確認できます。住所は1回だけ使え、しばらくすると使えなくなります。
              </p>
              <button
                type="button"
                onClick={() => createLoginLink(result.email)}
                disabled={loginBusy}
                className="mt-3 rounded-xl bg-amber-600 px-5 py-3 text-sm font-black text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {loginBusy ? "作成中..." : "ログイン用の住所を作る"}
              </button>
              {loginMessage ? <p role="alert" className="mt-3 text-sm font-bold text-red-700">{loginMessage}</p> : null}
              {loginUrl ? (
                <div className="mt-3 space-y-2">
                  <p className="text-sm font-bold text-amber-900">シークレットウィンドウ（Chromeなら Ctrl+Shift+N）に貼って開くと、いまの管理者ログインを残したまま確認できます。</p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input readOnly value={loginUrl} onFocus={(event) => event.currentTarget.select()} className="min-w-0 flex-1 rounded-xl border bg-white px-3 py-2 text-xs font-bold" />
                    <button type="button" onClick={copyLoginUrl} className="rounded-xl border border-amber-400 bg-white px-4 py-2 text-sm font-black text-amber-900">{copied ? "コピーしました" : "コピー"}</button>
                    <a href={loginUrl} className="rounded-xl border border-amber-400 bg-white px-4 py-2 text-center text-sm font-black text-amber-900">このまま開く（管理者ログインは外れます）</a>
                  </div>
                  <p className="text-xs font-bold text-red-700">お客さんの画面では、申し込み・解約・削除・単語帳の編集はしないでください（本物の操作になります）。</p>
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="rounded-3xl border bg-white p-6 shadow-sm">
            <h3 className="font-black">会員情報（サイト側）</h3>
            {result.authUsers.length === 0 ? <p className="mt-2 text-sm font-bold text-slate-500">登録が見つかりません。</p> : null}
            {result.authUsers.map((user) => (
              <dl key={user.id} className="mt-2">
                <Row label="登録日" value={date(user.createdAt)} />
                <Row label="最終ログイン" value={date(user.lastSignInAt)} />
                <Row label="メール確認" value={user.emailConfirmedAt ? `済み（${date(user.emailConfirmedAt)}）` : "未確認"} />
                <Row label="ログイン方法" value={user.providers.length ? user.providers.join(" / ") : "不明"} />
              </dl>
            ))}
            {result.profile ? (
              <dl className="mt-3 rounded-xl bg-slate-50 px-3">
                <Row label="プラン" value={result.profile.plan} />
                <Row label="権限" value={result.profile.role} />
                <Row label="7日間アクセスの利用済み" value={result.profile.trialUsed ? "はい" : "いいえ"} />
                <Row label="Stripe顧客ID" value={result.profile.stripeCustomerId ?? "なし"} />
              </dl>
            ) : null}
          </section>

          <section className="rounded-3xl border bg-white p-6 shadow-sm">
            <h3 className="font-black">契約情報（Stripe）</h3>
            {result.stripeErrors.length > 0 ? <p className="mt-2 text-sm font-bold text-amber-800">Stripeの照会で問題: {result.stripeErrors.join(" / ")}</p> : null}
            {result.stripeSubscriptions.length === 0 ? <p className="mt-2 text-sm font-bold text-slate-500">契約が見つかりません。</p> : null}
            {result.stripeSubscriptions.map((sub) => (
              <dl key={sub.id ?? Math.random()} className="mt-2 rounded-xl bg-slate-50 px-3">
                <Row label="状態" value={sub.status ?? "不明"} />
                <Row label="プラン" value={sub.plan ?? "不明"} />
                <Row label="次の更新・終了" value={date(sub.currentPeriodEnd)} />
                <Row label="期間終了で解約" value={sub.cancelAtPeriodEnd ? "はい" : "いいえ"} />
              </dl>
            ))}
          </section>
        </>
      ) : null}
    </div>
  );
}
