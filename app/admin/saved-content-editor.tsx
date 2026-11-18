"use client";

import { useEffect, useRef, useState } from "react";
import { emptyContent, QUESTION_KINDS, SEARCH_FIELDS, validateContent, type ContentKind, type SavedContent } from "@/lib/content-editor";

type Props = {
  kind: ContentKind;
  parentId: string;
  getHeaders: () => Promise<Record<string, string>>;
  revision: number;
  onChanged: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange: (busy: boolean) => void;
};
type Response = { ok: boolean; message?: string; items?: SavedContent[]; count?: number; pageSize?: number };
const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900";

/** <u>だけをReact要素にする。他のHTMLは実行せず、文字として表示する。 */
export function ContentText({ text }: { text: string }) {
  return <>{text.split(/(<u>[\s\S]*?<\/u>)/g).map((part, i) => part.startsWith("<u>") && part.endsWith("</u>") ? <u key={i}>{part.slice(3, -4)}</u> : <span key={i}>{part}</span>)}</>;
}

function Preview({ kind, item }: { kind: ContentKind; item: SavedContent }) {
  const [showAnswer, setShowAnswer] = useState(false);
  return <aside className="min-w-0 rounded-xl border border-blue-100 bg-blue-50 p-4">
    <p className="text-xs font-black text-blue-800">表示見本（管理者のみ）</p>
    {kind === "example" ? <>
      <p className="mt-3 text-xs font-bold text-slate-500">{item.word_number ? `No. ${item.word_number}　` : ""}{item.word_english}</p>
      <p className="mt-2 whitespace-pre-wrap break-words text-base font-bold text-slate-950">{item.sentence_en || "ここに例文が表示されます。"}</p>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-600">{item.sentence_ja || "日本語訳は未入力です。"}</p>
    </> : <>
      <p className="mt-3 text-xs font-bold text-blue-700">{QUESTION_KINDS[item.item_kind as keyof typeof QUESTION_KINDS] ?? "問題"}{item.unit ? ` ／ ${item.unit}` : ""}</p>
      <p className="mt-2 whitespace-pre-wrap break-words font-bold text-slate-950"><ContentText text={item.prompt || "ここに問題文が表示されます。"} /></p>
      {item.item_kind !== "qa" && item.choice_mode === "fixed" ? <ul className="mt-3 space-y-1 text-sm text-slate-700">{[item.answer, ...(item.wrong_choices ?? [])].filter(Boolean).map((c, i) => <li key={i} className="break-words rounded-lg border border-blue-100 bg-white px-3 py-2">{i + 1}. {c}</li>)}</ul> : null}
      {item.item_kind !== "qa" && item.choice_mode !== "fixed" ? <p className="mt-3 text-xs text-slate-500">{item.choice_mode === "pool" ? `同じタグ「${item.pool_tag || "未入力"}」` : "問題セット全体"}の答えから選択肢を作る設定です。この見本では候補を生成しません。</p> : null}
      <button type="button" onClick={() => setShowAnswer(!showAnswer)} className="mt-3 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700">{showAnswer ? "答えを隠す" : "答え・解説を見る"}</button>
      {showAnswer ? <div className="mt-3 whitespace-pre-wrap break-words border-t border-blue-200 pt-3 text-sm"><p className="font-black text-blue-900">答え: {item.answer || "未入力"}</p><p className="mt-2 text-slate-700">{item.explanation}</p></div> : null}
    </>}
    <p className="mt-4 text-[11px] leading-relaxed text-slate-500">この画面で確認しても公開されません。利用者向けの表示・出題は次の段階です。</p>
  </aside>;
}

