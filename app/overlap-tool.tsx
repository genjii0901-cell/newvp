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

export default function OverlapTool({
  books,
  isPaid,
  onUseWords,
}: {
  books: OverlapBook[];
  isPaid: boolean;
  onUseWords?: (words: Word[], title: string) => void;
}) {
  const [states, setStates] = useState<Record<string, BookState>>({});
  const [includeMode, setIncludeMode] = useState<IncludeMode>("all");
  const [search, setSearch] = useState("");
  const [wordsById, setWordsById] = useState<Record<string, Word[]>>({});
  const [loadingIds, setLoadingIds] = useState<string[]>([]);
  const [printing, setPrinting] = useState(false);

  const selectedIds = useMemo(() => Object.keys(states), [states]);
  const includeIds = useMemo(() => selectedIds.filter((id) => states[id] === "include"), [selectedIds, states]);
  const excludeIds = useMemo(() => selectedIds.filter((id) => states[id] === "exclude"), [selectedIds, states]);
  const allLoaded = selectedIds.every((id) => wordsById[id]);

  const titleById = (id: string) => books.find((book) => book.id === id)?.title ?? id;
  const resultTitle = `かぶり調査（${includeMode === "all" ? "すべてにある" : "どれかにある"}: ${includeIds.map(titleById).join("・") || "-"}${excludeIds.length ? ` / ない: ${excludeIds.map(titleById).join("・")}` : ""}）`;

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

  function sendToPasteArea() {
    if (exportRows.length === 0) return;
    const words = exportRows.map(({ no, english, japanese }) => ({ no, english, japanese }));
    navigator.clipboard?.writeText(toTsv(words)).catch(() => undefined);
    onUseWords?.(words, resultTitle);
  }

  function printResult() {
    if (!isPaid || rows.length === 0) return;
    setPrinting(true);
    try {
      const html = buildSharedPrintHtml({
        title: resultTitle,
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
      const safeTitle = resultTitle.replace(/[<>"&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", '"': "&quot;", "&": "&amp;" }[c] ?? c));
      const doc = `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>${safeTitle}</title></head><body style="margin:0"><div id="print-root">${html}</div></body></html>`;
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
        document.title = resultTitle;
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
          <h3 className="text-lg font-black text-slate-900">「ある単語帳」「ない単語帳」で自由に抽出</h3>
          <p className="mt-1 max-w-3xl text-xs font-bold leading-6 text-slate-500">
            例: 「ターゲットにはある」「古文単語にはない」のように、単語帳ごとに条件を付けられます。
            結果は貼り付け欄へ送って、自作単語帳として保存したり、そのまま印刷できます。
          </p>
        </div>
        {!isPaid ? <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">無料は先頭{FREE_VISIBLE_ROWS}語まで</span> : null}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <label className="block">
          <span className="text-xs font-black text-slate-500">単語帳検索</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="単語帳名で検索"
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
          />
        </label>
        <div className="rounded-2xl bg-slate-50 p-1 text-xs font-black">
          <button
            type="button"
            onClick={() => setIncludeMode("all")}
            className={`rounded-xl px-3 py-2 ${includeMode === "all" ? "bg-blue-600 text-white" : "text-slate-600"}`}
          >
            ある全部に共通
          </button>
          <button
            type="button"
            onClick={() => setIncludeMode("any")}
            className={`rounded-xl px-3 py-2 ${includeMode === "any" ? "bg-blue-600 text-white" : "text-slate-600"}`}
          >
            あるどれかに含む
          </button>
        </div>
      </div>

      <div className="mt-3 max-h-72 overflow-auto rounded-2xl border bg-slate-50">
        {filteredBooks.map((book) => {
          const state = states[book.id] ?? "ignore";
          return (
            <div key={book.id} className="grid gap-2 border-b bg-white p-2 last:border-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <p className="truncate text-sm font-bold text-slate-800">{book.title}</p>
              <div className="grid grid-cols-3 rounded-xl bg-slate-100 p-1 text-xs font-black">
                <button
                  type="button"
                  onClick={() => setBookState(book.id, "include")}
                  className={`rounded-lg px-3 py-1.5 ${state === "include" ? "bg-blue-600 text-white" : "text-slate-500"}`}
                >
                  ある
                </button>
                <button
                  type="button"
                  onClick={() => setBookState(book.id, "exclude")}
                  className={`rounded-lg px-3 py-1.5 ${state === "exclude" ? "bg-rose-500 text-white" : "text-slate-500"}`}
                >
                  ない
                </button>
                <button
                  type="button"
                  onClick={() => setBookState(book.id, "ignore")}
                  className={`rounded-lg px-3 py-1.5 ${state === "ignore" ? "bg-white text-slate-700 shadow-sm" : "text-slate-500"}`}
                >
                  無視
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-xs font-bold leading-6 text-slate-600">
        <span className="font-black text-slate-800">条件:</span>{" "}
        <span className="text-blue-700">{includeIds.length ? includeIds.map(titleById).join(" / ") : "ある単語帳を選択"}</span>
        <span> に{includeMode === "all" ? "全部入っていて" : "どれかに入っていて"}</span>
        {excludeIds.length ? <span>、<span className="text-rose-600">{excludeIds.map(titleById).join(" / ")}</span> には入っていない単語</span> : null}
        {selectedIds.length > 0 ? (
          <button type="button" onClick={() => setStates({})} className="ml-3 text-slate-400 underline">
            条件をクリア
          </button>
        ) : null}
      </div>

      <div className="mt-4">
        {includeIds.length === 0 ? (
          <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">
            まず「ある」にする単語帳を1冊以上選んでください。
          </p>
        ) : !allLoaded ? (
          <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">単語を読み込み中...</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-black text-slate-700">該当 {rows.length}語</p>
              {rows.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={sendToPasteArea} className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 hover:bg-blue-100">
                    貼り付け欄へ送る
                  </button>
                  <button type="button" onClick={() => onUseWords?.(exportRows, resultTitle)} className="rounded-xl border bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">
                    印刷設定へ送る
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
                    <th className="hidden w-[32%] border-b p-2 text-left md:table-cell">見つかった単語帳</th>
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
                    <tr><td colSpan={4} className="p-6 text-center text-sm font-bold text-slate-400">該当する単語がありません。</td></tr>
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
