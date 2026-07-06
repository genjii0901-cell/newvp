"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildWordbookPath } from "@/lib/wordbook-slug";

type Plan = "free" | "personal" | "teacher";
type Word = { no: number; english: string; japanese: string; unit: string | null };
type OfficialWordbook = {
  id: string;
  title: string;
  description: string;
  coverImage?: string | null;
  requiredPlan: Plan;
  wordCount?: number;
  unitCount?: number;
  firstWord?: string | null;
  creator?: string;
  words?: Word[];
};
type MyWordbook = {
  id: string;
  title: string;
  description: string;
  wordCount: number;
  words: Word[];
};
type Tab = "official" | "my";
type EditableRow = { no: number; english: string; japanese: string; unit: string };

function planLabel(plan: Plan) {
  if (plan === "teacher") return "Teacher";
  if (plan === "personal") return "Personal";
  return "Free";
}

function emptyRows() {
  return Array.from({ length: 8 }, (_, index) => ({
    no: index + 1,
    english: "",
    japanese: "",
    unit: "",
  }));
}

export default function WordbooksPage() {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<Tab>("official");
  const [officialBooks, setOfficialBooks] = useState<OfficialWordbook[]>([]);
  const [myBooks, setMyBooks] = useState<MyWordbook[]>([]);
  const [loadingOfficial, setLoadingOfficial] = useState(true);
  const [loadingMine, setLoadingMine] = useState(true);
  const [error, setError] = useState("");
  const [officialFilter, setOfficialFilter] = useState<Plan | "all">("all");
  const [officialSearch, setOfficialSearch] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [selectedMyBookId, setSelectedMyBookId] = useState("");
  const [editorTitle, setEditorTitle] = useState("マイ単語帳");
  const [editorDescription, setEditorDescription] = useState("");
  const [editorRows, setEditorRows] = useState<EditableRow[]>(emptyRows());
  const [saving, setSaving] = useState(false);
  const [myMessage, setMyMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "my") setTab("my");
  }, []);

  useEffect(() => {
    async function loadOfficialBooks() {
      setLoadingOfficial(true);
      const response = await fetch("/api/wordbooks/official");
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(result.message ?? "みんなの単語帳を読み込めませんでした。");
        setLoadingOfficial(false);
        return;
      }

      const books = Array.isArray(result.wordbooks) ? result.wordbooks : [];
      setOfficialBooks(books.map((book: OfficialWordbook) => ({ ...book, creator: book.creator ?? "Vocab Print Pro" })));
      setLoadingOfficial(false);
    }

    loadOfficialBooks().catch(() => {
      setError("みんなの単語帳を読み込めませんでした。");
      setLoadingOfficial(false);
    });
  }, []);

  async function loadMyBooks() {
    if (!supabase) {
      setLoadingMine(false);
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setLoggedIn(false);
      setMyBooks([]);
      setLoadingMine(false);
      return;
    }
    setLoggedIn(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setLoadingMine(false);
      return;
    }

    const response = await fetch("/api/me/wordbooks", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(result.error ?? "マイ単語帳を読み込めませんでした。");
      setLoadingMine(false);
      return;
    }

    const books = Array.isArray(result.wordbooks) ? result.wordbooks : [];
    setMyBooks(books);
    setLoadingMine(false);
  }

  useEffect(() => {
    loadMyBooks();
  }, [supabase]);

  useEffect(() => {
    const selected = myBooks.find((book) => book.id === selectedMyBookId) ?? null;
    if (!selected) {
      setEditorTitle("マイ単語帳");
      setEditorDescription("");
      setEditorRows(emptyRows());
      return;
    }

    setEditorTitle(selected.title);
    setEditorDescription(selected.description ?? "");
    setEditorRows(
      selected.words.length > 0
        ? selected.words.map((word, index) => ({
            no: Number(word.no) || index + 1,
            english: word.english,
            japanese: word.japanese,
            unit: word.unit ?? "",
          }))
        : emptyRows(),
    );
  }, [myBooks, selectedMyBookId]);

  const filteredOfficialBooks = useMemo(() => {
    const query = officialSearch.trim().toLowerCase();
    return officialBooks.filter((book) => {
      const inPlan = officialFilter === "all" || book.requiredPlan === officialFilter;
      if (!inPlan) return false;
      if (!query) return true;
      return [book.title, book.description, book.creator ?? "", book.requiredPlan]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [officialBooks, officialFilter, officialSearch]);

  function updateRow(index: number, field: keyof EditableRow, value: string | number) {
    setEditorRows((prev) =>
      prev.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row)),
    );
  }

  function addRow() {
    setEditorRows((prev) => [
      ...prev,
      { no: prev.length + 1, english: "", japanese: "", unit: "" },
    ]);
  }

  function createNewMyBook() {
    setSelectedMyBookId("");
    setEditorTitle("マイ単語帳");
    setEditorDescription("");
    setEditorRows(emptyRows());
    setMyMessage("");
  }

  async function saveMyBook() {
    if (!supabase) return;

    const rows = editorRows
      .map((row, index) => ({
        no: row.no || index + 1,
        english: row.english.trim(),
        japanese: row.japanese.trim(),
        unit: row.unit.trim(),
      }))
      .filter((row) => row.english && row.japanese);

    if (rows.length === 0) {
      setMyMessage("英語と日本語を1行以上入力してください。");
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setMyMessage("ログイン状態を確認できませんでした。");
      return;
    }

    setSaving(true);
    setMyMessage("");

    const response = await fetch("/api/me/wordbooks", {
      method: selectedMyBookId ? "PATCH" : "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        id: selectedMyBookId || undefined,
        title: editorTitle,
        description: editorDescription,
        words: rows,
      }),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.wordbook) {
      setMyMessage(result.error ?? "保存に失敗しました。");
      setSaving(false);
      return;
    }

    setSelectedMyBookId(String(result.wordbook.id));
    setMyMessage("マイ単語帳を保存しました。");
    await loadMyBooks();
    setSaving(false);
  }

  async function deleteMyBook() {
    if (!supabase || !selectedMyBookId) return;
    if (!window.confirm("このマイ単語帳を削除しますか？")) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return;

    const response = await fetch("/api/me/wordbooks", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id: selectedMyBookId }),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      setMyMessage(result.error ?? "削除に失敗しました。");
      return;
    }

    createNewMyBook();
    await loadMyBooks();
    setMyMessage("削除しました。");
  }

  return (
    <main className="mx-auto max-w-6xl px-3 py-5 sm:px-5 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-blue-700">Vocab Print Pro</p>
          <h1 className="text-2xl font-black text-slate-900">単語帳</h1>
          <p className="mt-1 text-sm text-slate-500">
            教材を探す「みんなの単語帳」と、自分で保存する「マイ単語帳」をここで管理できます。
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/listening" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">
            聞き流し
          </Link>
          <Link href="/" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">
            自由作成
          </Link>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          onClick={() => setTab("official")}
          className={`rounded-full px-4 py-2 text-sm font-bold ${
            tab === "official" ? "bg-blue-600 text-white" : "border bg-white text-slate-700"
          }`}
        >
          みんなの単語帳
        </button>
        <button
          onClick={() => setTab("my")}
          className={`rounded-full px-4 py-2 text-sm font-bold ${
            tab === "my" ? "bg-blue-600 text-white" : "border bg-white text-slate-700"
          }`}
        >
          マイ単語帳
        </button>
      </div>

      {error && <div className="mt-5 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {tab === "official" ? (
        <>
          <div className="mt-5 flex gap-2 overflow-x-auto pb-1 sm:mt-6 sm:flex-wrap sm:overflow-visible sm:pb-0">
            {(["all", "free", "personal", "teacher"] as const).map((value) => (
              <button
                key={value}
                onClick={() => setOfficialFilter(value)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${
                  officialFilter === value ? "bg-blue-600 text-white" : "border bg-white text-slate-700"
                }`}
              >
                {value === "all" ? "すべて" : planLabel(value)}
              </button>
            ))}
          </div>
          <div className="mt-4">
            <label className="block text-sm font-bold text-slate-700">単語帳を検索</label>
            <input
              value={officialSearch}
              onChange={(event) => setOfficialSearch(event.target.value)}
              placeholder="単語帳名・説明・作成者で検索"
              className="mt-1 w-full rounded-xl border px-3 py-3 text-sm"
            />
            {officialSearch && (
              <p className="mt-1 text-xs font-bold text-slate-400">{filteredOfficialBooks.length}件見つかりました</p>
            )}
          </div>

          {loadingOfficial ? (
            <div className="mt-16 text-center text-slate-400">読み込み中...</div>
          ) : filteredOfficialBooks.length === 0 ? (
            <div className="mt-16 rounded-3xl border bg-white p-10 text-center">
              <p className="text-lg font-black text-slate-700">表示できる単語帳がまだありません</p>
            </div>
          ) : (
            <div className="mt-5 grid gap-2.5 sm:mt-6 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredOfficialBooks.map((book) => {
                const words = Array.isArray(book.words) ? book.words : [];
                const units =
                  typeof book.unitCount === "number"
                    ? book.unitCount
                    : new Set(words.map((word) => word.unit).filter(Boolean)).size;
                const wordCount = typeof book.wordCount === "number" ? book.wordCount : words.length;
                const firstWord = book.firstWord ?? words[0]?.english ?? "-";
                const detailPath = buildWordbookPath(book.id, book.title);
                return (
                  <article
                    key={book.id}
                    onClick={() => {
                      window.location.href = detailPath;
                    }}
                    className="flex min-h-[92px] cursor-pointer overflow-hidden rounded-2xl border bg-white shadow-sm transition active:scale-[0.99] hover:border-blue-200 sm:block sm:min-h-0 sm:rounded-3xl sm:hover:-translate-y-0.5 sm:hover:shadow-md"
                  >
                    {book.coverImage ? (
                      <img src={book.coverImage} alt={book.title} loading="lazy" className="h-auto w-16 flex-shrink-0 object-cover sm:h-40 sm:w-full" />
                    ) : null}
                    <div className="min-w-0 flex-1 p-2 sm:p-5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 sm:px-3 sm:text-xs">
                          {planLabel(book.requiredPlan)}
                        </span>
                        <span className="text-xs text-slate-400">{wordCount}語</span>
                      </div>
                      <h2 className="mt-1 line-clamp-2 text-sm font-black leading-snug text-slate-900 sm:mt-3 sm:text-xl">{book.title}</h2>
                      <p className="mt-1 truncate text-xs font-bold text-slate-400">
                        作成者: {book.creator ?? "Vocab Print Pro"}
                      </p>
                      <p className="mt-1 hidden line-clamp-2 text-xs leading-5 text-slate-500 sm:mt-2 sm:block sm:line-clamp-3 sm:text-sm">
                        {book.description || "公式単語帳です。"}
                      </p>
                      <div className="mt-2 hidden gap-4 text-xs text-slate-500 sm:mt-4 sm:flex">
                        {units > 0 ? <span>{units}ユニット</span> : null}
                        <span>最初: {firstWord}</span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5 sm:mt-5 sm:gap-2">
                        <Link
                          href={detailPath}
                          onClick={(event) => event.stopPropagation()}
                          className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-blue-700 sm:rounded-xl sm:px-4 sm:py-2 sm:text-sm"
                        >
                          開く
                        </Link>
                        <Link
                          href={`${detailPath}?tab=listen`}
                          onClick={(event) => event.stopPropagation()}
                          className="rounded-lg border px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 sm:rounded-xl sm:px-4 sm:py-2 sm:text-sm"
                        >
                          聞き流し
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
          <section className="rounded-3xl border bg-white p-5 shadow-sm">
            {!loggedIn ? (
              <div className="text-sm text-slate-500">
                <p className="font-bold text-slate-700">ログインするとマイ単語帳を保存できます。</p>
                <p className="mt-2">無料でも1ページ分の印刷は試せます。保存したい場合はログインしてください。</p>
                <Link href="/#auth" className="mt-4 inline-block rounded-xl bg-blue-600 px-4 py-2 font-bold text-white">
                  ログインする
                </Link>
              </div>
            ) : loadingMine ? (
              <p className="text-sm text-slate-500">読み込み中...</p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-black">保存済みの単語帳</h2>
                  <button
                    type="button"
                    onClick={createNewMyBook}
                    className="rounded-xl border px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                  >
                    新規作成
                  </button>
                </div>
                <div className="mt-4 space-y-2">
                  {myBooks.map((book) => (
                    <button
                      key={book.id}
                      type="button"
                      onClick={() => setSelectedMyBookId(book.id)}
                      className={`w-full rounded-2xl border px-4 py-3 text-left ${
                        selectedMyBookId === book.id ? "border-blue-400 bg-blue-50" : "bg-white hover:bg-slate-50"
                      }`}
                    >
                      <p className="font-bold text-slate-900">{book.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{book.wordCount}語</p>
                    </button>
                  ))}
                  {myBooks.length === 0 && <p className="text-sm text-slate-500">まだマイ単語帳はありません。</p>}
                </div>
              </>
            )}
          </section>

          <section className="rounded-3xl border bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-black">マイ単語帳を編集</h2>
              <div className="flex flex-wrap gap-2">
                {selectedMyBookId && (
                  <>
                    <Link
                      href={`/listening?source=my&id=${encodeURIComponent(selectedMyBookId)}`}
                      className="rounded-xl border px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                    >
                      聞き流し
                    </Link>
                    <Link
                      href={`/?book=${encodeURIComponent(selectedMyBookId)}`}
                      className="rounded-xl border px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                    >
                      自由作成で開く
                    </Link>
                  </>
                )}
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-bold">タイトル</label>
                <input
                  value={editorTitle}
                  onChange={(e) => setEditorTitle(e.target.value)}
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-bold">説明</label>
                <input
                  value={editorDescription}
                  onChange={(e) => setEditorDescription(e.target.value)}
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="mt-5 overflow-auto rounded-2xl border">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="border p-2">番号</th>
                    <th className="border p-2">英語</th>
                    <th className="border p-2">日本語</th>
                    <th className="border p-2">Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {editorRows.map((row, index) => (
                    <tr key={index}>
                      <td className="border p-2">
                        <input
                          type="number"
                          value={row.no}
                          onChange={(e) => updateRow(index, "no", Number(e.target.value))}
                          className="w-full rounded-lg border px-2 py-1"
                        />
                      </td>
                      <td className="border p-2">
                        <input
                          value={row.english}
                          onChange={(e) => updateRow(index, "english", e.target.value)}
                          className="w-full rounded-lg border px-2 py-1"
                        />
                      </td>
                      <td className="border p-2">
                        <input
                          value={row.japanese}
                          onChange={(e) => updateRow(index, "japanese", e.target.value)}
                          className="w-full rounded-lg border px-2 py-1"
                        />
                      </td>
                      <td className="border p-2">
                        <input
                          value={row.unit}
                          onChange={(e) => updateRow(index, "unit", e.target.value)}
                          className="w-full rounded-lg border px-2 py-1"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={addRow}
                className="rounded-xl border px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                行を追加
              </button>
              <button
                type="button"
                onClick={saveMyBook}
                disabled={saving || !loggedIn}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300"
              >
                {saving ? "保存中..." : selectedMyBookId ? "更新する" : "保存する"}
              </button>
              {selectedMyBookId && (
                <button
                  type="button"
                  onClick={deleteMyBook}
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-100"
                >
                  削除する
                </button>
              )}
            </div>

            {myMessage && (
              <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm font-bold text-slate-700">{myMessage}</p>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