export default function SavedContentEditor({ kind, parentId, getHeaders, revision, onChanged, onDirtyChange, onBusyChange }: Props) {
  const [items, setItems] = useState<SavedContent[]>([]);
  const [count, setCount] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [field, setField] = useState(Object.keys(SEARCH_FIELDS[kind])[0]);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState<SavedContent | null>(null);
  const [original, setOriginal] = useState("");
  const [preview, setPreview] = useState<SavedContent | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SavedContent | null>(null);
  const dirty = draft !== null && JSON.stringify(draft) !== original;
  const headersRef = useRef(getHeaders);
  const dirtyCallbackRef = useRef(onDirtyChange);
  useEffect(() => { headersRef.current = getHeaders; dirtyCallbackRef.current = onDirtyChange; });
  useEffect(() => { dirtyCallbackRef.current(dirty); return () => dirtyCallbackRef.current(false); }, [dirty]);
  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); }, [busy, onBusyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ kind, parentId, page: String(page), field, query });
    void (async () => {
      try {
        const headers = await headersRef.current();
        if (controller.signal.aborted) return;
        setLoading(true); setLoadError("");
        const res = await fetch(`/api/admin/content-editor?${params}`, { headers, cache: "no-store", signal: controller.signal });
        const data = await res.json() as Response;
        if (!res.ok || !data.ok) throw new Error(data.message || "保存内容を読み込めませんでした。");
        if (controller.signal.aborted) return;
        const total = data.count ?? 0;
        const size = data.pageSize ?? 20;
        if (page > 1 && page > Math.max(1, Math.ceil(total / size))) { setPage(Math.max(1, Math.ceil(total / size))); return; }
        setItems(data.items ?? []); setCount(total); setPageSize(size);
      } catch (e) { if (!controller.signal.aborted) { setItems([]); setLoadError(e instanceof Error ? e.message : "通信に失敗しました。"); } }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [kind, parentId, page, field, query, reload, revision]);

  function canLeave() { return !dirty || window.confirm("保存していない変更を破棄しますか？"); }
  function edit(item: SavedContent) {
    if (!canLeave()) return;
    setDraft(item); setOriginal(JSON.stringify(item)); setPreview(null); setPendingDelete(null); setMessage("");
  }
  function change(patch: Partial<SavedContent>) { setDraft((current) => current ? { ...current, ...patch } : current); }
  async function mutate(method: "POST" | "PATCH" | "DELETE", item: SavedContent) {
    setBusy(true); setMessage("");
    try {
      const res = await fetch("/api/admin/content-editor", { method, headers: { ...await headersRef.current(), "Content-Type": "application/json" }, body: JSON.stringify({ kind, parentId, id: item.id, item }), cache: "no-store" });
      const data = await res.json() as Response;
      if (!res.ok || !data.ok) throw new Error(data.message || "保存に失敗しました。");
      if (method !== "DELETE" || draft?.id === item.id) setDraft(null);
      if (preview?.id === item.id) setPreview(null);
      setPendingDelete(null);
      setMessage(method === "DELETE" ? "削除しました。" : "保存しました。");
      setReload((v) => v + 1); onChanged();
    } catch (e) { setMessage(e instanceof Error ? e.message : "通信に失敗しました。入力は残っています。"); }
    finally { setBusy(false); }
  }
  function save() {
    if (!draft) return;
    const result = validateContent(kind, draft);
    if (result.errors.length) { setMessage(result.errors.join("\n")); return; }
    void mutate(draft.id ? "PATCH" : "POST", draft);
  }
  const label = kind === "example" ? "例文" : "問題";
  return <section className="rounded-2xl border border-blue-200 bg-white p-4 shadow-sm" aria-label={`保存済みの${label}を確認・編集`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-black text-slate-900">保存済みの{label}を確認・編集</h3>
      <button type="button" disabled={busy || loading || !!loadError} onClick={() => edit(emptyContent(kind))} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40">＋ {label}を1件追加</button>
    </div>
    <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); setQuery(search); setPage(1); setReload((v) => v + 1); }}>
      <label className="text-xs font-bold text-slate-600">検索対象<select value={field} disabled={busy} onChange={(e) => { setField(e.target.value); setPage(1); }} className={inputClass}>{Object.entries(SEARCH_FIELDS[kind]).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
      <label className="min-w-0 flex-1 text-xs font-bold text-slate-600">検索語<input value={search} onChange={(e) => setSearch(e.target.value)} maxLength={200} className={inputClass} placeholder="空欄ならすべて表示" /></label>
      <button disabled={busy} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold disabled:opacity-40">検索</button>
    </form>
    {loadError ? <div role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{loadError}<button type="button" onClick={() => setReload((v) => v + 1)} className="ml-3 font-bold underline">再試行</button></div> : <>
      <p className="mt-3 text-xs font-bold text-slate-500" role="status">{loading ? "読み込み中…" : `${query ? "検索結果 " : "保存済み "}${count}件`}</p>
      {!loading && !items.length ? <p className="py-6 text-center text-sm text-slate-500">{query ? "一致する内容がありません。" : `保存済みの${label}はありません。取り込むか、1件追加してください。`}</p> : null}
      <div className="mt-2 divide-y divide-slate-100" aria-busy={loading}>
        {!loading ? items.map((item) => <article key={item.id} className="flex flex-wrap gap-3 py-3">
          <div className="min-w-0 flex-1 basis-48">
            <p className="text-xs font-bold text-slate-500">{kind === "example" ? `${item.word_number ? `No. ${item.word_number}　` : ""}${item.word_english ?? ""} ／ ${item.status === "published" ? "公開設定" : "下書き"}` : `${QUESTION_KINDS[item.item_kind as keyof typeof QUESTION_KINDS] ?? "問題"}${item.unit ? ` ／ ${item.unit}` : ""}`}</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm font-bold text-slate-900"><ContentText text={kind === "example" ? item.sentence_en ?? "" : item.prompt ?? ""} /></p>
            <p className="mt-1 whitespace-pre-wrap break-words text-xs text-slate-500">{kind === "example" ? item.sentence_ja : `答え: ${item.answer}`}</p>
          </div>
          <div className="flex items-start gap-2 text-xs font-bold">
            <button type="button" disabled={busy} onClick={() => { if (canLeave()) { setDraft(null); setPreview(item); } }} className="rounded-lg border px-3 py-2">表示見本</button>
            <button type="button" disabled={busy} onClick={() => edit(item)} className="rounded-lg border border-blue-200 px-3 py-2 text-blue-700">編集</button>
            <button type="button" disabled={busy} onClick={() => { if (canLeave()) { setDraft(null); setPendingDelete(item); } }} className="rounded-lg border border-red-200 px-3 py-2 text-red-600">削除</button>
          </div>
        </article>) : null}
      </div>
      {count > pageSize ? <div className="mt-3 flex items-center justify-center gap-4 text-xs font-bold"><button type="button" disabled={busy || loading || page === 1} onClick={() => setPage(page - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-30">前へ</button><span>{page} / {Math.max(1, Math.ceil(count / pageSize))}ページ</span><button type="button" disabled={busy || loading || page * pageSize >= count} onClick={() => setPage(page + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-30">次へ</button></div> : null}
    </>}
    {pendingDelete ? <div role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
      <p className="font-black">この{label}1件を削除しますか？</p><p className="mt-1 whitespace-pre-wrap break-words">{(pendingDelete.sentence_en ?? pendingDelete.prompt ?? "").slice(0, 200)}</p>
      <p className="mt-2 text-xs">削除は元に戻せません。必要な場合は先に画面上部のバックアップを保存してください。</p>
      <div className="mt-3 flex gap-2"><button type="button" disabled={busy} onClick={() => void mutate("DELETE", pendingDelete)} className="rounded-lg bg-red-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40">{busy ? "削除中…" : "この1件を削除する"}</button><button type="button" disabled={busy} onClick={() => setPendingDelete(null)} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold">やめる</button></div>
    </div> : null}
    {draft ? <div className="mt-4 grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3 lg:grid-cols-2">
      <fieldset disabled={busy} className="min-w-0 space-y-3">
        <legend className="mb-3 text-sm font-black text-slate-900">{draft.id ? `${label}の編集` : `${label}を1件追加`}</legend>
        {kind === "example" ? <>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-bold text-slate-600">単語番号<input className={inputClass} value={draft.word_number ?? ""} onChange={(e) => change({ word_number: e.target.value })} maxLength={100} /></label>
            <label className="text-xs font-bold text-slate-600">単語<input className={inputClass} value={draft.word_english ?? ""} onChange={(e) => change({ word_english: e.target.value })} maxLength={300} /></label>
          </div>
          <p className="text-xs text-slate-500">番号か単語を入力してください。両方入力すると、組み合わせを照合します。</p>
          <label className="block text-xs font-bold text-slate-600">例文（必須）<textarea className={inputClass} rows={3} maxLength={5000} value={draft.sentence_en ?? ""} onChange={(e) => change({ sentence_en: e.target.value })} /></label>
          <label className="block text-xs font-bold text-slate-600">日本語訳<textarea className={inputClass} rows={3} maxLength={5000} value={draft.sentence_ja ?? ""} onChange={(e) => change({ sentence_ja: e.target.value })} /></label>
        </> : <>
          <label className="block text-xs font-bold text-slate-600">種類<select className={inputClass} value={draft.item_kind} onChange={(e) => change({ item_kind: e.target.value })}>{Object.entries(QUESTION_KINDS).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
          <label className="block text-xs font-bold text-slate-600">問題文（必須）<textarea className={inputClass} rows={3} maxLength={10000} value={draft.prompt ?? ""} onChange={(e) => change({ prompt: e.target.value })} /></label>
          <p className="text-xs text-slate-500">穴埋めは（　）か ___、下線は &lt;u&gt;語句&lt;/u&gt; で書きます。</p>
          <label className="block text-xs font-bold text-slate-600">答え（必須）<textarea className={inputClass} rows={2} maxLength={5000} value={draft.answer ?? ""} onChange={(e) => change({ answer: e.target.value })} /></label>
          {draft.item_kind !== "qa" ? <>
            <label className="block text-xs font-bold text-slate-600">選択肢方式<select className={inputClass} value={draft.choice_mode} onChange={(e) => change({ choice_mode: e.target.value })}><option value="fixed">固定（誤答を入力）</option><option value="pool">同じタグから自動</option><option value="random">全体からランダム</option></select></label>
            {draft.choice_mode === "fixed" ? <label className="block text-xs font-bold text-slate-600">誤答（1行に1個、3個以上）<textarea className={inputClass} rows={3} value={(draft.wrong_choices ?? []).join("\n")} onChange={(e) => change({ wrong_choices: e.target.value.split("\n") })} /></label> : null}
          </> : null}
          <div className="grid grid-cols-2 gap-2"><label className="text-xs font-bold text-slate-600">タグ<input className={inputClass} maxLength={100} value={draft.pool_tag ?? ""} onChange={(e) => change({ pool_tag: e.target.value })} /></label><label className="text-xs font-bold text-slate-600">単元<input className={inputClass} maxLength={200} value={draft.unit ?? ""} onChange={(e) => change({ unit: e.target.value })} /></label></div>
          <label className="block text-xs font-bold text-slate-600">解説<textarea className={inputClass} rows={3} maxLength={10000} value={draft.explanation ?? ""} onChange={(e) => change({ explanation: e.target.value })} /></label>
        </>}
        <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={save} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-black text-white disabled:opacity-40">{busy ? "保存中…" : "保存する"}</button><button type="button" onClick={() => { if (canLeave()) setDraft(null); }} className="rounded-lg border bg-white px-3 py-2 text-sm font-bold">キャンセル</button>{dirty ? <span className="text-xs font-bold text-amber-700">未保存の変更があります</span> : null}</div>
      </fieldset>
      <Preview key={draft.id || "new"} kind={kind} item={draft} />
    </div> : preview ? <div className="mt-3"><Preview key={preview.id} kind={kind} item={preview} /><button type="button" className="mt-2 text-xs font-bold text-slate-600 underline" onClick={() => setPreview(null)}>見本を閉じる</button></div> : null}
    {message ? <p role="status" className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-100 p-3 text-sm font-bold text-slate-800">{message}</p> : null}
  </section>;
}
