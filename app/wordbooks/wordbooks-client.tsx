"use client";

import { popularizeText } from "@/lib/display-text";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildWordbookPath } from "@/lib/wordbook-slug";
import { defaultCommunityCover, type CommunitySubject } from "@/lib/community-wordbook-types";
import { POPULARITY_DISPLAY_MIN } from "@/lib/wordbook-popularity";

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
  copied?: boolean;
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
      cache: "no-store",
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

  const selectedCopied = myBooks.find((book) => book.id === selectedMyBookId)?.copied === true;

  // 単語帳ごとの使用者数（推定込み）。人気順に並べ、表紙に人数を出す。
  const [popularity, setPopularity] = useState<Record<string, number>>({});
  useEffect(() => {
    let alive = true;
    fetch("/api/wordbooks/popularity")
      .then((res) => res.json())
      .then((data) => {
        if (alive && data?.counts && typeof data.counts === "object") setPopularity(data.counts as Record<string, number>);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const filteredOfficialBooks = useMemo(() => {
    const query = officialSearch.trim().toLowerCase();
    const users = (id: string) => popularity[String(id)] ?? 0;
    return [...officialBooks, ...communityBooks].sort((a, b) => users(b.id) - users(a.id)).filter((book) => {
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
  }, [officialBooks, communityBooks, communityFilter, officialFilter, officialSearch, popularity]);

  const [showFilters, setShowFilters] = useState(false);
  const [subjectFilter, setSubjectFilter] = useState<"all" | CommunitySubject>("all");
  const [expanded, setExpanded] = useState("");
  const filterActive = communityFilter !== "all" || subjectFilter !== "all" || officialFilter !== "all";

  function subjectOf(book: OfficialWordbook): CommunitySubject {
    if (book.subject) return book.subject;
    return /古文|漢文|漢字|国語|現代文|四字熟語|ことわざ/.test(book.title) ? "国語" : "英語";
  }

  const sections = useMemo(() => {
    const all = filteredOfficialBooks.filter((book) => subjectFilter === "all" || subjectOf(book) === subjectFilter);
    const searching = officialSearch.trim().length > 0 || filterActive;
    if (searching) return [{ key: "result", title: `検索結果 ${all.length}件`, books: all, flat: true }];
    const defs = [
      { key: "popular", title: "🔥 人気ランキング", books: all },
      { key: "english", title: "英語", books: all.filter((book) => subjectOf(book) === "英語") },
      { key: "japanese", title: "国語", books: all.filter((book) => subjectOf(book) === "国語") },
    ].filter((section) => section.books.length > 0);
    return defs.map((section) => ({ ...section, flat: expanded === section.key }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredOfficialBooks, subjectFilter, officialSearch, filterActive, expanded]);

  function renderCard(book: OfficialWordbook) {
    const words = Array.isArray(book.words) ? book.words : [];
    const wordCount = typeof book.wordCount === "number" ? book.wordCount : words.length;
    const detailPath = book.community ? `/shared/${encodeURIComponent(book.id)}` : buildWordbookPath(book.id, book.title);
    const users = popularity[String(book.id)] ?? 0;
    return (
      <Link key={book.id} href={detailPath} prefetch={false} className="block min-w-0 overflow-hidden rounded-xl border bg-white shadow-sm active:scale-[0.98] hover:border-blue-300">
        <div className="relative aspect-[4/3] w-full">
          <img src={book.coverImage || defaultCommunityCover(book.subject ?? "その他")} alt="" loading="lazy" className="h-full w-full object-cover" />
          <span className="absolute bottom-1 left-1 rounded-full bg-slate-900/75 px-1.5 py-0.5 text-[9px] font-black text-white">
            {users >= POPULARITY_DISPLAY_MIN ? `👤約${users.toLocaleString()}人` : "新着"}
          </span>
        </div>
        <div className="p-1.5 sm:p-2">
          <h3 className="line-clamp-2 min-h-[2.1rem] text-[11px] font-black leading-snug text-slate-900 sm:text-xs">{book.title}</h3>
          <p className="mt-0.5 text-[10px] text-slate-400">{wordCount}語 · {book.community ? "共有" : planLabel(book.requiredPlan)}</p>
        </div>
      </Link>
    );
  }

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
          dedupe: true,
          requiredPlan: book.community ? "free" : book.requiredPlan,
          coverImage: book.coverImage,
          sourceId: book.community ? undefined : book.id,
          subject: book.subject,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.wordbook) {
        setMyMessage(result.error ?? "マイ単語帳への追加に失敗しました。");
        return;
      }

      setTab("my");
      setSelectedMyBookId(String(result.wordbook.id));
      setMyMessage(result.duplicate ? "すでにマイ単語帳に入っています。" : "マイ単語帳に追加しました。");
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
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-black text-slate-900 sm:text-2xl">単語帳</h1>
        <div className="flex gap-2">
          {tab === "my" ? (
            <button onClick={() => setTab("official")} className="rounded-lg border bg-white px-3 py-1.5 text-xs font-bold sm:text-sm">← 一覧へ</button>
          ) : (
            <button onClick={() => setTab("my")} className="rounded-lg border bg-white px-3 py-1.5 text-xs font-bold sm:text-sm">自作・編集</button>
          )}
          <Link href="/" className="rounded-lg border bg-white px-3 py-1.5 text-xs font-bold sm:text-sm">自由作成</Link>
        </div>
      </div>

      {error && <div className="mt-4 rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {tab === "official" ? (
        <>
          <div className="mt-3 flex gap-2">
            <input
              value={officialSearch}
              onChange={(event) => setOfficialSearch(event.target.value)}
              placeholder="単語帳名・作成者で検索"
              aria-label="単語帳を検索"
              className="min-w-0 flex-1 rounded-xl border bg-white px-3 py-2.5 text-sm"
            />
            <button
              type="button"
              onClick={() => setShowFilters((value) => !value)}
              className={`shrink-0 rounded-xl border px-3 py-2.5 text-sm font-bold ${showFilters || filterActive ? "border-blue-600 bg-blue-50 text-blue-700" : "bg-white text-slate-700"}`}
            >
              条件{filterActive ? "●" : ""}
            </button>
          </div>
          {showFilters && (
            <div className="mt-2 grid gap-2 rounded-xl border bg-white p-3 text-xs">
              {([
                ["種類", [["all", "すべて"], ["official", "人気教材"], ["community", "みんなの投稿"]] as const, communityFilter, setCommunityFilter],
                ["教科", [["all", "すべて"], ["英語", "英語"], ["国語", "国語"], ["その他", "その他"]] as const, subjectFilter, setSubjectFilter],
                ["プラン", [["all", "すべて"], ["free", "Free"], ["personal", "Personal"], ["teacher", "Teacher"]] as const, officialFilter, setOfficialFilter],
              ] as const).map(([label, options, current, setter]) => (
                <div key={label} className="flex flex-wrap items-center gap-1.5">
                  <span className="w-12 font-black text-slate-500">{label}</span>
                  {options.map(([value, text]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => (setter as (v: never) => void)(value as never)}
                      className={`rounded-full px-3 py-1 font-bold ${current === value ? "bg-blue-600 text-white" : "border bg-white text-slate-700"}`}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}

          {loadingOfficial ? (
            <div className="mt-12 text-center text-slate-400">読み込み中...</div>
          ) : filteredOfficialBooks.length === 0 ? (
            <div className="mt-12 rounded-2xl border bg-white p-8 text-center">
              <p className="font-black text-slate-700">条件に合う単語帳がありません</p>
            </div>
          ) : sections.map((section) => (
            <section key={section.key} className="mt-5">
              <div className="flex items-end justify-between gap-2">
                <h2 className="text-base font-black text-slate-900 sm:text-lg">{section.title}</h2>
                {!section.flat && section.books.length > 0 ? (
                  <button type="button" onClick={() => setExpanded(section.key)} className="text-xs font-black text-blue-700 hover:underline">すべて見る（{section.books.length}）</button>
                ) : null}
              </div>
              <div className={`mt-2 grid grid-cols-3 gap-x-2 gap-y-3 sm:grid-cols-4 sm:gap-x-3 lg:grid-cols-6 ${section.flat ? "" : "grid-rows-1 auto-rows-[0] overflow-hidden"}`}>
                {section.books.map(renderCard)}
              </div>
            </section>
          ))}
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
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700 sm:px-3 sm:py-1 sm:text-xs">{book.copied ? "取り込み（編集不可）" : book.published ? "公開中" : "非公開"}</span>
                          <span className="text-[10px] font-bold text-slate-400 sm:text-xs">{book.wordCount}語</span>
                        </div>
                        <h2 className="mt-1.5 line-clamp-2 min-h-[2.35rem] text-xs font-black leading-snug text-slate-900 sm:mt-3 sm:min-h-0 sm:text-lg">{book.title}</h2>
                        <p className="mt-2 hidden line-clamp-2 min-h-10 text-sm leading-5 text-slate-500 sm:block">
                          {book.copied ? "みんなの単語帳から取り込んだ単語帳です。" : book.description || "自分で保存した単語帳です。"}
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
                            {book.copied ? "開く" : "編集"}
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
              <h2 className="text-lg font-black">{selectedCopied ? "取り込んだ単語帳（閲覧のみ）" : selectedMyBookId ? "自分の単語帳を編集" : "自分の単語帳を新しく作る"}</h2>
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

            {selectedCopied ? (
              <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800">
                みんなの単語帳から取り込んだ単語帳は、内容を書き換えたり公開したりできません。自分用に学習・印刷する用途でお使いください。内容を変えたいときは「新規作成」で自分の単語帳を作ってください。不要なときは「削除する」で外せます。
              </p>
            ) : null}
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <label className="block text-sm font-bold">タイトル</label>
                <input
                  value={editorTitle}
                  disabled={selectedCopied}
                  onChange={(e) => setEditorTitle(e.target.value)}
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="block text-sm font-bold">説明</label>
                <input
                  value={editorDescription}
                  disabled={selectedCopied}
                  onChange={(e) => setEditorDescription(e.target.value)}
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm disabled:bg-slate-100"
                />
              </div>
            </div>

            <div className="mt-4 hidden grid-cols-[4rem_1fr_1fr_8rem] gap-2 px-1 text-xs font-black text-slate-500 sm:grid">
              <span>番号</span><span>英語</span><span>日本語</span><span>Unit</span>
            </div>
            <div className="mt-2 max-h-[60dvh] space-y-2 overflow-auto rounded-2xl border bg-slate-50 p-2 sm:mt-1">
              {editorRows.map((row, index) => (
                <div key={index} className="grid grid-cols-[3.2rem_1fr] gap-1.5 rounded-xl bg-white p-2 shadow-sm sm:grid-cols-[4rem_1fr_1fr_8rem] sm:bg-transparent sm:p-0 sm:shadow-none">
                  <input
                    type="number"
                    inputMode="numeric"
                    aria-label="番号"
                    value={row.no}
                    disabled={selectedCopied}
                    onChange={(e) => updateRow(index, "no", Number(e.target.value))}
                    className="w-full rounded-lg border px-2 py-1.5 text-sm disabled:bg-slate-100"
                  />
                  <input
                    aria-label="英語"
                    placeholder="英語"
                    value={row.english}
                    disabled={selectedCopied}
                    onChange={(e) => updateRow(index, "english", e.target.value)}
                    className="w-full rounded-lg border px-2 py-1.5 text-sm disabled:bg-slate-100"
                  />
                  <input
                    aria-label="日本語"
                    placeholder="日本語"
                    value={row.japanese}
                    disabled={selectedCopied}
                    onChange={(e) => updateRow(index, "japanese", e.target.value)}
                    className="col-span-2 w-full rounded-lg border px-2 py-1.5 text-sm disabled:bg-slate-100 sm:col-span-1"
                  />
                  <input
                    aria-label="Unit"
                    placeholder="Unit（任意）"
                    value={row.unit}
                    disabled={selectedCopied}
                    onChange={(e) => updateRow(index, "unit", e.target.value)}
                    className="col-span-2 w-full rounded-lg border px-2 py-1.5 text-sm disabled:bg-slate-100 sm:col-span-1"
                  />
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {!selectedCopied ? (
                <>
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
                </>
              ) : null}
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

            {!selectedCopied ? <details className="mt-6 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
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
            </details> : null}

            {myMessage && (
              <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm font-bold text-slate-700">{myMessage}</p>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
