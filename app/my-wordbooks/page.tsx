"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadProgress, summarize, type BookProgress } from "@/lib/srs";
import WordbookDetail from "../wordbooks/[id]/wordbook-detail-client";
import { WordbookCover } from "@/components/wordbook-cover";

type MyWord = { no: number; english: string; japanese: string; unit: string | null };
type MyBook = { id: string; title: string; description: string; wordCount: number; words: MyWord[]; coverImage: string | null; copied?: boolean; sourceId?: string | null; requiredPlan?: "free" | "personal" | "teacher" };
type CatalogBook = { id: string; title: string; wordCount: number; coverImage: string | null; description: string; requiredPlan?: string };



// 画像がない単語帳は、タイトルから色を決めた表紙を自分で描く（外部サービスに頼らない）。
function coverFor(book: { title: string; coverImage: string | null }) {
  const image = book.coverImage;
  if (image) return image;
  const label = book.title.slice(0, 14).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  let hue = 0;
  for (const char of book.title) hue = (hue * 31 + char.charCodeAt(0)) % 360;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='200'><rect width='320' height='200' fill='hsl(${hue},70%,92%)'/><text x='160' y='108' font-size='26' font-weight='700' text-anchor='middle' fill='hsl(${hue},60%,32%)' font-family='sans-serif'>${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// 初めての人に機能を知ってもらうため、最初に1冊だけ自動で入れる単語帳の候補（上から優先）。
const STARTER_TITLES = ["システム英単語", "ターゲット1900", "ターゲット1400", "LEAP", "英検"];

/** みんなの単語帳の1冊を、単語ごと取得してマイ単語帳に追加する（同じ単語帳は二重に入れない）。 */
async function addOfficialBook(token: string, book: { id: string; title: string; coverImage?: string | null; requiredPlan?: string }) {
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
      dedupe: true,
      requiredPlan: book.requiredPlan,
      sourceId: book.id,
      coverImage: book.coverImage,
      words: words.map((word: { no?: number; english: string; japanese: string; unit?: string | null }) => ({ no: word.no, english: word.english, japanese: word.japanese, unit: word.unit })),
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error ?? "追加できませんでした。");
  return { duplicate: result.duplicate === true };
}

export default function MyWordbooksHub() {
  const supabase = useMemo(() => createClient(), []);
  const [token, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [books, setBooks] = useState<MyBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [viewing, setViewing] = useState(false);
  const [progressByBook, setProgressByBook] = useState<Record<string, BookProgress>>({});
  const [notice, setNotice] = useState("");
  const [adderOpen, setAdderOpen] = useState(false);
  const [catalog, setCatalog] = useState<CatalogBook[]>([]);
  const [loaded, setLoaded] = useState(false);
  const seedTried = useRef(false);

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
    // ログイン・ログアウト・トークン更新に追従する（ログイン直後でも一覧が出るように）。
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setToken(session?.access_token ?? null);
      setUserId(session?.user.id ?? null);
      if (!session) setLoading(false);
    });
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  const loadBooks = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const booksRes = await fetch("/api/me/wordbooks", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const booksJson = await booksRes.json().catch(() => ({}));
      if (!booksRes.ok || !Array.isArray(booksJson.wordbooks)) {
        // 読み込みに失敗したときは、空に見せず今の表示を保ってエラーを知らせる。
        setNotice(booksJson.error ?? "マイ単語帳を読み込めませんでした。少し待ってから開き直してください。");
        return;
      }
      const list: MyBook[] = booksJson.wordbooks.map((book: MyBook) => ({ ...book, coverImage: book.coverImage ?? null, words: book.words ?? [] }));
      setBooks(list);
      setLoaded(true);
      const requested = new URLSearchParams(window.location.search).get("book");
      const fromUrl = list.find((book) => book.id === requested);
      setSelectedId((current) => fromUrl?.id ?? (list.some((book) => book.id === current) ? current : list[0]?.id ?? ""));
      setViewing(Boolean(fromUrl));
    } finally {
      setLoading(false);
    }
  }, [token]);
  useEffect(() => {
    void loadBooks();
  }, [loadBooks]);

  // みんなの単語帳の一覧（表紙の補完と、最初の1冊の自動追加に使う）
  useEffect(() => {
    void fetch("/api/wordbooks/official")
      .then((response) => response.json())
      .then((json) => {
        const list = Array.isArray(json.wordbooks) ? json.wordbooks : [];
        setCatalog(
          list.map((item: { id: string | number; title?: string; wordCount?: number; words?: unknown[]; coverImage?: string | null; description?: string; requiredPlan?: string }) => ({
            id: String(item.id),
            requiredPlan: item.requiredPlan,
            title: item.title ?? "単語帳",
            wordCount: typeof item.wordCount === "number" ? item.wordCount : item.words?.length ?? 0,
            coverImage: item.coverImage ?? null,
            description: item.description ?? "",
          })),
        );
      })
      .catch(() => undefined);
  }, []);
  function displayCover(book: MyBook) {
    const original = book.sourceId
      ? catalog.find((item) => item.id === book.sourceId)
      : book.copied ? catalog.find((item) => item.title === book.title) : undefined;
    return original?.coverImage || book.coverImage;
  }

  // 初めて使う人には、機能が伝わるよう単語帳を1冊だけ自動で入れる（1人1回だけ。消しても入れ直さない）。
  useEffect(() => {
    if (!loaded || books.length > 0 || !token || !userId || catalog.length === 0 || seedTried.current) return;
    seedTried.current = true;
    const flag = `vpp-my-starter:${userId}`;
    try {
      if (window.localStorage.getItem(flag)) return;
      window.localStorage.setItem(flag, "1");
    } catch {
      return;
    }
    const starter = STARTER_TITLES.map((key) => catalog.find((item) => item.title.includes(key))).find(Boolean) ?? catalog[0];
    if (!starter) return;
    void addOfficialBook(token, starter)
      .then(() => loadBooks())
      .then(() => setNotice(`まず「${starter.title}」を入れておきました。単語チェックや聞き流しを試してみましょう。別の単語帳は「＋ 単語帳を追加」から選べます。`))
      .catch(() => undefined);
  }, [loaded, books.length, token, userId, catalog, loadBooks]);

  // ★や学習記録は、取り込み元の単語帳と同じ記録を使う（単語帳ページと同期する）。
  // 古い取り込みで元IDが無いものは、タイトルが同じ人気教材を元とみなす。
  const syncId = useCallback(
    (item: { id: string; title: string; copied?: boolean; sourceId?: string | null }) =>
      item.sourceId || (item.copied ? catalog.find((entry) => entry.title === item.title)?.id : undefined) || item.id,
    [catalog],
  );

  // 学習記録の読み込み（端末に保存）
  useEffect(() => {
    if (!userId || books.length === 0) return;
    const refresh = () => {
      const next: Record<string, BookProgress> = {};
      for (const book of books) next[book.id] = loadProgress(userId, syncId(book));
      setProgressByBook(next);
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [userId, books, syncId]);

  // 同じ単語帳（同じタイトル）は1冊だけ。学習記録がある本、なければ語数の多い本を残す。
  const duplicateIds = useMemo(() => {
    const groups = new Map<string, MyBook[]>();
    for (const item of books) groups.set(item.title, [...(groups.get(item.title) ?? []), item]);
    const extras = new Set<string>();
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const rank = (item: MyBook) => (Object.keys(progressByBook[item.id] ?? {}).length > 0 ? 1_000_000 : 0) + item.wordCount;
      [...group].sort((a, b) => rank(b) - rank(a)).slice(1).forEach((item) => extras.add(item.id));
    }
    return extras;
  }, [books, progressByBook]);
  const shelfBooks = useMemo(() => books.filter((item) => !duplicateIds.has(item.id)), [books, duplicateIds]);
  const [cleaning, setCleaning] = useState(false);
  async function removeDuplicates() {
    if (!token || duplicateIds.size === 0) return;
    if (!window.confirm(`同じ単語帳が重複しています。重複している${duplicateIds.size}冊を削除して、1冊ずつにします。よろしいですか？`)) return;
    setCleaning(true);
    try {
      for (const id of duplicateIds) {
        await fetch("/api/me/wordbooks", {
          method: "DELETE",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id }),
        });
      }
      await loadBooks();
    } finally {
      setCleaning(false);
    }
  }

  async function deleteBook(target: MyBook) {
    if (!token) return;
    if (!window.confirm(`「${target.title}」をマイ単語帳から削除しますか？（学習記録はこの端末に残ります）`)) return;
    const response = await fetch("/api/me/wordbooks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: target.id }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setNotice(result.error ?? "削除できませんでした。");
      return;
    }
    closeBook();
    setNotice(`「${target.title}」を削除しました。`);
    await loadBooks();
  }

  const book = books.find((item) => item.id === selectedId) ?? null;
  const now = Date.now();

  function openBook(item: MyBook) {
    const url = new URL(window.location.href);
    url.searchParams.set("book", item.id);
    window.history.replaceState(null, "", url);
    setSelectedId(item.id);
    setViewing(true);
    window.scrollTo({ top: 0 });
    setNotice("");
  }

  function closeBook() {
    const url = new URL(window.location.href);
    url.searchParams.delete("book");
    url.searchParams.delete("tab");
    window.history.replaceState(null, "", url);
    setViewing(false);
    if (userId && book) setProgressByBook((all) => ({ ...all, [book.id]: loadProgress(userId, syncId(book)) }));
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

  if (viewing && book && token) {
    return (
      <WordbookDetail
        key={book.id}
        savedBook={{
          data: { ...book, coverImage: displayCover(book), requiredPlan: book.requiredPlan ?? "free" },
          progressId: syncId(book),
          copied: Boolean(book.copied),
          onBack: closeBook,
          onRemove: () => void deleteBook(book),
          notice,
        }}
      />
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-2.5 py-4 sm:px-5 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-black text-blue-700">Vocab Print Pro</p>
          <h1 className="text-2xl font-black text-slate-950">マイ単語帳</h1>
        </div>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => setAdderOpen(true)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-black text-white hover:bg-blue-700">＋ 追加</button>
          <Link href="/wordbooks?tab=my" className="flex items-center rounded-lg border bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50">自作公開</Link>
        </div>
      </div>

      {notice ? <p role="alert" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-800">{notice}</p> : null}

      {duplicateIds.size > 0 ? (
        <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-800">
          <span>同じ単語帳が{duplicateIds.size}冊重複しています（本棚には1冊だけ表示しています）。</span>
          <button type="button" disabled={cleaning} onClick={() => void removeDuplicates()} className="min-h-10 rounded-lg bg-amber-500 px-3 text-xs font-black text-white disabled:opacity-60">
            {cleaning ? "整理中…" : "重複を整理する"}
          </button>
        </div>
      ) : null}

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
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-6">
            {shelfBooks.map((item) => {
              const itemProgress = progressByBook[item.id] ?? {};
              const s = summarize(item.words, itemProgress, now);
              const active = item.id === selectedId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openBook(item)}
                  className={`min-w-0 overflow-hidden rounded-xl border bg-white text-left shadow-sm transition ${active ? "border-blue-500 ring-2 ring-blue-100" : "hover:-translate-y-0.5 hover:shadow-md"}`}
                >
                  <WordbookCover title={item.title} image={displayCover(item)} lazy crop />
                  <div className="p-1.5 sm:p-2">
                    <p className="line-clamp-2 min-h-[2rem] text-[11px] font-black leading-snug text-slate-900 sm:text-xs">{item.title}</p>
                    <div className="mt-1 flex items-center justify-between text-[10px] font-black">
                      <span className="text-slate-400">{item.wordCount}語</span>
                      <span className="text-blue-700">記憶度 {s.memoryPercent}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-blue-500" style={{ width: `${s.memoryPercent}%` }} />
                    </div>
                    {s.dueCount > 0 ? <p className="mt-1 rounded-full bg-amber-100 px-1 py-0.5 text-center text-[10px] font-black text-amber-800">復習 {s.dueCount}語</p> : null}
                  </div>
                </button>
              );
            })}
            <button type="button" onClick={() => setAdderOpen(true)} className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 bg-white/60 text-sm font-black text-slate-500 hover:bg-white">
              <span className="text-2xl">＋</span>追加
            </button>
          </div>
        )}
      </section>

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
          list.map((book: { id: string | number; title?: string; wordCount?: number; words?: unknown[]; coverImage?: string | null; description?: string; requiredPlan?: string }) => ({
            id: String(book.id),
            requiredPlan: book.requiredPlan,
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
      const { duplicate } = await addOfficialBook(token, book);
      setMessage(duplicate ? `「${book.title}」はすでに入っています。` : `「${book.title}」を追加しました。`);
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
