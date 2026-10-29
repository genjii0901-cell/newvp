"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildWordbookPath } from "@/lib/wordbook-slug";
import { defaultCommunityCover, type CommunitySubject } from "@/lib/community-wordbook-types";

type Plan = "free" | "personal" | "teacher";
type Word = { no: number; english: string; japanese: string; unit: string | null };
export type OfficialWordbook = {
  id: string;
  title: string;
  description: string;
  coverImage?: string | null;
  requiredPlan: Plan;
  wordCount?: number;
  unitCount?: number;
  firstWord?: string | null;
  creator?: string;
  community?: boolean;
  subject?: CommunitySubject;
  words?: Word[];
};
type MyWordbook = {
  id: string;
  title: string;
  description: string;
  wordCount: number;
  words: Word[];
  published?: boolean;
  creatorName?: string;
  anonymous?: boolean;
  subject?: CommunitySubject;
  coverImage?: string | null;
};
type Tab = "official" | "my";
type EditableRow = { no: number; english: string; japanese: string; unit: string };

function planLabel(plan: Plan) {
  if (plan === "teacher") return "Teacher";
  if (plan === "personal") return "Personal";
  return "Free";
}

function displayCreatorName(creator?: string | null) {
  const value = creator?.trim();
  return !value || value.toLowerCase() === "vocab print pro" ? "非公開" : value;
}

function emptyRows() {
  return Array.from({ length: 8 }, (_, index) => ({
    no: index + 1,
    english: "",
    japanese: "",
    unit: "",
  }));
}

