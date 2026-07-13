"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildPrintHtml as buildSharedPrintHtml,
  makeQuestion as makeSharedQuestion,
} from "@/lib/print/full-builder";

type OverlapBook = { id: string; title: string };
type Word = { no: number; english: string; japanese: string };
type BookState = "include" | "exclude";
type IncludeMode = "all" | "any";

type ResultRow = Word & {
  refs: Array<{ bookId: string; title: string; no: number }>;
};

const FREE_VISIBLE_ROWS = 8;

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
function toTsv(words: Word[]) {
  return [
    "number\tenglish\tjapanese",
    ...words.map((word, index) => `${index + 1}\t${word.english}\t${word.japanese}`),
  ].join("\n");
}

function escapeTitle(value: string) {
  return value.replace(/[<>"&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", '"': "&quot;", "&": "&amp;" }[c] ?? c));
}

export default function OverlapTool({
  books,
  isPaid,
  onUseWords,
  onSaveWords,
}: {
  books: OverlapBook[];
  isPaid: boolean;
  onUseWords?: (words: Word[], title: string) => void;
  onSaveWords?: (words: Word[], title: string) => Promise<void> | void;
}) {
  const [states, setStates] = useState<Record<string, BookState>>({});
  const [includeMode, setIncludeMode] = useState<IncludeMode>("all");
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [saveTitle, setSaveTitle] = useState("");
  const [wordsById, setWordsById] = useState<Record<string, Word[]>>({});
  const [loadingIds, setLoadingIds] = useState<string[]>([]);
  const [printing, setPrinting] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedIds = useMemo(() => Object.keys(states), [states]);
  const includeIds = useMemo(() => selectedIds.filter((id) => states[id] === "include"), [selectedIds, states]);
  const excludeIds = useMemo(() => selectedIds.filter((id) => states[id] === "exclude"), [selectedIds, states]);
  const allLoaded = selectedIds.every((id) => wordsById[id]);

  const titleById = (id: string) => books.find((book) => book.id === id)?.title ?? id;
  const resultTitle = `かぶり調査（${includeMode === "all" ? "選んだ全てに出る" : "選んだどれかに出る"}: ${includeIds.map(titleById).join("・") || "-"}${excludeIds.length ? ` / 除外: ${excludeIds.map(titleById).join("・")}` : ""}）`;
  const finalTitle = saveTitle.trim() || resultTitle;

  useEffect(() => {
    const missing = selectedIds.filter((id) => !wordsById[id] && !loadingIds.includes(id));
    if (missing.length === 0) return;

    setLoadingIds((prev) => [...prev, ...missing]);
    missing.forEach(async (id) => {
      try {
        const res = await fetch(`/api/wordbooks/official?id=${encodeURIComponent(id)}&includeWords=1`);
        const data = await res.json().catch(() => ({}));
        const book = Array.isArray(data.wordbooks)
          ? data.wordbooks.find((item: { id?: string | number }) => String(item.id) === String(id))
          : null;
        const words: Word[] = Array.isArray(book?.words)
          ? book.words
              .filter((word: { english?: string; japanese?: string }) => word.english && word.japanese)
              .map((word: { no?: number; english?: string; japanese?: string }, index: number) => ({
                no: Number(word.no) || index + 1,
                english: word.english ?? "",
                japanese: word.japanese ?? "",
              }))
          : [];
        setWordsById((prev) => ({ ...prev, [id]: words }));
      } catch {
        setWordsById((prev) => ({ ...prev, [id]: [] }));
      } finally {
        setLoadingIds((prev) => prev.filter((x) => x !== id));
      }
    });
  }, [selectedIds, wordsById, loadingIds]);

  const rows = useMemo<ResultRow[]>(() => {
    if (includeIds.length === 0 || !allLoaded) return [];

    const includeMaps = includeIds.map((id) => {
      const map = new Map<string, Word>();
      for (const word of wordsById[id] ?? []) {
        const key = normalizeKey(word.english);
        if (key && !map.has(key)) map.set(key, word);
      }
      return { id, map };
    });

    const excludeSet = new Set(
      excludeIds.flatMap((id) => (wordsById[id] ?? []).map((word) => normalizeKey(word.english)).filter(Boolean))
    );

    const candidateKeys =
      includeMode === "all"
        ? Array.from(includeMaps[0]?.map.keys() ?? [])
        : Array.from(new Set(includeMaps.flatMap(({ map }) => Array.from(map.keys()))));

    const out: ResultRow[] = [];
    for (const key of candidateKeys) {
      if (!key || excludeSet.has(key)) continue;
      const hits = includeMaps
        .map(({ id, map }) => {
          const word = map.get(key);
          return word ? { bookId: id, title: titleById(id), no: word.no, word } : null;
        })
        .filter(Boolean) as Array<{ bookId: string; title: string; no: number; word: Word }>;

      if (includeMode === "all" && hits.length !== includeIds.length) continue;
      if (hits.length === 0) continue;

      const first = hits[0].word;
      out.push({
        no: out.length + 1,
        english: first.english,
        japanese: first.japanese,
        refs: hits.map(({ bookId, title, no }) => ({ bookId, title, no })),
      });
    }
    return out;
  }, [includeIds, excludeIds, includeMode, wordsById, allLoaded]);

  const exportRows = isPaid ? rows : rows.slice(0, FREE_VISIBLE_ROWS);
  const visibleRows = exportRows;
  const lockedCount = isPaid ? 0 : Math.max(0, rows.length - FREE_VISIBLE_ROWS);

  const filteredBooks = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return books;
    return books.filter((book) => book.title.toLowerCase().includes(q));
  }, [books, search]);

  function setBookState(id: string, state: BookState | "ignore") {
    setStates((prev) => {
      const next = { ...prev };
      if (state === "ignore") delete next[id];
      else next[id] = state;
      return next;
    });
  }

  function toggleCandidate(id: string) {
    setStates((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = "include";
      return next;
    });
  }

  function resultWords() {
    return exportRows.map(({ english, japanese }, index) => ({ no: index + 1, english, japanese }));
  }

  function sendToPasteArea() {
    const words = resultWords();
    if (words.length === 0) return;
    navigator.clipboard?.writeText(toTsv(words)).catch(() => undefined);
    onUseWords?.(words, finalTitle);
  }

  async function saveToMyWordbook() {
    const words = resultWords();
    if (!onSaveWords || words.length === 0) return;
    setSaving(true);
    try {
      await onSaveWords(words, finalTitle);
    } finally {
      setSaving(false);
    }
  }

  function printResult() {
    if (!isPaid || rows.length === 0) return;
    setPrinting(true);
    try {
      const html = buildSharedPrintHtml({
        title: finalTitle,
        words: rows,
        type: "list",
        makeQuestion: (w) => makeSharedQuestion(w, "en-ja"),
        showPageNo: true,
        plan: "admin",
        printStyle: "standard",
        includeWatermark: false,
        showRecordFields: false,
        showClassField: false,
        showNumberField: false,
        showNameField: false,
        studentClass: "",
        studentNumber: "",
        studentName: "",
        includeDate: false,
        generatedAt: new Date(),
        userEmail: "",
      });
      const doc = `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>${escapeTitle(finalTitle)}</title></head><body style="margin:0"><div id="print-root">${html}</div></body></html>`;
      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;visibility:hidden;";
      document.body.appendChild(iframe);
      const idoc = iframe.contentDocument ?? iframe.contentWindow?.document;
      if (idoc) {
        idoc.open();
        idoc.write(doc);
        idoc.close();
        iframe.contentWindow?.focus();
        const previousTitle = document.title;
        document.title = finalTitle;
        setTimeout(() => {
          try { iframe.contentWindow?.print(); } catch { /* ignore */ }
          setTimeout(() => { document.title = previousTitle; }, 8_000);
          setTimeout(() => { try { iframe.remove(); } catch { /* ignore */ } }, 60_000);
        }, 400);
      } else {
        iframe.remove();
      }
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div className="mt-6 rounded-3xl border bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-blue-700">かぶり調査</p>
          <h3 className="text-lg font-black text-slate-900">単語帳を選んで、必要な単語だけ取り出す</h3>
          <p className="mt-1 max-w-3xl text-xs font-bold leading-6 text-slate-500">
            まず比べたい単語帳を選びます。次に「使う」「外す」を決めると、条件に合う単語だけを抽出できます。
            例: ターゲットに出ている語から、シス単にも出ている語を除外できます。
          </p>
        </div>
        {!isPaid ? <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">無料は先頭{FREE_VISIBLE_ROWS}語まで</span> : null}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <button
          type="button"
          onClick={() => setSelectorOpen((open) => !open)}
          className="flex items-center justify-between rounded-2xl border bg-slate-50 px-4 py-3 text-left text-sm font-black text-slate-700 hover:bg-slate-100"
        >
          <span>
            1. 比べる単語帳を選ぶ
            <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-xs text-blue-700">
              選択中 {selectedIds.length}冊
            </span>
          </span>
          <span className="text-xs text-slate-400">{selectorOpen ? "閉じる" : "開く"}</span>
        </button>
        {selectedIds.length > 0 ? (
          <button type="button" onClick={() => setStates({})} className="rounded-2xl border bg-white px-4 py-3 text-xs font-black text-slate-500 hover:bg-slate-50">
            選択をリセット
          </button>
        ) : null}
      </div>

      {selectorOpen ? (
        <div className="mt-3 rounded-2xl border bg-slate-50 p-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="単語帳名で検索"
            className="mb-2 w-full rounded-xl border bg-white px-3 py-2 text-sm"
          />
          <div className="max-h-72 overflow-auto rounded-xl border bg-white">
            {filteredBooks.map((book) => {
              const selected = Boolean(states[book.id]);
              return (
                <button
                  key={book.id}
                  type="button"
                  onClick={() => toggleCandidate(book.id)}
                  className={`flex w-full items-center justify-between gap-3 border-b p-3 text-left last:border-0 hover:bg-blue-50 ${selected ? "bg-blue-50" : "bg-white"}`}
                >
                  <span className="min-w-0 truncate text-sm font-bold text-slate-800">{book.title}</span>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${selected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                    {selected ? "選択中" : "選ぶ"}
                  </span>
                </button>
              );
            })}
            {filteredBooks.length === 0 ? (
              <p className="p-4 text-center text-sm font-bold text-slate-400">条件に合う単語帳が見つかりません。</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {selectedIds.length > 0 ? (
        <div className="mt-4 rounded-2xl border bg-white p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <p className="text-sm font-black text-slate-900">2. 抽出条件を決める</p>
              <p className="mt-1 text-xs font-bold text-slate-500">
                「使う」は結果に含める単語帳、「外す」は結果から除外する単語帳です。
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-1 text-xs font-black">
              <button
                type="button"
                onClick={() => setIncludeMode("all")}
                className={`rounded-xl px-3 py-2 ${includeMode === "all" ? "bg-blue-600 text-white" : "text-slate-600"}`}
              >
                使う単語帳すべてに出る語
              </button>
              <button
                type="button"
                onClick={() => setIncludeMode("any")}
                className={`rounded-xl px-3 py-2 ${includeMode === "any" ? "bg-blue-600 text-white" : "text-slate-600"}`}
              >
                使う単語帳のどれかに出る語
              </button>
            </div>
          </div>
          <div className="mt-3 grid gap-2">
            {selectedIds.map((id) => {
              const state = states[id];
              return (
                <div key={id} className="grid gap-2 rounded-2xl bg-slate-50 p-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <p className="truncate text-sm font-bold text-slate-800">{titleById(id)}</p>
                  <div className="grid grid-cols-3 rounded-xl bg-white p-1 text-xs font-black">
                    <button
                      type="button"
                      onClick={() => setBookState(id, "include")}
                      className={`rounded-lg px-3 py-1.5 ${state === "include" ? "bg-blue-600 text-white" : "text-slate-500"}`}
                    >
                      使う
                    </button>
                    <button
                      type="button"
                      onClick={() => setBookState(id, "exclude")}
                      className={`rounded-lg px-3 py-1.5 ${state === "exclude" ? "bg-rose-500 text-white" : "text-slate-500"}`}
                    >
                      外す
                    </button>
                    <button
                      type="button"
                      onClick={() => setBookState(id, "ignore")}
                      className="rounded-lg px-3 py-1.5 text-slate-500 hover:bg-slate-100"
                    >
                      選択解除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-xs font-bold leading-6 text-slate-600">
        <span className="font-black text-slate-800">抽出条件:</span>{" "}
        <span className="text-blue-700">{includeIds.length ? includeIds.map(titleById).join(" / ") : "使う単語帳を選択"}</span>
        <span> {includeMode === "all" ? "すべてに出ている単語" : "のどれかに出ている単語"}</span>
        {excludeIds.length ? <span>から、<span className="text-rose-600">{excludeIds.map(titleById).join(" / ")}</span> に出ている単語を外す</span> : null}
        {selectedIds.length > 0 ? (
          <button type="button" onClick={() => setStates({})} className="ml-3 text-slate-400 underline">
            条件をクリア
          </button>
        ) : null}
      </div>

      {rows.length > 0 ? (
        <label className="mt-3 block rounded-2xl border bg-white p-3">
          <span className="text-xs font-black text-slate-500">結果の単語帳名</span>
          <input
            value={saveTitle}
            onChange={(event) => setSaveTitle(event.target.value)}
            placeholder={resultTitle}
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
          />
        </label>
      ) : null}

      <div className="mt-4">
        {includeIds.length === 0 ? (
          <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">
            まず「使う」にする単語帳を1冊以上選んでください。
          </p>
        ) : !allLoaded ? (
          <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">単語を読み込み中...</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-black text-slate-700">抽出結果 {rows.length}語</p>
              {rows.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={sendToPasteArea} className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 hover:bg-blue-100">
                    貼り付け欄に入れる
                  </button>
                  <button type="button" onClick={() => onUseWords?.(resultWords(), finalTitle)} className="rounded-xl border bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">
                    印刷設定で使う
                  </button>
                  <button type="button" onClick={saveToMyWordbook} disabled={saving} className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-100 disabled:bg-slate-100 disabled:text-slate-400">
                    {saving ? "保存中..." : "マイ単語帳として保存"}
                  </button>
                  {isPaid ? (
                    <button type="button" onClick={printResult} disabled={printing} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white hover:bg-blue-700 disabled:bg-slate-300">
                      この結果を印刷
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="mt-2 max-h-80 overflow-auto rounded-2xl border select-none" onCopy={(event) => event.preventDefault()} onContextMenu={(event) => event.preventDefault()}>
              <table className="w-full table-fixed border-collapse text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="w-12 border-b p-2 text-center">#</th>
                    <th className="w-[24%] border-b p-2 text-left">単語</th>
                    <th className="border-b p-2 text-left">意味</th>
                    <th className="hidden w-[32%] border-b p-2 text-left md:table-cell">出ていた単語帳</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr key={`${row.no}-${row.english}`} className="border-b last:border-0">
                      <td className="p-2 text-center font-bold text-slate-400">{row.no}</td>
                      <td className="p-2 font-bold text-slate-900">{row.english}</td>
                      <td className="p-2 text-slate-600"><span className="block truncate">{row.japanese}</span></td>
                      <td className="hidden p-2 md:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {row.refs.map((ref) => (
                            <span key={`${row.english}-${ref.bookId}`} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                              {ref.title} #{ref.no}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 ? (
                    <tr><td colSpan={4} className="p-6 text-center text-sm font-bold text-slate-400">この条件に合う単語はありません。</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {lockedCount > 0 ? (
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center">
                <p className="text-sm font-black text-amber-800">残り{lockedCount}語はPersonalで見られます</p>
                <p className="mt-1 text-xs font-bold text-amber-700">
                  無料版は結果を先頭{FREE_VISIBLE_ROWS}語まで表示します。全部見て保存・印刷するにはPersonalをご利用ください。
                </p>
                <a href="/pricing" className="mt-3 inline-block rounded-xl bg-amber-600 px-4 py-2 text-xs font-black text-white hover:bg-amber-700">
                  7日間無料で試す
                </a>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

