"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  applyAnswer,
  dueWords,
  forecast,
  loadProgress,
  nextDueInDays,
  retention,
  saveProgress,
  statusOf,
  summarize,
  wordKey,
  type BookProgress,
} from "@/lib/srs";
import QuizPanel from "../wordbooks/[id]/quiz-panel";
import ListenPanel from "../wordbooks/[id]/listen-panel";
import { ForecastChart, MemoryRing, StatusBar } from "./progress-ui";

type MyWord = { no: number; english: string; japanese: string; unit: string | null };
type MyBook = { id: string; title: string; description: string; wordCount: number; words: MyWord[]; coverImage: string | null };
type CatalogBook = { id: string; title: string; wordCount: number; coverImage: string | null; description: string };
type Tab = "study" | "listen" | "memory";



function coverFor(book: { title: string; coverImage: string | null }) {
  return book.coverImage || `https://dummyimage.com/320x200/dbeafe/1d4ed8&text=${encodeURIComponent(book.title.slice(0, 14))}`;
}

export default function MyWordbooksHub() {
  const supabase = useMemo(() => createClient(), []);
  const [token, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [books, setBooks] = useState<MyBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [tab, setTab] = useState<Tab>("study");
  const [studyEpoch, setStudyEpoch] = useState(0);
  const [startWithDue, setStartWithDue] = useState(false);
  const [progressByBook, setProgressByBook] = useState<Record<string, BookProgress>>({});
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState("");
  const [upgrade, setUpgrade] = useState<string | null>(null);
  const [adderOpen, setAdderOpen] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      setLoading(false);
      return;
    }
    void supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? null);
      setUserId(data.session?.user.id ?? null);
      setAuthReady(true);
      if (!data.session) setLoading(false);
    });
  }, [supabase]);

  const loadBooks = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [booksRes, profileRes] = await Promise.all([
        fetch("/api/me/wordbooks", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/me/profile", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const booksJson = await booksRes.json().catch(() => ({}));
      const profileJson = await profileRes.json().catch(() => ({}));
      const list: MyBook[] = Array.isArray(booksJson.wordbooks)
        ? booksJson.wordbooks.map((book: MyBook) => ({ ...book, coverImage: book.coverImage ?? null, words: book.words ?? [] }))
        : [];
      setBooks(list);
      setSelectedId((current) => (list.some((book) => book.id === current) ? current : list[0]?.id ?? ""));
      const plan = profileJson?.profile?.plan;
      setIsPaid(plan === "personal" || plan === "teacher");
    } finally {
      setLoading(false);
    }
  }, [token]);
  useEffect(() => {
    void loadBooks();
  }, [loadBooks]);

  // 学習記録の読み込み（端末に保存）
  useEffect(() => {
    if (!userId || books.length === 0) return;
    const next: Record<string, BookProgress> = {};
    for (const book of books) next[book.id] = loadProgress(userId, book.id);
    setProgressByBook(next);
  }, [userId, books]);

  const book = books.find((item) => item.id === selectedId) ?? null;
  const progress = (book && progressByBook[book.id]) || {};
  const now = Date.now();
  const summary = useMemo(() => (book ? summarize(book.words, progress, now) : null), [book, progress, now]);
  const due = useMemo(() => (book ? dueWords(book.words, progress, now) : []), [book, progress, now]);
  const dueKeys = useMemo(() => new Set(due.map(wordKey)), [due]);
  const points = useMemo(() => (book ? forecast(book.words, progress, 30, now) : []), [book, progress, now]);
  const nextDue = book ? nextDueInDays(book.words, progress, now) : null;

  // ★の保存（聞き流し・単語チェックと共通のキー）
  const markKey = userId && book ? `vpp-word-marks:${userId}:${book.id}` : "";
  useEffect(() => {
    if (!markKey) return;
    try {
      const raw = window.localStorage.getItem(markKey);
      setMarked(new Set(raw ? (JSON.parse(raw) as string[]).map(String) : []));
    } catch {
      setMarked(new Set());
    }
  }, [markKey]);
  function toggleMark(word: { no: number; english: string }) {
    const key = wordKey(word);
    setMarked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        window.localStorage.setItem(markKey, JSON.stringify(Array.from(next)));
      } catch {
        // 無視
      }
      return next;
    });
  }

  function recordAnswer(word: { no: number; english: string }, correct: boolean) {
    if (!userId || !book) return;
    const bookId = book.id;
    setProgressByBook((all) => {
      const current = all[bookId] ?? {};
      const key = wordKey(word);
      const nextBook = { ...current, [key]: applyAnswer(current[key], correct) };
      saveProgress(userId, bookId, nextBook);
      return { ...all, [bookId]: nextBook };
    });
  }

  function startDue() {
    if (!isPaid) {
      setUpgrade("忘却曲線に沿った「今日の復習」はPersonalプランで使えます。無料でも、単語チェックの結果から記憶度は記録されます。");
      return;
    }
    if (due.length === 0) {
      setNotice("今日復習する単語はありません。間隔が来ると、ここに表示されます。");
      return;
    }
    setNotice("");
    setStartWithDue(true);
    setStudyEpoch((value) => value + 1);
    setTab("study");
  }

  function openTab(next: Tab) {
    setStartWithDue(false);
    setTab(next);
  }

  /* ───── 表示 ───── */
  if (authReady && !token) {
    return (
      <main className="mx-auto max-w-xl px-4 py-12 text-center">
        <p className="text-4xl" aria-hidden>📚</p>
        <h1 className="mt-3 text-2xl font-black text-slate-950">マイ単語帳</h1>
        <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
          好きな単語帳を選んで自分用に保存し、忘却曲線に沿って復習できます。無料でアカウントを作って始めましょう。
        </p>
        <Link href="/?print_auth=free&next=%2Fmy-wordbooks" className="mt-5 inline-block min-h-12 rounded-2xl bg-blue-600 px-6 py-3 text-base font-black text-white shadow-lg shadow-blue-600/30 hover:bg-blue-700">
          無料で会員登録 / ログイン
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-2.5 py-4 sm:px-5 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-black text-blue-700">Vocab Print Pro</p>
          <h1 className="text-2xl font-black text-slate-950">マイ単語帳</h1>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setAdderOpen(true)} className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700">＋ 単語帳を追加</button>
          <Link href="/wordbooks?tab=my" className="flex min-h-11 items-center rounded-xl border bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50">編集・公開</Link>
        </div>
      </div>

      {/* 本棚 */}
      <section className="mt-4" aria-label="自分の単語帳">
        {loading ? (
          <p className="rounded-2xl border bg-white p-6 text-center text-sm font-bold text-slate-400">読み込み中…</p>
        ) : books.length === 0 ? (
          <div className="rounded-3xl border bg-white p-8 text-center shadow-sm">
            <p className="text-4xl" aria-hidden>📖</p>
            <h2 className="mt-2 text-lg font-black text-slate-950">まだマイ単語帳がありません</h2>
            <p className="mt-1 text-sm font-bold text-slate-500">たくさんある単語帳から、使いたいものを選んで追加しましょう。</p>
            <button type="button" onClick={() => setAdderOpen(true)} className="mt-4 min-h-12 rounded-2xl bg-blue-600 px-6 text-base font-black text-white">単語帳を選んで追加</button>
          </div>
        ) : (
          <div className="-mx-2.5 flex snap-x gap-3 overflow-x-auto px-2.5 pb-2 sm:mx-0 sm:px-0">
            {books.map((item) => {
              const itemProgress = progressByBook[item.id] ?? {};
              const s = summarize(item.words, itemProgress, now);
              const active = item.id === selectedId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(item.id);
                    openTab("study");
                    setNotice("");
                  }}
                  className={`w-44 flex-none snap-start overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition sm:w-52 ${active ? "border-blue-500 ring-2 ring-blue-100" : "hover:-translate-y-0.5 hover:shadow-md"}`}
                >
                  <img src={coverFor(item)} alt="" className="h-20 w-full object-cover" />
                  <div className="p-3">
                    <p className="line-clamp-2 min-h-[2.4rem] text-sm font-black leading-snug text-slate-900">{item.title}</p>
                    <div className="mt-2 flex items-center justify-between text-[11px] font-black">
                      <span className="text-slate-400">{item.wordCount}語</span>
                      <span className="text-blue-700">記憶度 {s.memoryPercent}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-blue-500" style={{ width: `${s.memoryPercent}%` }} />
                    </div>
                    {s.dueCount > 0 ? <p className="mt-2 rounded-full bg-amber-100 px-2 py-0.5 text-center text-[11px] font-black text-amber-800">復習 {s.dueCount}語</p> : null}
                  </div>
                </button>
              );
            })}
            <button type="button" onClick={() => setAdderOpen(true)} className="flex w-32 flex-none snap-start flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-slate-300 bg-white/60 text-sm font-black text-slate-500 hover:bg-white">
              <span className="text-2xl">＋</span>追加
            </button>
          </div>
        )}
      </section>

      {book && summary ? (
        <>
          {/* 今日の状況 */}
          <section className="mt-3 rounded-3xl border bg-white p-4 shadow-sm sm:p-6">
            <div className="flex items-center gap-4">
              <MemoryRing percent={summary.memoryPercent} />
              <div className="min-w-0 flex-1">
                <h2 className="line-clamp-2 text-lg font-black leading-snug text-slate-950">{book.title}</h2>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  {summary.total}語 ・ {summary.newCount === summary.total ? "まだ学習していません" : `定着 ${summary.masteredCount}語`}
                </p>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  {summary.dueCount > 0
                    ? `今日の復習: ${summary.dueCount}語`
                    : nextDue === null
                      ? "単語チェックを解くと、記憶度が記録されます"
                      : `次の復習まで約${nextDue < 1 ? "数時間" : `${Math.ceil(nextDue)}日`}`}
                </p>
              </div>
            </div>
            <div className="mt-4">
              <StatusBar summary={summary} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-[1.4fr_1fr_1fr]">
              <button type="button" onClick={startDue} className={`col-span-2 min-h-14 rounded-2xl px-4 sm:col-span-1 text-base font-black shadow-lg ${summary.dueCount > 0 ? "bg-amber-500 text-white shadow-amber-500/30 hover:bg-amber-600" : "bg-blue-600 text-white shadow-blue-600/20 hover:bg-blue-700"}`}>
                {isPaid ? "" : "🔒 "}今日の復習を始める（{summary.dueCount}語）
              </button>
              <button type="button" onClick={() => openTab("study")} className="min-h-14 rounded-2xl border bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50">単語チェック</button>
              <button type="button" onClick={() => openTab("listen")} className="min-h-14 rounded-2xl border bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50">聞き流し</button>
            </div>
            {notice ? <p role="status" className="mt-3 rounded-xl bg-slate-50 p-3 text-sm font-bold text-slate-600">{notice}</p> : null}
          </section>

          {/* タブ */}
          <div className="mt-3 grid grid-cols-3 gap-1.5" role="tablist">
            {([
              ["study", "単語チェック"],
              ["listen", "聞き流し"],
              ["memory", "記憶度・復習"],
            ] as Array<[Tab, string]>).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                type="button"
                onClick={() => openTab(key)}
                className={`min-h-11 rounded-xl border px-2 text-xs font-black sm:text-sm ${tab === key ? "border-blue-500 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "study" ? (
            <section className="mx-auto mt-3 max-w-2xl">
              <QuizPanel
                key={`${book.id}-${studyEpoch}`}
                bookTitle={book.title}
                words={book.words}
                markedKeys={marked}
                onToggleMark={toggleMark}
                isPaid={isPaid}
                onLocked={setUpgrade}
                onAnswer={recordAnswer}
                dueKeys={dueKeys}
                initialScope={startWithDue ? "due" : undefined}
              />
            </section>
          ) : null}

          {tab === "listen" ? (
            <ListenPanel key={book.id} words={book.words} isPaid={isPaid} markedKeys={marked} onToggleMark={toggleMark} onLocked={setUpgrade} />
          ) : null}

          {tab === "memory" ? (
            <section className="mt-3 grid gap-3 lg:grid-cols-2">
              <div className="rounded-3xl border bg-white p-4 shadow-sm sm:p-5">
                <h3 className="text-base font-black text-slate-950">忘却曲線の予測</h3>
                <p className="mt-1 text-xs font-bold text-slate-500">学習した単語が、復習しないとどれだけ忘れていくかの目安です。</p>
                <div className="relative mt-3">
                  <div className={isPaid ? "" : "pointer-events-none select-none opacity-40 blur-[2px]"}>
                    <ForecastChart points={points} />
                  </div>
                  {!isPaid ? (
                    <button type="button" onClick={() => setUpgrade("忘却曲線の予測グラフと復習スケジュールはPersonalプランで使えます。")} className="absolute inset-0 m-auto h-fit w-fit rounded-2xl bg-white px-4 py-3 text-sm font-black text-amber-800 shadow-lg ring-1 ring-amber-200">
                      🔒 Personalで予測を見る
                    </button>
                  ) : null}
                </div>
                <ul className="mt-3 space-y-1 text-xs font-bold text-slate-500">
                  <li>・正解すると復習間隔が 1→2→4→7→15→30→60日 と伸びます</li>
                  <li>・間違えると10分後にもう一度。記憶度が下がった単語から出題します</li>
                </ul>
              </div>

              <div className="rounded-3xl border bg-white p-4 shadow-sm sm:p-5">
                <h3 className="text-base font-black text-slate-950">苦手な単語</h3>
                <p className="mt-1 text-xs font-bold text-slate-500">記憶度が低い順に表示しています（学習した単語のみ）。</p>
                <ul className="mt-3 max-h-80 divide-y overflow-auto rounded-2xl border">
                  {book.words
                    .filter((word) => progress[wordKey(word)])
                    .sort((a, b) => retention(progress[wordKey(a)], now) - retention(progress[wordKey(b)], now))
                    .slice(0, 50)
                    .map((word) => {
                      const record = progress[wordKey(word)];
                      const percent = Math.round(retention(record, now) * 100);
                      const status = statusOf(record, now);
                      return (
                        <li key={wordKey(word)} className="flex items-center gap-3 px-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-black text-slate-900">{word.english}</p>
                            <p className="truncate text-xs font-bold text-slate-500">{word.japanese}</p>
                          </div>
                          <span className={`flex-none rounded-full px-2 py-0.5 text-[11px] font-black ${status === "mastered" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>{percent}%</span>
                        </li>
                      );
                    })}
                  {Object.keys(progress).length === 0 ? <li className="p-6 text-center text-sm font-bold text-slate-400">まだ学習記録がありません。単語チェックを解いてみましょう。</li> : null}
                </ul>
                <p className="mt-2 text-[11px] font-bold text-slate-400">学習記録はこの端末に保存されます。</p>
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {upgrade ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center" onClick={() => setUpgrade(null)}>
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <p className="text-xs font-black text-amber-600">Personalで解放</p>
            <h3 className="mt-1 text-lg font-black leading-snug text-slate-950">{upgrade}</h3>
            <div className="mt-5 space-y-2">
              <Link href="/pricing" className="block rounded-2xl bg-blue-600 px-4 py-3.5 text-center text-base font-black text-white shadow-lg shadow-blue-600/30 hover:bg-blue-700">Personalの内容を見る</Link>
              <button type="button" onClick={() => setUpgrade(null)} className="w-full rounded-2xl border px-4 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-50">今は無料のまま使う</button>
            </div>
          </div>
        </div>
      ) : null}

      {adderOpen && token ? (
        <BookAdder
          token={token}
          ownedTitles={new Set(books.map((item) => item.title))}
          onClose={() => setAdderOpen(false)}
          onAdded={async () => {
            await loadBooks();
          }}
        />
      ) : null}
    </main>
  );
}

