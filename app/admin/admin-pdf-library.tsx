"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Printer, RefreshCw, Trash2, Upload } from "lucide-react";

type Book = { id: string; title: string; wordCount?: number };
type Asset = {
  id: string;
  title: string;
  description: string;
  wordbookId: string | null;
  wordbookTitle: string | null;
  kind: "generated" | "uploaded";
  visibility: "public" | "admin";
  fileName: string;
  sizeBytes: number;
  createdAt: string;
  downloadUrl?: string | null;
};

export default function AdminPdfLibrary({
  books,
  currentBookId,
  getHeaders,
  onStoreCurrent,
  onStoreBatch,
  busy,
}: {
  books: Book[];
  currentBookId: string;
  getHeaders: () => Promise<Record<string, string>>;
  onStoreCurrent: () => Promise<boolean>;
  onStoreBatch: (ids: string[]) => Promise<number>;
  busy: boolean;
}) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "admin">("public");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const selectedCount = selectedIds.length;
  const sortedBooks = useMemo(() => [...books].sort((a, b) => a.title.localeCompare(b.title, "ja")), [books]);

  async function load() {
    setLoading(true);
    const headers = await getHeaders();
    const response = await fetch("/api/admin/pdf-assets", { headers, cache: "no-store" }).catch(() => null);
    const result = await response?.json().catch(() => ({}));
    if (!response?.ok) setMessage(result?.message ?? "保存済みPDFを読み込めませんでした。");
    else setAssets(Array.isArray(result.assets) ? result.assets : []);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function upload() {
    if (!file) return;
    setLoading(true);
    setMessage("");
    const headers = await getHeaders();
    const form = new FormData();
    form.set("file", file);
    form.set("title", title);
    form.set("description", description);
    form.set("visibility", visibility);
    form.set("kind", "uploaded");
    const response = await fetch("/api/admin/pdf-assets", { method: "POST", headers, body: form }).catch(() => null);
    const result = await response?.json().catch(() => ({}));
    if (!response?.ok) setMessage(result?.message ?? "PDF教材を登録できませんでした。");
    else {
      setMessage("PDF教材を登録しました。");
      setFile(null);
      setTitle("");
      setDescription("");
      await load();
    }
    setLoading(false);
  }

  async function remove(asset: Asset) {
    if (!window.confirm(`「${asset.title}」を削除しますか？`)) return;
    const headers = await getHeaders();
    const response = await fetch("/api/admin/pdf-assets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ id: asset.id }),
    });
    const result = await response.json().catch(() => ({}));
    setMessage(response.ok ? "削除しました。" : result?.message ?? "削除できませんでした。");
    if (response.ok) await load();
  }

  return (
    <section className="rounded-3xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-blue-700">保存済みPDF</p>
          <h2 className="mt-1 text-xl font-black text-slate-950">PDF教材ライブラリ</h2>
          <p className="mt-1 text-sm text-slate-500">よく使う単語帳を一度PDFにして保存し、次回からそのまま開いて印刷できます。</p>
        </div>
        <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black text-slate-600">
          <RefreshCw size={15} /> 再読み込み
        </button>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-blue-50 p-4">
          <p className="text-sm font-black text-blue-950">単語帳から保存</p>
          <p className="mt-1 text-xs leading-5 text-blue-700">上の印刷設定を使って保存します。複数選択では各単語帳の全語を順番に作成します。</p>
          <button type="button" onClick={async () => { if (await onStoreCurrent()) { setMessage("現在のPDFを保存しました。"); await load(); } }} disabled={!currentBookId || busy} className="mt-3 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white disabled:bg-slate-300">
            現在の単語帳PDFを保存
          </button>
          <details className="mt-3 rounded-xl border border-blue-100 bg-white p-3">
            <summary className="cursor-pointer text-sm font-black text-slate-700">複数の単語帳をまとめて保存 {selectedCount ? `（${selectedCount}冊）` : ""}</summary>
            <div className="mt-3 max-h-56 space-y-1 overflow-auto pr-1">
              {sortedBooks.map((book) => (
                <label key={book.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs font-bold hover:bg-slate-50">
                  <input type="checkbox" checked={selectedIds.includes(book.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, book.id] : current.filter((id) => id !== book.id))} />
                  <span className="min-w-0 flex-1 truncate">{book.title}</span>
                  <span className="text-slate-400">{book.wordCount ?? 0}語</span>
                </label>
              ))}
            </div>
            <button type="button" onClick={async () => { const count = await onStoreBatch(selectedIds); setMessage(`${count}冊のPDFを保存しました。`); if (count) await load(); }} disabled={!selectedCount || busy} className="mt-3 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white disabled:bg-slate-300">
              選んだ単語帳を一括保存
            </button>
          </details>
        </div>

        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-sm font-black text-slate-900">PDFだけの教材を登録</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">単語データがない教材、解説資料、配布用PDFも登録できます。</p>
          <input type="file" accept="application/pdf,.pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="mt-3 block w-full text-xs" />
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="教材名（未入力ならファイル名）" className="mt-2 w-full rounded-xl border bg-white px-3 py-2 text-sm" />
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="説明（任意）" rows={2} className="mt-2 w-full rounded-xl border bg-white px-3 py-2 text-sm" />
          <label className="mt-2 flex items-center gap-2 text-xs font-bold text-slate-600">
            公開範囲
            <select value={visibility} onChange={(event) => setVisibility(event.target.value as "public" | "admin")} className="rounded-lg border bg-white px-2 py-1.5">
              <option value="public">利用者に公開</option>
              <option value="admin">管理者のみ</option>
            </select>
          </label>
          <button type="button" onClick={upload} disabled={!file || loading} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm font-black text-slate-700 disabled:text-slate-300">
            <Upload size={16} /> PDF教材を登録
          </button>
        </div>
      </div>

      {message ? <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">{message}</p> : null}

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {assets.length === 0 ? <p className="text-sm text-slate-400">保存済みPDFはまだありません。</p> : assets.map((asset) => (
          <div key={asset.id} className="flex items-center gap-3 rounded-2xl border p-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600"><FileText size={20} /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black text-slate-900">{asset.title}</p>
              <p className="truncate text-[11px] text-slate-400">{asset.wordbookTitle || "PDF教材"} ・ {(asset.sizeBytes / 1024 / 1024).toFixed(1)}MB ・ {asset.visibility === "public" ? "公開" : "管理者のみ"}</p>
            </div>
            {asset.downloadUrl ? <a href={asset.downloadUrl} target="_blank" rel="noreferrer" title="開いて印刷" className="rounded-lg p-2 text-blue-600 hover:bg-blue-50"><Printer size={17} /></a> : null}
            <button type="button" onClick={() => remove(asset)} title="削除" className="rounded-lg p-2 text-red-500 hover:bg-red-50"><Trash2 size={17} /></button>
          </div>
        ))}
      </div>
    </section>
  );
}

