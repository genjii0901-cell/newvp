"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildPrintHtml as buildSharedPrintHtml,
  makeQuestion as makeSharedQuestion,
} from "@/lib/print/full-builder";

type OverlapBook = { id: string; title: string };
type Word = { no: number; english: string; japanese: string };
type OverlapMode = "common-all" | "multi" | "unique" | "all";

const FREE_VISIBLE_ROWS = 8;

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

const MODES: Array<{ value: OverlapMode; label: string; hint: string }> = [
  { value: "common-all", label: "全部に共通", hint: "選んだ全単語帳にある語" },
  { value: "multi", label: "2冊以上でかぶり", hint: "複数の単語帳に出る語" },
  { value: "unique", label: "1冊だけにある", hint: "どれか1冊だけの語" },
  { value: "all", label: "全部", hint: "選んだ単語帳の全語" },
];

export default function OverlapTool({
  books,
  isPaid,
}: {
  books: OverlapBook[];
  isPaid: boolean;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mode, setMode] = useState<OverlapMode>("multi");
  const [wordsById, setWordsById] = useState<Record<string, Word[]>>({});
  const [loadingIds, setLoadingIds] = useState<string[]>([]);
  const [printing, setPrinting] = useState(false);

  // 選択された単語帳の単語を取得（キャッシュ）
  useEffect(() => {
    const missing = selectedIds.filter((id) => !wordsById[id] && !loadingIds.includes(id));
    if (missing.length === 0) return;
    setLoadingIds((prev) => [...prev, ...missing]);
    missing.forEach(async (id) => {
      try {
        const res = await fetch(`/api/wordbooks/official?id=${encodeURIComponent(id)}&includeWords=1`);
        const data = await res.json().catch(() => ({}));
        const book = Array.isArray(data.wordbooks)
          ? data.wordbooks.find((b: { id: string }) => String(b.id) === String(id))
          : null;
        const words: Word[] = Array.isArray(book?.words)
          ? book.words.map((w: Word) => ({ no: w.no, english: w.english, japanese: w.japanese }))
          : [];
        setWordsById((prev) => ({ ...prev, [id]: words }));
      } catch {
        setWordsById((prev) => ({ ...prev, [id]: [] }));
      } finally {
        setLoadingIds((prev) => prev.filter((x) => x !== id));
      }
    });
  }, [selectedIds, wordsById, loadingIds]);

  const selectedBooks = useMemo(
    () => selectedIds.map((id) => books.find((b) => b.id === id)).filter(Boolean) as OverlapBook[],
    [selectedIds, books],
  );

  const allLoaded = selectedIds.every((id) => wordsById[id]);

  // 語（正規化キー）ごとに、どの単語帳に入っているかを集計
  const rows = useMemo(() => {
    if (selectedIds.length < 2 || !allLoaded) return [];
    type Agg = { english: string; japanese: string; bookIds: Set<string>; minNo: number };
    const map = new Map<string, Agg>();
    for (const id of selectedIds) {
      for (const word of wordsById[id] ?? []) {
        const key = normalizeKey(word.english);
        if (!key) continue;
        const existing = map.get(key);
        if (existing) {
          existing.bookIds.add(id);
          if (word.no < existing.minNo) existing.minNo = word.no;
        } else {
          map.set(key, { english: word.english, japanese: word.japanese, bookIds: new Set([id]), minNo: word.no });
        }
      }
    }
    const total = selectedIds.length;
    let list = Array.from(map.values());
    if (mode === "common-all") list = list.filter((r) => r.bookIds.size === total);
    else if (mode === "multi") list = list.filter((r) => r.bookIds.size >= 2);
    else if (mode === "unique") list = list.filter((r) => r.bookIds.size === 1);
    list.sort((a, b) => b.bookIds.size - a.bookIds.size || a.minNo - b.minNo);
    return list.map((r, index) => ({
      no: index + 1,
      english: r.english,
      japanese: r.japanese,
      count: r.bookIds.size,
      bookIds: Array.from(r.bookIds),
    }));
  }, [selectedIds, wordsById, mode, allLoaded]);

  const visibleRows = isPaid ? rows : rows.slice(0, FREE_VISIBLE_ROWS);
  const lockedCount = isPaid ? 0 : Math.max(0, rows.length - FREE_VISIBLE_ROWS);

  function toggleBook(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function printResult() {
    if (!isPaid || rows.length === 0) return;
    setPrinting(true);
    try {
      const words: Word[] = rows.map((r) => ({ no: r.no, english: r.english, japanese: r.japanese }));
      const title = `かぶり調査（${selectedBooks.map((b) => b.title).join(" / ")}）`;
      const html = buildSharedPrintHtml({
        title,
        words,
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
      const doc = `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>${title}</title></head><body style="margin:0"><div id="print-root">${html}</div></body></html>`;
      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;visibility:hidden;";
      document.body.appendChild(iframe);
      const idoc = iframe.contentDocument ?? iframe.contentWindow?.document;
      if (idoc) {
        idoc.open();
        idoc.write(doc);
        idoc.close();
        iframe.contentWindow?.focus();
        setTimeout(() => {
          try { iframe.contentWindow?.print(); } catch { /* ignore */ }
          setTimeout(() => { try { iframe.remove(); } catch { /* ignore */ } }, 60_000);
        }, 400);
      } else {
        iframe.remove();
      }
    } finally {
      setPrinting(false);
    }
  }

  const titleById = (id: string) => books.find((b) => b.id === id)?.title ?? id;

  return (
    <div className="rounded-3xl border bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-black text-blue-700">かぶり調査</p>
          <h3 className="text-lg font-black text-slate-900">単語帳のかぶり・違いを何冊でも比較</h3>
        </div>
        {!isPaid ? (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">無料は一部だけ表示</span>
        ) : null}
      </div>

      <p className="mt-3 text-xs font-bold text-slate-500">比較したい単語帳を2冊以上選んでください。</p>
      <div className="mt-2 flex max-h-44 flex-wrap gap-2 overflow-auto rounded-2xl border bg-slate-50 p-2">
        {books.map((book) => {
          const active = selectedIds.includes(book.id);
          return (
            <button
              key={book.id}
              type="button"
              onClick={() => toggleBook(book.id)}
              className={`rounded-xl border px-3 py-2 text-xs font-black transition ${
                active ? "border-blue-500 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              {active ? "✓ " : ""}
              {book.title}
            </button>
          );
        })}
      </div>

      {selectedIds.length > 0 ? (
        <p className="mt-2 text-xs font-bold text-slate-500">
          選択中: {selectedBooks.map((b) => b.title).join(" / ")}（{selectedIds.length}冊）
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setMode(m.value)}
            className={`rounded-2xl border px-3 py-2 text-left transition ${
              mode === m.value ? "border-blue-500 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <span className="block text-sm font-black">{m.label}</span>
            <span className={`block text-[11px] font-bold ${mode === m.value ? "text-blue-100" : "text-slate-400"}`}>{m.hint}</span>
          </button>
        ))}
      </div>

      <div className="mt-4">
        {selectedIds.length < 2 ? (
          <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">
            2冊以上選ぶと、ここにかぶり・違いが出ます。
          </p>
        ) : !allLoaded ? (
          <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">単語を読み込み中...</p>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm font-black text-slate-700">該当 {rows.length}語</p>
              {isPaid ? (
                <button
                  type="button"
                  onClick={printResult}
                  disabled={printing || rows.length === 0}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white hover:bg-blue-700 disabled:bg-slate-300"
                >
                  この結果を印刷
                </button>
              ) : null}
            </div>

            <div className="mt-2 overflow-hidden rounded-2xl border">
              <table className="w-full table-fixed border-collapse text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="w-12 border-b p-2 text-center">#</th>
                    <th className="w-1/3 border-b p-2 text-left">単語</th>
                    <th className="border-b p-2 text-left">意味</th>
                    <th className="w-16 border-b p-2 text-center">冊数</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr key={`${row.no}-${row.english}`} className="border-b last:border-0">
                      <td className="p-2 text-center font-bold text-slate-400">{row.no}</td>
                      <td className="p-2 font-bold text-slate-900">{row.english}</td>
                      <td className="p-2 text-slate-600">
                        <span className="block truncate">{row.japanese}</span>
                        <span className="mt-1 flex flex-wrap gap-1">
                          {row.bookIds.map((id) => (
                            <span key={id} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                              {titleById(id)}
                            </span>
                          ))}
                        </span>
                      </td>
                      <td className="p-2 text-center font-black text-blue-600">{row.count}</td>
                    </tr>
                  ))}
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-sm font-bold text-slate-400">
                        該当する単語がありません。
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {lockedCount > 0 ? (
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center">
                <p className="text-sm font-black text-amber-800">残り{lockedCount}語はPersonalで見られます</p>
                <p className="mt-1 text-xs font-bold text-amber-700">
                  無料版はかぶり調査の結果を先頭{FREE_VISIBLE_ROWS}語までにしています。全部見て印刷するにはPersonal（7日間無料）へ。
                </p>
                <a
                  href="/pricing"
                  className="mt-3 inline-block rounded-xl bg-amber-600 px-4 py-2 text-xs font-black text-white hover:bg-amber-700"
                >
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