export default function WordbooksClient({
  initialOfficialBooks = [],
}: {
  initialOfficialBooks?: OfficialWordbook[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<Tab>("official");
  const [officialBooks, setOfficialBooks] = useState<OfficialWordbook[]>(initialOfficialBooks.map((book) => ({ ...book, creator: displayCreatorName(book.creator) })));
  const [communityBooks, setCommunityBooks] = useState<OfficialWordbook[]>([]);
  const [communityPage, setCommunityPage] = useState(0);
  const [hasMoreCommunity, setHasMoreCommunity] = useState(false);
  const [communityFilter, setCommunityFilter] = useState<"all" | "official" | "community">("all");
  const [myBooks, setMyBooks] = useState<MyWordbook[]>([]);
  const [loadingOfficial, setLoadingOfficial] = useState(initialOfficialBooks.length === 0);
  const [loadingMine, setLoadingMine] = useState(true);
  const [error, setError] = useState("");
  const [officialFilter, setOfficialFilter] = useState<Plan | "all">("all");
  const [officialSearch, setOfficialSearch] = useState("");
  const [expandedDescriptionId, setExpandedDescriptionId] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [selectedMyBookId, setSelectedMyBookId] = useState("");
  const [editorTitle, setEditorTitle] = useState("マイ単語帳");
  const [editorDescription, setEditorDescription] = useState("");
  const [editorSubject, setEditorSubject] = useState<CommunitySubject>("英語");
  const [editorCreatorName, setEditorCreatorName] = useState("");
  const [editorAnonymous, setEditorAnonymous] = useState(true);
  const [editorCoverImage, setEditorCoverImage] = useState("");
  const [editorPublished, setEditorPublished] = useState(false);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [editorRows, setEditorRows] = useState<EditableRow[]>(emptyRows());
  const [saving, setSaving] = useState(false);
  const [savingOfficialId, setSavingOfficialId] = useState("");
  const [myMessage, setMyMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "my") setTab("my");
  }, []);

  useEffect(() => {
    if (initialOfficialBooks.length > 0) return;

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
      setOfficialBooks(books.map((book: OfficialWordbook) => ({ ...book, creator: displayCreatorName(book.creator) })));
      setLoadingOfficial(false);
    }

    loadOfficialBooks().catch(() => {
      setError("みんなの単語帳を読み込めませんでした。");
      setLoadingOfficial(false);
    });
  }, [initialOfficialBooks.length]);

  async function loadCommunityBooks(page = 0) {
    const response = await fetch(`/api/community/wordbooks?page=${page}`, { cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (response.ok && Array.isArray(result.wordbooks)) {
      setCommunityBooks((current) => page === 0 ? result.wordbooks : [...current, ...result.wordbooks]);
      setCommunityPage(page);
      setHasMoreCommunity(result.wordbooks.length === (page === 0 ? 63 : 60));
    }
  }

  useEffect(() => { void loadCommunityBooks(); }, []);

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
      setEditorSubject("英語");
      setEditorCreatorName("");
      setEditorAnonymous(true);
      setEditorCoverImage("");
      setEditorPublished(false);
      setRightsConfirmed(false);
      return;
    }

    setEditorTitle(selected.title);
    setEditorDescription(selected.description ?? "");
    setEditorSubject(selected.subject ?? "英語");
    setEditorCreatorName(selected.creatorName ?? "");
    setEditorAnonymous(selected.anonymous === true || selected.creatorName?.trim() === "Vocab Print Pro");
    setEditorCoverImage(selected.coverImage ?? "");
    setEditorPublished(selected.published === true);
    setRightsConfirmed(false);
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
    return [...officialBooks, ...communityBooks].filter((book) => {
      if (communityFilter === "official" && book.community) return false;
      if (communityFilter === "community" && !book.community) return false;
      const inPlan = officialFilter === "all" || book.requiredPlan === officialFilter;
      if (!inPlan) return false;
      if (!query) return true;
      return [book.title, book.description, book.creator ?? "", book.requiredPlan]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [officialBooks, communityBooks, communityFilter, officialFilter, officialSearch]);

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
    setEditorSubject("英語");
    setEditorCreatorName("");
    setEditorAnonymous(true);
    setEditorCoverImage("");
    setEditorPublished(false);
    setRightsConfirmed(false);
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

  async function uploadCover(file: File) {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) { setMyMessage("画像の登録にはログインしてください。"); return; }
    setUploadingCover(true);
    setMyMessage("");
    try {
      if (!file.type.startsWith("image/")) throw new Error("画像ファイルを選んでください。");
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      try {
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error("画像を読み込めませんでした。"));
          image.src = objectUrl;
        });
        const ratio = Math.min(1, 1000 / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * ratio));
        canvas.height = Math.max(1, Math.round(image.height * ratio));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("画像を加工できませんでした。");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.78);
        const response = await fetch("/api/community/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ dataUrl }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.url) throw new Error(result.message ?? "画像を登録できませんでした。");
        setEditorCoverImage(result.url);
        setMyMessage("表紙画像を登録しました。公開ボタンで反映されます。");
      } finally { URL.revokeObjectURL(objectUrl); }
    } catch (reason) {
      setMyMessage(reason instanceof Error ? reason.message : "画像を登録できませんでした。");
    } finally { setUploadingCover(false); }
  }

  async function publishMyBook() {
    if (!supabase || !selectedMyBookId) { setMyMessage("先に単語帳を保存してください。"); return; }
    if (!rightsConfirmed) { setMyMessage("自分で作った内容であることを確認してください。"); return; }
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) { setMyMessage("公開にはログインしてください。"); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/community/wordbooks", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: selectedMyBookId, subject: editorSubject, creatorName: editorCreatorName, anonymous: editorAnonymous, coverImage: editorCoverImage, originalWork: true }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message ?? "公開できませんでした。");
      setMyMessage("みんなの単語帳に公開しました。");
      await Promise.all([loadMyBooks(), loadCommunityBooks()]);
    } catch (reason) { setMyMessage(reason instanceof Error ? reason.message : "公開できませんでした。"); }
    finally { setSaving(false); }
  }

  async function unpublishMyBook() {
    if (!supabase || !selectedMyBookId || !window.confirm("この単語帳の公開を停止しますか？")) return;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    setSaving(true);
    try {
      const response = await fetch("/api/community/wordbooks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: selectedMyBookId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message ?? "公開を停止できませんでした。");
      setMyMessage("公開を停止しました。マイ単語帳は残っています。");
      await Promise.all([loadMyBooks(), loadCommunityBooks()]);
    } catch (reason) { setMyMessage(reason instanceof Error ? reason.message : "公開を停止できませんでした。"); }
    finally { setSaving(false); }
  }

  async function addOfficialToMyWordbooks(book: OfficialWordbook) {
    if (!supabase) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setTab("my");
      setMyMessage("みんなの単語帳をマイ単語帳に追加するにはログインしてください。");
      return;
    }

    setSavingOfficialId(book.id);
    setMyMessage("");
    try {
      const endpoint = book.community ? "/api/community/wordbooks" : "/api/wordbooks/official";
      const detailResponse = await fetch(`${endpoint}?id=${encodeURIComponent(book.id)}&includeWords=1`);
      const detailResult = await detailResponse.json().catch(() => ({}));
      const detailBook = Array.isArray(detailResult.wordbooks)
        ? detailResult.wordbooks.find((item: { id?: string | number }) => String(item.id) === String(book.id))
        : null;
      const words = Array.isArray(detailBook?.words)
        ? detailBook.words
            .filter((word: { english?: string; japanese?: string }) => word.english && word.japanese)
            .map((word: { no?: number; english?: string; japanese?: string; unit?: string | null }, index: number) => ({
              no: Number(word.no) || index + 1,
              english: word.english ?? "",
              japanese: word.japanese ?? "",
              unit: word.unit ?? "",
            }))
        : [];

      if (words.length === 0) {
        setMyMessage("追加できる単語が見つかりませんでした。");
        return;
      }

      const response = await fetch("/api/me/wordbooks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: book.title,
          description: `${book.title}をみんなの単語帳から追加しました。`,
          words,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.wordbook) {
        setMyMessage(result.error ?? "マイ単語帳への追加に失敗しました。");
        return;
      }

      setTab("my");
      setSelectedMyBookId(String(result.wordbook.id));
      setMyMessage("マイ単語帳に追加しました。");
      await loadMyBooks();
    } finally {
      setSavingOfficialId("");
    }
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
          <div className="mt-5 flex flex-wrap gap-2" aria-label="単語帳の種類">
            {([["all", "すべて"], ["official", "人気教材"], ["community", "みんなの投稿"]] as const).map(([value, text]) => (
              <button key={value} type="button" onClick={() => setCommunityFilter(value)} className={`rounded-lg px-3 py-2 text-sm font-bold ${communityFilter === value ? "bg-slate-900 text-white" : "border bg-white text-slate-700"}`}>{text}</button>
            ))}
          </div>
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
            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:mt-6 sm:gap-4 lg:grid-cols-3">
              {filteredOfficialBooks.map((book) => {
                const words = Array.isArray(book.words) ? book.words : [];
                const units =
                  typeof book.unitCount === "number"
                    ? book.unitCount
                    : new Set(words.map((word) => word.unit).filter(Boolean)).size;
                const wordCount = typeof book.wordCount === "number" ? book.wordCount : words.length;
                const firstWord = book.firstWord ?? words[0]?.english ?? "";
                const detailPath = book.community ? `/shared/${encodeURIComponent(book.id)}` : buildWordbookPath(book.id, book.title);
                return (
                  <article
                    key={book.id}
                    onClick={() => {
                      window.location.href = detailPath;
                    }}
                    className="flex h-[255px] min-w-0 cursor-pointer flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition active:scale-[0.99] hover:border-blue-200 sm:h-[390px] sm:rounded-3xl sm:hover:-translate-y-0.5 sm:hover:shadow-md"
                  >
                    <img src={book.coverImage || defaultCommunityCover(book.subject ?? "その他")} alt={`${book.title}の表紙`} loading="lazy" className="h-24 w-full shrink-0 object-cover sm:h-40" />
                    <div className="flex min-h-0 flex-1 flex-col p-2 sm:p-5">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 sm:px-3 sm:py-1 sm:text-xs">
                          {book.community ? `${book.subject ?? "その他"} · 共有` : planLabel(book.requiredPlan)}
                        </span>
                        <span className="text-[10px] text-slate-400 sm:text-xs">{wordCount}語</span>
                      </div>
                      <h2 className="mt-1 line-clamp-2 min-h-[2.35rem] text-xs font-black leading-snug text-slate-900 sm:mt-3 sm:min-h-[3.5rem] sm:text-xl">{book.title}</h2>
                      <p className="mt-1 hidden truncate text-xs font-bold text-slate-400 sm:block">
                        作成者: {displayCreatorName(book.creator)}
                      </p>
                      <div className="mt-1 hidden sm:mt-2 sm:block">
                        <p className={`text-xs leading-5 text-slate-500 sm:text-sm sm:leading-6 ${expandedDescriptionId === book.id ? "" : "line-clamp-3"}`}>{book.description || (book.community ? "みんなが作成した単語帳です。" : "人気の単語帳です。")}</p>
                        {(book.description?.length ?? 0) > 90 ? <button type="button" onClick={(event) => { event.stopPropagation(); setExpandedDescriptionId((value) => value === book.id ? "" : book.id); }} className="mt-1 text-xs font-black text-blue-700 hover:underline">{expandedDescriptionId === book.id ? "閉じる" : "続きを読む"}</button> : null}
                      </div>
                      <div className="mt-2 hidden gap-4 text-xs text-slate-500 sm:mt-4 sm:flex">
                        {units > 0 ? <span>{units}ユニット</span> : null}
                        {firstWord ? <span>最初: {firstWord}</span> : null}
                      </div>
                      <div className="mt-auto grid gap-1.5 pt-1.5 sm:flex sm:flex-wrap sm:gap-2 sm:pt-4">
                        <Link
                          href={detailPath}
                          prefetch={false}
                          onClick={(event) => event.stopPropagation()}
                          className="rounded-lg bg-blue-600 px-2 py-1.5 text-center text-[11px] font-bold text-white hover:bg-blue-700 sm:rounded-xl sm:px-4 sm:py-2 sm:text-sm"
                        >
                          開く
                        </Link>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void addOfficialToMyWordbooks(book);
                          }}
                          disabled={savingOfficialId === book.id}
                          className="rounded-lg border px-2 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400 sm:rounded-xl sm:px-4 sm:py-2 sm:text-sm"
                        >
                          {savingOfficialId === book.id ? "追加中..." : "マイ追加"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {hasMoreCommunity && communityFilter !== "official" ? <button type="button" onClick={() => { void loadCommunityBooks(communityPage + 1); }} className="mx-auto mt-6 block rounded-xl border bg-white px-5 py-2 text-sm font-bold text-blue-700">みんなの投稿をもっと見る</button> : null}
        </>
      ) : (
        <div className="mt-6 grid gap-6">
          <section className="rounded-3xl border bg-white p-5 shadow-sm">
            {!loggedIn ? (
              <div className="text-sm text-slate-500">
                <p className="font-bold text-slate-700">ログインするとマイ単語帳を保存できます。</p>
                <p className="mt-2">アカウント作成は無料です。印刷は1ページ50円の都度購入、またはPersonalで利用できます。</p>
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
                <div className="mt-4 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3">
                  {myBooks.map((book) => (
                    <article
                      key={book.id}
                      onClick={() => setSelectedMyBookId(book.id)}
                      className={`min-w-0 cursor-pointer overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:rounded-3xl ${
                        selectedMyBookId === book.id ? "border-blue-400 ring-2 ring-blue-100" : ""
                      }`}
                    >
                      <img src={book.coverImage || defaultCommunityCover(book.subject ?? "英語")} alt={`${book.title}の表紙`} className="h-20 w-full object-cover sm:h-28" />
                      <div className="p-2 sm:p-4">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700 sm:px-3 sm:py-1 sm:text-xs">{book.published ? "公開中" : "非公開"}</span>
                          <span className="text-[10px] font-bold text-slate-400 sm:text-xs">{book.wordCount}語</span>
                        </div>
                        <h2 className="mt-1.5 line-clamp-2 min-h-[2.35rem] text-xs font-black leading-snug text-slate-900 sm:mt-3 sm:min-h-0 sm:text-lg">{book.title}</h2>
                        <p className="mt-2 hidden line-clamp-2 min-h-10 text-sm leading-5 text-slate-500 sm:block">
                          {book.description || "自分で保存した単語帳です。"}
                        </p>
                        <div className="mt-2 grid gap-1.5 sm:mt-4 sm:flex sm:flex-wrap sm:gap-2">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedMyBookId(book.id);
                            }}
                            className="rounded-lg bg-blue-600 px-2 py-1.5 text-[11px] font-black text-white hover:bg-blue-700 sm:rounded-xl sm:px-3 sm:py-2 sm:text-xs"
                          >
                            編集
                          </button>
                          <Link
                            href={`/?book=${encodeURIComponent(book.id)}`}
                            onClick={(event) => event.stopPropagation()}
                            className="rounded-lg border px-2 py-1.5 text-center text-[11px] font-black text-slate-700 hover:bg-slate-50 sm:rounded-xl sm:px-3 sm:py-2 sm:text-xs"
                          >
                            印刷作成
                          </Link>
                          {book.published ? <Link href={`/shared/${encodeURIComponent(book.id)}`} onClick={(event) => event.stopPropagation()} className="rounded-lg border px-2 py-1.5 text-center text-[11px] font-black text-blue-700 sm:rounded-xl sm:px-3 sm:py-2 sm:text-xs">公開ページ</Link> : null}
                        </div>
                      </div>
                    </article>
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

            <details className="mt-6 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
              <summary className="cursor-pointer text-sm font-black text-blue-900">みんなの単語帳に共有する（無料）{editorPublished ? " · 公開中" : ""}</summary>
              <p className="mt-3 text-xs leading-5 text-slate-600">単語帳を保存してから公開できます。公開するとタイトル・説明・単語と表紙を誰でも閲覧できます。メールアドレスは表示しません。</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-bold text-slate-700">教科・言語
                  <select value={editorSubject} onChange={(event) => setEditorSubject(event.target.value as CommunitySubject)} className="mt-1 block w-full rounded-lg border bg-white px-3 py-2">
                    {(["英語", "国語", "多言語", "その他"] as const).map((subject) => <option key={subject} value={subject}>{subject}</option>)}
                  </select>
                </label>
                <label className="text-sm font-bold text-slate-700">表示名（省略すると自動で仮名を設定）
                  <input value={editorCreatorName} onChange={(event) => setEditorCreatorName(event.target.value)} maxLength={30} disabled={editorAnonymous} placeholder="例: ことば好き" className="mt-1 block w-full rounded-lg border bg-white px-3 py-2 disabled:bg-slate-100" />
                </label>
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm font-bold text-slate-700"><input type="checkbox" checked={editorAnonymous} onChange={(event) => setEditorAnonymous(event.target.checked)} />作成者名を非公開にする</label>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <img src={editorCoverImage || defaultCommunityCover(editorSubject)} alt="公開用の表紙プレビュー" className="h-20 w-28 rounded-lg border object-cover" />
                <label className={`rounded-lg border bg-white px-3 py-2 text-sm font-bold ${selectedMyBookId ? "cursor-pointer text-blue-700" : "cursor-not-allowed text-slate-400"}`}>{uploadingCover ? "画像を登録中..." : "表紙画像を選ぶ"}
                  <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploadingCover || !selectedMyBookId} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadCover(file); event.target.value = ""; }} className="sr-only" />
                </label>
                <span className="text-xs text-slate-500">先に単語帳を保存してください。画像がなければ教科別の表紙を自動設定します。</span>
              </div>
              <label className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-700"><input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} className="mt-1" />自分で作った内容で、公開してよいことを確認しました。市販教材などのコピーは公開しません。</label>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => { void publishMyBook(); }} disabled={saving || uploadingCover || !selectedMyBookId} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300">{editorPublished ? "公開情報を更新" : "公開する"}</button>
                {editorPublished ? <button type="button" onClick={() => { void unpublishMyBook(); }} disabled={saving} className="rounded-lg border bg-white px-4 py-2 text-sm font-bold text-slate-700">公開を停止</button> : null}
                {editorPublished && selectedMyBookId ? <Link href={`/shared/${encodeURIComponent(selectedMyBookId)}`} className="rounded-lg border bg-white px-4 py-2 text-sm font-bold text-blue-700">公開ページを見る</Link> : null}
              </div>
            </details>

            {myMessage && (
              <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm font-bold text-slate-700">{myMessage}</p>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