/** たくさんある単語帳から選んでマイ単語帳に追加するシート */
function BookAdder({ token, ownedTitles, onClose, onAdded }: { token: string; ownedTitles: Set<string>; onClose: () => void; onAdded: () => Promise<void> }) {
  const [catalog, setCatalog] = useState<CatalogBook[]>([]);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch("/api/wordbooks/official")
      .then((response) => response.json())
      .then((json) => {
        const list = Array.isArray(json.wordbooks) ? json.wordbooks : [];
        setCatalog(
          list.map((book: { id: string | number; title?: string; wordCount?: number; words?: unknown[]; coverImage?: string | null; description?: string }) => ({
            id: String(book.id),
            title: book.title ?? "単語帳",
            wordCount: typeof book.wordCount === "number" ? book.wordCount : book.words?.length ?? 0,
            coverImage: book.coverImage ?? null,
            description: book.description ?? "",
          })),
        );
      })
      .catch(() => setMessage("単語帳の一覧を読み込めませんでした。"))
      .finally(() => setLoading(false));
  }, []);

  async function add(book: CatalogBook) {
    setBusyId(book.id);
    setMessage("");
    try {
      const wordsRes = await fetch(`/api/wordbooks/official?id=${encodeURIComponent(book.id)}&includeWords=1`);
      const wordsJson = await wordsRes.json().catch(() => ({}));
      const raw = Array.isArray(wordsJson.wordbooks) ? wordsJson.wordbooks.find((item: { id: string | number }) => String(item.id) === book.id) : null;
      const words = Array.isArray(raw?.words) ? raw.words : [];
      if (words.length === 0) throw new Error("単語を読み込めませんでした。");
      const response = await fetch("/api/me/wordbooks", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: book.title,
          description: `${book.title}をマイ単語帳に追加しました。`,
          words: words.map((word: { no?: number; english: string; japanese: string; unit?: string | null }) => ({ no: word.no, english: word.english, japanese: word.japanese, unit: word.unit })),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "追加できませんでした。");
      setMessage(`「${book.title}」を追加しました。`);
      await onAdded();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "追加できませんでした。");
    } finally {
      setBusyId("");
    }
  }

  const q = query.trim().toLowerCase();
  const shown = catalog.filter((book) => !q || book.title.toLowerCase().includes(q));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div className="flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-xl sm:rounded-3xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <h2 className="text-base font-black text-slate-950">単語帳を選んで追加</h2>
          <button type="button" onClick={onClose} className="rounded-xl border px-3 py-1.5 text-sm font-black text-slate-600">閉じる</button>
        </div>
        <div className="border-b p-3">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="単語帳を検索（例: 英検、システム英単語）" className="min-h-11 w-full rounded-xl border px-3 text-sm font-bold" />
          {message ? <p role="status" className="mt-2 text-xs font-bold text-emerald-700">{message}</p> : null}
        </div>
        <ul className="min-h-0 flex-1 divide-y overflow-auto">
          {loading ? <li className="p-6 text-center text-sm font-bold text-slate-400">読み込み中…</li> : null}
          {shown.map((book) => {
            const owned = ownedTitles.has(book.title);
            return (
              <li key={book.id} className="flex items-center gap-3 px-4 py-3">
                <img src={coverFor(book)} alt="" className="h-12 w-12 flex-none rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-black leading-snug text-slate-900">{book.title}</p>
                  <p className="text-xs font-bold text-slate-400">{book.wordCount}語</p>
                </div>
                <button
                  type="button"
                  disabled={owned || busyId !== ""}
                  onClick={() => void add(book)}
                  className="min-h-10 flex-none rounded-xl bg-blue-600 px-3 text-xs font-black text-white disabled:bg-slate-200 disabled:text-slate-500"
                >
                  {owned ? "追加済み" : busyId === book.id ? "追加中…" : "追加"}
                </button>
              </li>
            );
          })}
          {!loading && shown.length === 0 ? <li className="p-6 text-center text-sm font-bold text-slate-400">該当する単語帳がありません。</li> : null}
        </ul>
      </div>
    </div>
  );
}
