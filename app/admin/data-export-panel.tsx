"use client";

import { useEffect, useState } from "react";

type Book = { id: string; title: string; wordCount?: number };
type ApiKey = { id: string; name: string; preview: string; createdAt: string; expiresAt: string; lastUsedAt: string | null };

const EXPORTS = [
  { kind: "wordbooks", label: "単語帳一覧", hint: "ID・タイトル・公開範囲・語数" },
  { kind: "words", label: "全単語帳の単語", hint: "単語帳名・番号・単語・意味・ユニット" },
  { kind: "accounts", label: "アカウント一覧", hint: "メール・プラン・購読状態（全件）" },
  { kind: "pdf-history", label: "PDF生成履歴", hint: "日時・単語帳・種類・語数（全件）" },
] as const;

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("ja-JP") : "-";
}

function filenameFrom(response: Response, fallback: string) {
  const header = response.headers.get("content-disposition") ?? "";
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {}
  }
  return fallback;
}

export default function DataExportPanel({
  books,
  getHeaders,
}: {
  books: Book[];
  getHeaders: () => Promise<Record<string, string>>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [bookId, setBookId] = useState("");
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [keyName, setKeyName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(90);
  const [issuedToken, setIssuedToken] = useState("");
  const [keyMessage, setKeyMessage] = useState("");
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  async function download(kind: string, id?: string) {
    const busyKey = id ? `${kind}:${id}` : kind;
    setBusy(busyKey);
    setMessage("");
    const query = new URLSearchParams({ kind, ...(id ? { id } : {}) });
    const response = await fetch(`/api/admin/export?${query}`, { headers: await getHeaders(), cache: "no-store" }).catch(() => null);
    setBusy(null);
    if (!response?.ok) {
      const result = await response?.json().catch(() => null);
      setMessage(result?.message ?? "CSVを作成できませんでした。");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filenameFrom(response, `${kind}.csv`);
    link.click();
    URL.revokeObjectURL(url);
  }

  async function loadKeys() {
    const response = await fetch("/api/admin/api-keys", { headers: await getHeaders(), cache: "no-store" }).catch(() => null);
    const result = await response?.json().catch(() => null);
    if (!response?.ok) {
      setKeyMessage(result?.message ?? "APIキー一覧を取得できませんでした。");
      return;
    }
    setKeys(result.keys ?? []);
  }

  useEffect(() => {
    void loadKeys();
  }, []);

  async function issueKey(event: React.FormEvent) {
    event.preventDefault();
    setKeyMessage("");
    setIssuedToken("");
    const response = await fetch("/api/admin/api-keys", {
      method: "POST",
      headers: { ...(await getHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify({ name: keyName, expiresInDays }),
    }).catch(() => null);
    const result = await response?.json().catch(() => null);
    if (!response?.ok) {
      setKeyMessage(result?.message ?? "APIキーを発行できませんでした。");
      return;
    }
    setIssuedToken(result.token);
    setKeyName("");
    await loadKeys();
  }

  async function revokeKey(key: ApiKey) {
    if (!confirm(`「${key.name}」を失効しますか？このキーを使っている連携は使えなくなります。`)) return;
    const response = await fetch(`/api/admin/api-keys?id=${encodeURIComponent(key.id)}`, {
      method: "DELETE",
      headers: await getHeaders(),
    }).catch(() => null);
    const result = await response?.json().catch(() => null);
    setKeyMessage(response?.ok ? "失効しました。" : result?.message ?? "失効できませんでした。");
    await loadKeys();
  }

  return (
    <div className="mt-6 space-y-6">
      <section className="rounded-3xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-black">CSV出力</h2>
        <p className="mt-1 text-sm text-slate-500">Excelでそのまま開ける形式（UTF-8 BOM付き）でダウンロードします。</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {EXPORTS.map((item) => (
            <button
              key={item.kind}
              type="button"
              onClick={() => void download(item.kind)}
              disabled={busy !== null}
              className="rounded-2xl border bg-slate-50 p-4 text-left hover:bg-blue-50 disabled:opacity-60"
            >
              <p className="text-sm font-black text-slate-800">{busy === item.kind ? "⏳ 作成中..." : `⬇ ${item.label}`}</p>
              <p className="mt-1 text-xs text-slate-500">{item.hint}</p>
            </button>
          ))}
        </div>

        <div className="mt-5 rounded-2xl border p-4">
          <p className="text-sm font-black text-slate-800">1冊ごとの単語一覧（番号・単語・意味）</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <select value={bookId} onChange={(event) => setBookId(event.target.value)} className="min-w-[240px] flex-1 rounded-xl border px-3 py-2 text-sm">
              <option value="">単語帳を選択</option>
              {books.map((book) => (
                <option key={book.id} value={book.id}>
                  {book.title}
                  {book.wordCount ? `（${book.wordCount}語）` : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void download("words", bookId)}
              disabled={!bookId || busy !== null}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300"
            >
              {busy === `words:${bookId}` ? "⏳ 作成中..." : "CSVをダウンロード"}
            </button>
          </div>
        </div>
        {message && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-800">{message}</p>}
      </section>

      <section className="rounded-3xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-black">AI・外部ツール連携（APIキー）</h2>
        <p className="mt-1 text-sm text-slate-500">
          単語帳データを読み取り専用で取得できるキーを発行します。会員情報やメールアドレスはAPIからは取得できません。
          キーは発行時に一度だけ表示され、サーバーにはハッシュのみ保存されます。
        </p>

        <form onSubmit={issueKey} className="mt-4 flex flex-wrap items-end gap-2">
          <label className="flex-1 min-w-[200px] text-xs font-bold text-slate-600">
            キーの名前（用途）
            <input value={keyName} onChange={(event) => setKeyName(event.target.value)} placeholder="例: ChatGPT連携" maxLength={60} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-normal" />
          </label>
          <label className="text-xs font-bold text-slate-600">
            有効期限
            <select value={expiresInDays} onChange={(event) => setExpiresInDays(Number(event.target.value))} className="mt-1 block rounded-xl border px-3 py-2 text-sm font-normal">
              {[7, 30, 90, 180, 365].map((days) => (
                <option key={days} value={days}>{days}日</option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={!keyName.trim()} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300">
            キーを発行
          </button>
        </form>

        {issuedToken && (
          <div className="mt-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-4">
            <p className="text-sm font-black text-emerald-800">発行しました。このキーは二度と表示されません。今すぐ安全な場所に保存してください。</p>
            <div className="mt-2 flex gap-2">
              <code className="flex-1 break-all rounded-xl bg-white p-2 text-xs">{issuedToken}</code>
              <button type="button" onClick={() => void navigator.clipboard.writeText(issuedToken)} className="rounded-xl border bg-white px-3 text-xs font-bold">コピー</button>
            </div>
          </div>
        )}
        {keyMessage && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-800">{keyMessage}</p>}

        <div className="mt-4 overflow-x-auto">
          {keys.length === 0 ? (
            <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">発行済みのキーはありません。</p>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs font-bold text-slate-400">
                  <th className="px-3 py-2">名前</th>
                  <th className="px-3 py-2">キー</th>
                  <th className="px-3 py-2">発行日</th>
                  <th className="px-3 py-2">有効期限</th>
                  <th className="px-3 py-2">最終利用</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => {
                  const expired = new Date(key.expiresAt).getTime() <= Date.now();
                  return (
                    <tr key={key.id} className="border-b last:border-b-0">
                      <td className="px-3 py-2 font-bold text-slate-800">{key.name}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-500">{key.preview}</td>
                      <td className="px-3 py-2 text-slate-600">{formatDate(key.createdAt)}</td>
                      <td className={`px-3 py-2 ${expired ? "font-bold text-red-600" : "text-slate-600"}`}>{expired ? "期限切れ" : formatDate(key.expiresAt)}</td>
                      <td className="px-3 py-2 text-slate-600">{formatDate(key.lastUsedAt)}</td>
                      <td className="px-3 py-2 text-right">
                        <button type="button" onClick={() => void revokeKey(key)} className="rounded-lg border border-red-200 px-3 py-1 text-xs font-bold text-red-600 hover:bg-red-50">失効</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <details className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm">
          <summary className="cursor-pointer font-black text-slate-700">使い方（AIツールへの設定例）</summary>
          <div className="mt-3 space-y-2 text-xs text-slate-600">
            <p>ヘッダー <code className="rounded bg-white px-1">Authorization: Bearer 発行したキー</code> を付けて呼び出します。</p>
            <p className="font-bold">単語帳一覧</p>
            <code className="block break-all rounded-xl bg-white p-2">GET {origin}/api/v1/wordbooks</code>
            <p className="font-bold">1冊分の単語（番号・単語・意味・ユニット）</p>
            <code className="block break-all rounded-xl bg-white p-2">GET {origin}/api/v1/wordbooks/単語帳ID/words</code>
            <p>末尾に <code className="rounded bg-white px-1">?format=csv</code> を付けるとCSVで返します。1キーあたり1分60回まで、認証失敗が続くと一時ロックされます。</p>
          </div>
        </details>
      </section>
    </div>
  );
}
