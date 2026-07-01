"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildPrintHtml,
  formatPrintDate,
  type PdfType,
  type Direction,
  type PrintStyle,
} from "@/lib/print/builder";
import { fallbackOfficialWordbooksForApi, mergeWordbooksById } from "@/lib/official-wordbooks";

/* 笏笏笏 Types 笏笏笏 */
type Visibility = "public" | "personal" | "teacher" | "admin";

type ParsedWord = { number: string; english: string; japanese: string; unit: string };

type OfficialBook = {
  id: string;
  title: string;
  description: string;
  coverImage: string | null;
  requiredPlan: string;
  visibility: string;
  words: Array<{ no: number; english: string; japanese: string; unit?: string | null }>;
};

const initialAdminBooks: OfficialBook[] = fallbackOfficialWordbooksForApi().map((book) => ({
  id: book.id,
  title: book.title,
  description: book.description,
  coverImage: book.coverImage,
  requiredPlan: book.requiredPlan,
  visibility: book.visibility,
  words: book.words,
}));

/* 笏笏笏 Image presets 笏笏笏 */
const IMAGE_PRESETS = [
  { label: "Library", url: "https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=900&q=80" },
  { label: "Notebook", url: "https://images.unsplash.com/photo-1516979187457-637abb4f9353?auto=format&fit=crop&w=900&q=80" },
  { label: "School", url: "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=900&q=80" },
  { label: "Reading", url: "https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=900&q=80" },
  { label: "Map", url: "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=900&q=80" },
  { label: "Business", url: "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=900&q=80" },
  { label: "Exam", url: "https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&w=900&q=80" },
  { label: "English", url: "https://images.unsplash.com/photo-1571260899304-425eee4c7efc?auto=format&fit=crop&w=900&q=80" },
  { label: "TOEIC", url: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=900&q=80" },
  { label: "Science", url: "https://images.unsplash.com/photo-1532094349884-543559059e3b?auto=format&fit=crop&w=900&q=80" },
  { label: "IT", url: "https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?auto=format&fit=crop&w=900&q=80" },
  { label: "Nature", url: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=900&q=80" },
];

function autoPickImage(title: string): string {
  const t = title.toLowerCase();
  if (/toeic|business/.test(t)) return IMAGE_PRESETS[8].url;
  if (/medical|science|bio|chem/.test(t)) return IMAGE_PRESETS[9].url;
  if (/it|tech|program|computer/.test(t)) return IMAGE_PRESETS[10].url;
  if (/exam|university|entrance/.test(t)) return IMAGE_PRESETS[6].url;
  if (/english|ielts|toefl/.test(t)) return IMAGE_PRESETS[7].url;
  if (/map|geography|world/.test(t)) return IMAGE_PRESETS[4].url;
  if (/junior|elementary|school/.test(t)) return IMAGE_PRESETS[2].url;
  return IMAGE_PRESETS[0].url;
}

/* 笏笏笏 Built-in book templates 笏笏笏 */
const BUILTIN_TEMPLATES = [
  {
    title: "英検対策ベーシック",
    description: "英検や学校学習向けの基本単語をまとめたテンプレートです。",
    visibility: "public" as Visibility,
    coverImage: IMAGE_PRESETS[7].url,
  },
  {
    title: "TOEIC 600 basic",
    description: "TOEIC 600点前後を目指す学習者向けのテンプレートです。",
    visibility: "public" as Visibility,
    coverImage: IMAGE_PRESETS[8].url,
  },
  {
    title: "大学受験標準",
    description: "大学受験に向けた標準レベルの単語帳テンプレートです。",
    visibility: "personal" as Visibility,
    coverImage: IMAGE_PRESETS[6].url,
  },
  {
    title: "中学英単語テンプレ",
    description: "中学英語の確認プリントを作りやすいテンプレートです。",
    visibility: "public" as Visibility,
    coverImage: IMAGE_PRESETS[2].url,
  },
];

/* 笏笏笏 Helpers 笏笏笏 */
const SAMPLE_CSV =
  "number,english,japanese,unit\n1,apple,りんご,Unit 1\n2,book,本,Unit 1\n3,study,勉強する,Unit 1\n4,important,重要な,Unit 2\n5,practice,練習,Unit 2";

function parseWords(text: string): ParsedWord[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l, i) => !(i === 0 && /english/i.test(l) && /japanese/i.test(l)))
    .map((l, i) => {
      const c = l.includes("\t") ? l.split("\t") : l.split(",");
      return {
        number: (c[0] || String(i + 1)).trim(),
        english: (c[1] || "").trim(),
        japanese: (c[2] || "").trim(),
        unit: (c[3] || "").trim(),
      };
    })
    .filter((w) => w.english && w.japanese);
}

function isPersistedBookId(value: string) {
  return /^\d+$/.test(value) || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function visibilityLabel(v: string) {
  if (v === "personal") return "Personal";
  if (v === "teacher") return "Teacher";
  if (v === "admin") return "Admin";
  return "Free";
}
function visibilityColor(v: string) {
  if (v === "personal") return "bg-blue-50 text-blue-700";
  if (v === "teacher") return "bg-purple-50 text-purple-700";
  if (v === "admin") return "bg-red-50 text-red-700";
  return "bg-emerald-50 text-emerald-700";
}

/* 笏笏笏 Image Upload Component 笏笏笏 */
function ImageInput({
  value,
  onChange,
  adminPassword,
  titleHint = "",
}: {
  value: string;
  onChange: (url: string) => void;
  adminPassword: string;
  titleHint?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [mode, setMode] = useState<"url" | "file" | "gallery">("url");

  async function handleFile(file: File) {
    setUploading(true);
    setUploadMsg("");
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/admin/upload-image", {
      method: "POST",
      headers: { "x-admin-password": adminPassword },
      body: form,
    });
    const result = await res.json().catch(() => ({}));
    setUploading(false);
    if (result.ok && result.url) {
      onChange(result.url);
      setUploadMsg("Upload complete");
    } else {
      setUploadMsg(result.message ?? "Upload failed");
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData.items);
    const img = items.find((i) => i.type.startsWith("image/"));
    if (img) {
      e.preventDefault();
      const file = img.getAsFile();
      if (file) handleFile(file);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        <button type="button" onClick={() => setMode("url")} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${mode === "url" ? "bg-blue-600 text-white" : "border text-slate-600"}`}>URL</button>
        <button type="button" onClick={() => setMode("file")} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${mode === "file" ? "bg-blue-600 text-white" : "border text-slate-600"}`}>Upload</button>
        <button type="button" onClick={() => setMode("gallery")} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${mode === "gallery" ? "bg-blue-600 text-white" : "border text-slate-600"}`}>Gallery</button>
        {titleHint && (
          <button type="button" onClick={() => { onChange(autoPickImage(titleHint)); setMode("url"); }} className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50">Auto pick</button>
        )}
      </div>

      {mode === "url" && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={handlePaste}
          placeholder="https://... または画像を直接貼り付け"
          className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      )}
      {mode === "file" && (
        <div
          className="rounded-xl border-2 border-dashed border-slate-300 p-4 text-center cursor-pointer hover:border-blue-400 transition-colors"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) handleFile(file); }}
        >
          {uploading ? <p className="text-sm text-blue-600 font-bold">Uploading...</p> : (
            <>
              <p className="text-sm text-slate-500">Click or drag and drop an image file here.</p>
              <p className="text-xs text-slate-400 mt-1">JPG / PNG / WebP / GIF up to 10MB</p>
            </>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </div>
      )}
      {mode === "gallery" && (
        <div className="grid grid-cols-3 gap-2 max-h-52 overflow-y-auto rounded-xl border p-2">
          {IMAGE_PRESETS.map((img) => (
            <button key={img.url} type="button" onClick={() => { onChange(img.url); setMode("url"); }}
              className={`relative overflow-hidden rounded-lg border-2 transition-all hover:border-blue-400 ${value === img.url ? "border-blue-500 ring-2 ring-blue-200" : "border-transparent"}`}
              title={img.label}
            >
              <img src={img.url} alt={img.label} className="h-14 w-full object-cover" />
              <span className="absolute inset-x-0 bottom-0 bg-black/50 px-1 py-0.5 text-center text-[9px] text-white">{img.label}</span>
            </button>
          ))}
        </div>
      )}

      {uploadMsg && (
        <p className={`mt-2 text-xs font-bold ${uploadMsg.toLowerCase().includes("complete") ? "text-emerald-600" : "text-red-600"}`}>
          {uploadMsg}
        </p>
      )}

      {value && (
        <div className="mt-2 flex items-start gap-2">
          <img
            src={value}
            alt="preview"
            className="h-20 w-32 rounded-xl object-cover border"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-xs text-red-500 hover:underline"
          >
            削除
          </button>
        </div>
      )}
    </div>
  );
}

/* 笏笏笏 Main Component 笏笏笏 */
export default function AdminPage() {
  const [unlocked, setUnlocked] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem("vpp-admin-unlocked") === "1";
  });
  const [password, setPassword] = useState(() => {
    if (typeof window === "undefined") return "";
    return sessionStorage.getItem("vpp-admin-pw") ?? "";
  });
  const [authCode, setAuthCode] = useState("");
  const [authMsg, setAuthMsg] = useState("");

  /* 2FA */
  const [twoFaEnabled, setTwoFaEnabled] = useState<boolean | null>(null);
  const [twoFaSecret, setTwoFaSecret] = useState("");
  const [twoFaQr, setTwoFaQr] = useState("");
  const [twoFaMsg, setTwoFaMsg] = useState("");
  const [twoFaCode, setTwoFaCode] = useState("");
  const [twoFaConfirming, setTwoFaConfirming] = useState(false);
  const [twoFaOk, setTwoFaOk] = useState(false);

  const [tab, setTab] = useState<"create" | "manage" | "pdf">("create");

  /* create */
  const [title, setTitle] = useState("Official Sample Wordbook");
  const [desc, setDesc] = useState("Admin-only official wordbook template.");
  const [coverImage, setCoverImage] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [pasteText, setPasteText] = useState(SAMPLE_CSV);
  const [createMsg, setCreateMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const words = useMemo(() => parseWords(pasteText), [pasteText]);

  /* manage */
  const [books, setBooks] = useState<OfficialBook[]>(initialAdminBooks);
  const [loadingBooks, setLoadingBooks] = useState(false);
  const [manageMsg, setManageMsg] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<"meta" | "words">("meta");
  const [editMeta, setEditMeta] = useState({ title: "", desc: "", coverImage: "", visibility: "public" as Visibility });
  const [editPaste, setEditPaste] = useState("");

  /* pdf builder 窶・all options */
  const [pdfBookId, setPdfBookId] = useState("");
  const [pdfType, setPdfType] = useState<PdfType>("list");
  const [pdfDir, setPdfDir] = useState<Direction>("en-ja");
  const [pdfStartNo, setPdfStartNo] = useState(1);
  const [pdfEndNo, setPdfEndNo] = useState(50);
  const [pdfCount, setPdfCount] = useState(50);
  const [pdfRandom, setPdfRandom] = useState(false);
  const [pdfShowPageNo, setPdfShowPageNo] = useState(true);
  const [pdfPrintStyle, setPdfPrintStyle] = useState<PrintStyle>("standard");
  const [pdfWatermark, setPdfWatermark] = useState(false);
  const [pdfTitle, setPdfTitle] = useState("");
  const [pdfShowRecord, setPdfShowRecord] = useState(true);
  const [pdfClass, setPdfClass] = useState(false);
  const [pdfNumber, setPdfNumber] = useState(false);
  const [pdfName, setPdfName] = useState(true);
  const [pdfDate, setPdfDate] = useState(true);
  const [pdfFooterText, setPdfFooterText] = useState("Created by Vocab Print Pro");
  const [pdfFontScale, setPdfFontScale] = useState(1);
  const [pdfStudentClass, setPdfStudentClass] = useState("");
  const [pdfStudentNumber, setPdfStudentNumber] = useState("");
  const [pdfStudentName, setPdfStudentName] = useState("");
  const [pdfMsg, setPdfMsg] = useState("");

  /* 笏笏 diagnose 笏笏 */
  const [diagResult, setDiagResult] = useState<Record<string, unknown> | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  async function runDiagnose() {
    setDiagLoading(true);
    const pw = sessionStorage.getItem("vpp-admin-pw") ?? password;
    const res = await fetch("/api/admin/diagnose", { headers: { "x-admin-password": pw } }).catch(() => null);
    if (!res) { setDiagResult({ error: "API request failed" }); setDiagLoading(false); return; }
    const data = await res.json().catch(() => ({ error: "Failed to parse response" }));
    setDiagResult(data);
    setDiagLoading(false);
  }

  /* 笏笏 fetch books 笏笏 */
  async function fetchBooks(options?: { silent?: boolean; preserveMessage?: boolean }) {
    if (!options?.silent) setLoadingBooks(true);
    if (!options?.preserveMessage) setManageMsg("");
    const pw = sessionStorage.getItem("vpp-admin-pw") ?? password;
    const res = await fetch("/api/admin/all-wordbooks", {
      headers: { "x-admin-password": pw },
    }).catch(() => null);
    if (!res) { setManageMsg("⚠️ ネットワークエラー: APIに接続できません"); setLoadingBooks(false); return; }
    const data = await res.json().catch(() => ({}));
    const list = Array.isArray(data?.wordbooks) ? data.wordbooks : [];
    // Supabaseのデータだけ使う（テンプレートと混合しない）
    setBooks(list);
    if (!options?.preserveMessage) {
      if (data?.message) setManageMsg(data.message);
      else if (list.length === 0) setManageMsg("Supabaseに単語帳がありません。「単語帳を登録」タブから追加してください。");
    }
    setLoadingBooks(false);
  }

  useEffect(() => { if (unlocked) { fetchBooks(); loadTwoFaStatus(); } }, [unlocked]);
  // タブ切り替え時は初回のみ取得（編集中の変更を上書きしないようsilentで）
  useEffect(() => { if (unlocked && (tab === "manage" || tab === "pdf")) { fetchBooks({ silent: true }); } }, [tab]);
  useEffect(() => {
    if (!pdfBookId && books.length > 0) {
      setPdfBookId(books[0].id);
    }
  }, [books, pdfBookId]);

  /* 笏笏 auth 笏笏 */
  async function unlock() {
    setAuthMsg("");
    const res = await fetch("/api/admin/auth/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, code: authCode }),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok || !result.ok) { setAuthMsg(result.message ?? "認証失敗"); return; }
    // 以降のAPIはトークンで認証する（x-admin-passwordヘッダーにトークンを入れる）
    const token = typeof result.token === "string" ? result.token : password;
    sessionStorage.setItem("vpp-admin-unlocked", "1");
    sessionStorage.setItem("vpp-admin-pw", token);
    setPassword(token);
    setAuthCode("");
    setUnlocked(true);
  }

  function lockAdmin() {
    sessionStorage.removeItem("vpp-admin-unlocked");
    sessionStorage.removeItem("vpp-admin-pw");
    setUnlocked(false);
    setPassword("");
  }

  async function loadTwoFaStatus() {
    const pw = sessionStorage.getItem("vpp-admin-pw") ?? password;
    const res = await fetch("/api/admin/2fa", { headers: { "x-admin-password": pw } }).catch(() => null);
    if (!res) return;
    const r = await res.json().catch(() => ({}));
    if (r.ok) setTwoFaEnabled(Boolean(r.enabled));
  }

  async function setupTwoFa() {
    setTwoFaMsg("");
    const pw = sessionStorage.getItem("vpp-admin-pw") ?? password;
    const res = await fetch("/api/admin/2fa", { method: "POST", headers: { "x-admin-password": pw } }).catch(() => null);
    if (!res) { setTwoFaMsg("通信エラー"); return; }
    const r = await res.json().catch(() => ({}));
    if (!r.ok) { setTwoFaMsg(r.message ?? "設定に失敗しました"); return; }
    // 鍵を生成しただけでは未有効（enabled=0）。確認コード入力で有効化するまでは pending 扱い。
    setTwoFaOk(false);
    setTwoFaCode("");
    setTwoFaSecret(typeof r.secret === "string" ? r.secret : "");
    setTwoFaEnabled(false);
    // otpauth URL をQRコード画像に変換して表示
    if (typeof r.otpauth === "string" && r.otpauth) {
      try {
        const QRCode = (await import("qrcode")).default;
        const dataUrl = await QRCode.toDataURL(r.otpauth, { width: 220, margin: 1 });
        setTwoFaQr(dataUrl);
      } catch {
        setTwoFaQr("");
      }
    }
  }

  // 認証アプリに表示された6桁コードを送り、一致したら2FAを有効化する。
  async function confirmTwoFa() {
    setTwoFaMsg(""); setTwoFaOk(false);
    const code = twoFaCode.trim();
    if (!/^\d{6}$/.test(code)) { setTwoFaMsg("6桁の数字コードを入力してください。"); return; }
    setTwoFaConfirming(true);
    const pw = sessionStorage.getItem("vpp-admin-pw") ?? password;
    const res = await fetch("/api/admin/2fa/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": pw },
      body: JSON.stringify({ code }),
    }).catch(() => null);
    setTwoFaConfirming(false);
    if (!res) { setTwoFaMsg("通信エラー"); return; }
    const r = await res.json().catch(() => ({}));
    if (!r.ok) { setTwoFaMsg(r.message ?? "有効化に失敗しました。"); return; }
    setTwoFaEnabled(true);
    setTwoFaSecret(""); setTwoFaQr(""); setTwoFaCode("");
    setTwoFaOk(true);
    setTwoFaMsg("✅ 2FAを有効化しました。次回ログインから認証コードが必要です。");
  }

  /* 笏笏 create 笏笏 */
  async function createWordbook() {
    if (!title.trim() || words.length === 0) { setCreateMsg("タイトルと単語を入力してください。"); return; }
    setSaving(true); setCreateMsg("");
    const res = await fetch("/api/admin/official-wordbooks", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": password },
      body: JSON.stringify({ title, description: desc, cover_image: coverImage, visibility, words }),
    });
    const result = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setCreateMsg(result.message ?? "保存失敗"); return; }
    setCreateMsg(`✅ 保存しました（${result.wordCount}語）`);
    await fetchBooks();
    setTab("manage");
  }

  /* 笏笏 edit 笏笏 */
  function startEdit(book: OfficialBook, mode: "meta" | "words") {
    setEditId(book.id); setEditMode(mode);
    setEditMeta({ title: book.title, desc: book.description, coverImage: book.coverImage ?? "", visibility: book.visibility as Visibility });
    setEditPaste(book.words.map((w) => `${w.no}\t${w.english}\t${w.japanese}\t${w.unit ?? ""}`).join("\n"));
    setManageMsg("");
  }

  async function saveEdit() {
    if (!editId) return;
    const targetBook = books.find((book) => book.id === editId) ?? null;
    let parsedWords: ParsedWord[] | null = null;
    if (editMode === "words") {
      parsedWords = parseWords(editPaste);
      if (!parsedWords.length) { setManageMsg("有効な単語データがありません。"); return; }
    }

    // Supabaseに未登録のテンプレート単語帳は先にPOSTで登録してIDを取得
    let actualId = editId;
    if (!isPersistedBookId(editId)) {
      const postRes = await fetch("/api/admin/official-wordbooks", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({
          title: editMode === "meta" ? editMeta.title : (targetBook?.title ?? ""),
          description: editMode === "meta" ? editMeta.desc : (targetBook?.description ?? ""),
          cover_image: editMode === "meta" ? editMeta.coverImage : (targetBook?.coverImage ?? null),
          visibility: editMode === "meta" ? editMeta.visibility : (targetBook?.visibility ?? "public"),
          words: parsedWords ?? (targetBook?.words.map((w) => ({ number: w.no, english: w.english, japanese: w.japanese, unit: w.unit })) ?? []),
        }),
      });
      const postResult = await postRes.json().catch(() => ({}));
      if (!postRes.ok) { setManageMsg(postResult.message ?? "Supabaseへの登録失敗"); return; }
      actualId = postResult.wordbook?.id ?? actualId;
      // wordsも一緒に登録済みなのでPATCHは不要
      setBooks((prev) => prev.map((book) => {
        if (book.id !== editId) return book;
        return {
          ...book,
          id: actualId,
          title: editMode === "meta" ? editMeta.title : book.title,
          description: editMode === "meta" ? editMeta.desc : book.description,
          coverImage: editMode === "meta" ? (editMeta.coverImage || null) : book.coverImage,
          visibility: editMode === "meta" ? editMeta.visibility : book.visibility,
          words: parsedWords ? parsedWords.map((w, i) => ({ no: Number(w.number) || i + 1, english: w.english, japanese: w.japanese, unit: w.unit || null })) : book.words,
        };
      }));
      setManageMsg("✅ Supabaseに登録して保存しました");
      setEditId(null);
      return;
    }

    const body: Record<string, unknown> = { id: actualId };
    if (editMode === "meta") {
      body.title = editMeta.title; body.description = editMeta.desc;
      body.cover_image = editMeta.coverImage; body.visibility = editMeta.visibility;
    } else {
      body.words = parsedWords;
    }
    const res = await fetch("/api/admin/official-wordbooks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-password": password },
      body: JSON.stringify(body),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) { setManageMsg(result.message ?? "更新失敗"); return; }
    const nextId = typeof result?.wordbook?.id === "string" && result.wordbook.id ? result.wordbook.id : actualId;
    setBooks((prev) =>
      prev.map((book) => {
        const titleMatch = targetBook ? book.title === targetBook.title : false;
        const idMatch = book.id === editId;
        if (!idMatch && !titleMatch) return book;
        if (editMode === "meta") {
          return {
            ...book,
            id: nextId,
            title: editMeta.title,
            description: editMeta.desc,
            coverImage: editMeta.coverImage || null,
            visibility: editMeta.visibility,
            requiredPlan:
              editMeta.visibility === "teacher" || editMeta.visibility === "admin"
                ? "teacher"
                : editMeta.visibility === "personal"
                  ? "personal"
                  : "free",
          };
        }
        if (!parsedWords) return { ...book, id: nextId };
        return {
          ...book,
          id: nextId,
          words: parsedWords.map((word, index) => ({
            no: Number(word.number) || index + 1,
            english: word.english,
            japanese: word.japanese,
            unit: word.unit || null,
          })),
        };
      }),
    );
    if (result.warning) {
      setManageMsg(`⚠️ ${result.warning} — Supabaseのwordbooksテーブルにカラムを追加してください。`);
    } else {
      setManageMsg(editMode === "words" ? `✅ 単語を更新しました（${result.wordCount}語）` : "✅ メタデータを更新しました");
    }
    setEditId(null);
    // wordsモードのみDBから再取得（metaはローカルstateが正しいため上書きしない）
    if (editMode === "words") await fetchBooks({ silent: true, preserveMessage: true });
  }

  async function deleteBook(id: string, bookTitle: string) {
    if (!isPersistedBookId(id)) {
      setManageMsg("ℹ️ テンプレートの公式単語帳です。削除したい場合は、先に保存してSupabase版にしてから削除してください。");
      return;
    }
    if (!confirm(`「${bookTitle}」を削除しますか？`)) return;
    const res = await fetch("/api/admin/official-wordbooks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "x-admin-password": password },
      body: JSON.stringify({ id }),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) { setManageMsg(result.message ?? "削除失敗"); return; }
    setManageMsg("✅ 削除しました");
    setBooks((prev) => prev.filter((b) => b.id !== id));
  }

  /* 笏笏 PDF 笏笏 */
  const selectedPdfBook = books.find((b) => b.id === pdfBookId) ?? null;

  const pdfOutputWords = useMemo(() => {
    if (!selectedPdfBook) return [];
    let list = selectedPdfBook.words
      .filter((w) => w.no >= pdfStartNo && w.no <= pdfEndNo)
      .map((w) => ({ no: w.no, english: w.english, japanese: w.japanese }));
    if (pdfRandom) list = [...list].sort(() => Math.random() - 0.5);
    return list.slice(0, pdfCount);
  }, [selectedPdfBook, pdfStartNo, pdfEndNo, pdfCount, pdfRandom]);

  useEffect(() => {
    if (selectedPdfBook) {
      setPdfStartNo(1);
      const last = selectedPdfBook.words[selectedPdfBook.words.length - 1]?.no ?? selectedPdfBook.words.length;
      setPdfEndNo(last);
      setPdfCount(Math.min(selectedPdfBook.words.length, 1900));
      setPdfTitle("");
    }
  }, [pdfBookId]);

  function openPrintPage() {
    if (!selectedPdfBook || pdfOutputWords.length === 0) { setPdfMsg("単語帳と範囲を確認してください。"); return; }
    setPdfMsg("");
    const now = new Date();
    const autoTitle = `${selectedPdfBook.title} ${pdfType === "list" ? "一覧" : pdfType === "test" ? "問題" : "解答"}`;
    const html = buildPrintHtml({
      title: pdfTitle.trim() || autoTitle,
      words: pdfOutputWords,
      type: pdfType,
      direction: pdfDir,
      showPageNo: pdfShowPageNo,
      plan: "admin",
      printStyle: pdfPrintStyle,
      includeWatermark: pdfWatermark,
      showRecordFields: pdfShowRecord,
      showClassField: pdfClass,
      showNumberField: pdfNumber,
      showNameField: pdfName,
      studentClass: pdfStudentClass,
      studentNumber: pdfStudentNumber,
      studentName: pdfStudentName,
      includeDate: pdfDate,
      generatedAt: now,
      footerText: pdfFooterText,
      fontScale: pdfFontScale,
    });
    sessionStorage.setItem("vpp-print-job", JSON.stringify({
      html,
      title: pdfTitle.trim() || autoTitle,
      sourceLabel: selectedPdfBook.title,
      createdAt: now.toISOString(),
    }));
    window.open("/print", "_blank");
  }

  /* 笏笏笏 Login screen 笏笏笏 */
  if (!unlocked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 px-5">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-2xl font-black text-white shadow-lg">VP</span>
            <h1 className="mt-4 text-2xl font-black text-slate-900">管理者ログイン</h1>
            <p className="mt-2 text-sm text-slate-500">パスワードと認証アプリの6桁コードを入力してください</p>
          </div>
          <div className="rounded-3xl border bg-white p-8 shadow-sm">
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && unlock()}
              type="password"
              placeholder="管理者パスワード"
              autoFocus
              className="w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <input
              value={authCode}
              onChange={(e) => setAuthCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && unlock()}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="認証コード（6桁）"
              className="mt-3 w-full rounded-xl border px-4 py-3 text-center text-lg tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <p className="mt-2 text-xs text-slate-400">認証アプリ（Google Authenticator等）の6桁コード。未設定の場合は空欄でログインできます。</p>
            <button
              onClick={unlock}
              className="mt-4 w-full rounded-2xl bg-blue-600 py-3 font-black text-white hover:bg-blue-700 transition-colors"
            >
              ログイン
            </button>
            {authMsg && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{authMsg}</p>}
            <div className="mt-5 text-center">
              <Link href="/" className="text-xs text-slate-400 hover:underline">← トップに戻る</Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  /* 笏笏笏 Admin UI 笏笏笏 */
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header */}
      <div className="border-b bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-sm font-black text-white">VP</span>
            <div>
              <p className="text-xs text-slate-500">Vocab Print Pro</p>
              <h1 className="text-base font-black leading-tight">管理者画面</h1>
            </div>
            <span className="ml-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">✓ ログイン済み</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/" className="rounded-xl border px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">トップ</Link>
            <Link href="/check" className="rounded-xl border px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">設定確認</Link>
            <button onClick={lockAdmin} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700">ログアウト</button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-5 py-6">
        {/* 二段階認証(2FA) */}
        <div className="mb-4 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black">🔐 二段階認証（2FA）</p>
              <p className="text-xs text-slate-500">
                {twoFaEnabled === null
                  ? "確認中…"
                  : twoFaEnabled
                    ? "✅ 有効です（ログインに認証コードが必要）"
                    : "⚠️ 未設定です。決済の本番化（セキュリティ要件）に必要です。"}
              </p>
            </div>
            {twoFaEnabled !== null && (
              <button onClick={setupTwoFa} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
                {twoFaEnabled ? "QRを再表示（再設定）" : "2FAを設定する"}
              </button>
            )}
          </div>
          {twoFaSecret && (
            <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-bold">📱 認証アプリに登録してください（この画面は他人に見せないこと）</p>
              <p className="mt-2">① アプリで「QRコードをスキャン」を選ぶ</p>
              <p>② 下のQRコードを読み取る：</p>
              {twoFaQr ? (
                <img src={twoFaQr} alt="2FA QRコード" className="mt-2 rounded bg-white p-2" width={220} height={220} />
              ) : (
                <p className="mt-2 text-amber-700">QR生成中…</p>
              )}
              <p className="mt-2">QRが読めない場合は「手動入力」でこのキー：</p>
              <p className="mt-1 select-all break-all rounded bg-white px-2 py-2 font-mono text-sm tracking-wider">{twoFaSecret}</p>
              <p className="mt-2">③ アプリに表示された6桁コードを入力して有効化してください：</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  value={twoFaCode}
                  onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={(e) => { if (e.key === "Enter") confirmTwoFa(); }}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  className="w-32 rounded border border-amber-300 bg-white px-3 py-2 text-center font-mono text-lg tracking-widest"
                />
                <button
                  onClick={confirmTwoFa}
                  disabled={twoFaConfirming || twoFaCode.length !== 6}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {twoFaConfirming ? "確認中…" : "有効化する"}
                </button>
              </div>
              <p className="mt-2 text-amber-700">※有効化するまで2FAはかかりません。アプリ登録後、必ず上のコードで有効化してください。</p>
            </div>
          )}
          {twoFaMsg && <p className={`mt-2 text-xs font-bold ${twoFaOk ? "text-emerald-600" : "text-red-600"}`}>{twoFaMsg}</p>}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-2xl bg-slate-200 p-1 w-fit">
          {([
            ["create", "📚 単語帳を登録"],
            ["manage", `📋 管理（${books.length}件）`],
            ["pdf", "📄 単語テスト作成"],
          ] as const).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-xl px-5 py-2 text-sm font-bold transition-colors ${tab === t ? "bg-white shadow text-blue-600" : "text-slate-500 hover:text-slate-700"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 笏笏 単語帳登録 笏笏 */}
        {tab === "create" && (
          <div className="mt-6 grid gap-6 lg:grid-cols-[440px_1fr]">
            <section className="rounded-3xl border bg-white p-6 shadow-sm space-y-4">
              <h2 className="text-lg font-black">公式単語帳を新規登録</h2>

              <div>
                <label className="text-sm font-bold">タイトル *</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
              </div>

              <div>
                <label className="text-sm font-bold">説明文</label>
                <textarea value={desc} onChange={(e) => setDesc(e.target.value)} className="mt-1 h-20 w-full rounded-xl border p-3 text-sm resize-none" />
              </div>

              <div>
                <label className="text-sm font-bold">カバー画像</label>
                <div className="mt-1">
                  <ImageInput value={coverImage} onChange={setCoverImage} adminPassword={password} titleHint={title} />
                </div>
              </div>

              <div>
                <label className="text-sm font-bold">公開範囲</label>
                <select value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm">
                  <option value="public">Free（全員使える）</option>
                  <option value="personal">Personal以上</option>
                  <option value="teacher">Teacher専用</option>
                  <option value="admin">管理者限定（非公開）</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-bold">CSV / Excel 貼り付け *</label>
                <p className="text-xs text-slate-400">列: 番号 / 英単語 / 意味 / Unit（タブまたはカンマ区切り）</p>
                <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} className="mt-2 h-52 w-full rounded-xl border p-3 font-mono text-sm resize-y" />
              </div>

              {createMsg && (
                <p className={`rounded-xl p-3 text-sm font-bold ${createMsg.startsWith("✅") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{createMsg}</p>
              )}

              <button onClick={createWordbook} disabled={saving} className="w-full rounded-2xl bg-blue-600 py-3 font-black text-white hover:bg-blue-700 disabled:bg-slate-300">
                {saving ? "保存中..." : `公式単語帳として保存（${words.length}語）`}
              </button>
            </section>

            <section className="rounded-3xl border bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-black">プレビュー</h2>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${visibilityColor(visibility)}`}>{visibilityLabel(visibility)}</span>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">{words.length}語</span>
                </div>
              </div>
              {coverImage && (
                <img src={coverImage} alt="cover" className="mb-4 h-36 w-full rounded-2xl object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              )}
              <div className="overflow-hidden rounded-2xl border text-sm">
                <table className="w-full table-fixed border-collapse">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="w-12 border-b p-2 text-center">番号</th>
                      <th className="w-1/3 border-b p-2 text-left">英単語</th>
                      <th className="border-b p-2 text-left">意味</th>
                      <th className="w-20 border-b p-2 text-left">Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {words.slice(0, 15).map((w, i) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="p-2 text-center font-bold text-slate-400">{w.number}</td>
                        <td className="p-2 font-bold">{w.english}</td>
                        <td className="p-2 text-slate-600">{w.japanese}</td>
                        <td className="p-2 text-xs text-slate-400">{w.unit}</td>
                      </tr>
                    ))}
                    {words.length > 15 && (
                      <tr><td colSpan={4} className="p-2 text-center text-xs text-slate-400">… 他{words.length - 15}語</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* 単語帳管理 */}
        {tab === "manage" && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => fetchBooks()} className="rounded-xl border px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">🔄 再読み込み</button>
              <button onClick={() => setTab("create")} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">+ 新規登録</button>
            </div>

            {/* ビルトインテンプレート */}
            <details className="mb-6 rounded-3xl border bg-white shadow-sm">
              <summary className="cursor-pointer select-none rounded-3xl px-5 py-4 text-sm font-black text-slate-700 hover:bg-slate-50">
                {`📦 ビルトインテンプレートから作成（${BUILTIN_TEMPLATES.length}件）`}<span className="ml-2 text-xs font-normal text-slate-400">▸ クリックで展開</span>
              </summary>
              <div className="border-t px-5 pb-5 pt-4">
                <p className="mb-4 text-xs text-slate-500">アプリ内蔵のサンプル単語帳テンプレートです。クリックしてSupabaseに登録し、単語を編集して本番用の単語帳にできます。</p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {BUILTIN_TEMPLATES.map((tmpl) => (
                    <div key={tmpl.title} className="rounded-2xl border overflow-hidden">
                      <img src={tmpl.coverImage} alt={tmpl.title} className="h-24 w-full object-cover" />
                      <div className="p-3">
                        <p className="text-sm font-black leading-tight">{tmpl.title}</p>
                        <p className="mt-1 text-xs text-slate-500 line-clamp-2">{tmpl.description}</p>
                        <button
                          type="button"
                          onClick={async () => {
                            const res = await fetch("/api/admin/official-wordbooks", {
                              method: "POST",
                              headers: { "Content-Type": "application/json", "x-admin-password": password },
                              body: JSON.stringify({
                                title: tmpl.title,
                                description: tmpl.description,
                                cover_image: tmpl.coverImage,
                                visibility: tmpl.visibility,
                                words: [],
                              }),
                            });
                            const result = await res.json().catch(() => ({}));
                            if (res.ok) { setManageMsg(`✅ 「${tmpl.title}」を登録しました。単語を追加してください。`); await fetchBooks(); }
                            else setManageMsg(result.message ?? "登録失敗");
                          }}
                          className="mt-3 w-full rounded-xl bg-blue-600 py-2 text-xs font-bold text-white hover:bg-blue-700"
                        >
                          Supabaseに登録
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </details>
            {/* Supabase 診断パネル */}
            <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-slate-700">🔍 Supabase接続診断</p>
                <button
                  type="button"
                  onClick={runDiagnose}
                  disabled={diagLoading}
                  className="rounded-xl bg-slate-700 px-4 py-1.5 text-xs font-bold text-white hover:bg-slate-900 disabled:opacity-50"
                >
                  {diagLoading ? "診断中…" : "診断を実行"}
                </button>
              </div>
              {diagResult && (
                <div className="mt-3 space-y-2 text-xs font-mono">
                  <div className="grid grid-cols-2 gap-1">
                    {Object.entries((diagResult.env as Record<string, boolean>) ?? {}).map(([k, v]) => (
                      <div key={k} className={`rounded px-2 py-1 ${v ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700 font-black"}`}>
                        {v ? "✅" : "❌"} {String(k)}
                      </div>
                    ))}
                  </div>
                  <div className="rounded bg-white p-2 border text-slate-600 whitespace-pre-wrap break-all">
                    {JSON.stringify({ tables: diagResult.tables, columns: diagResult.columns, sampleInsert: diagResult.sampleInsert, error: diagResult.error }, null, 2)}
                  </div>
                  {!!diagResult.message && (
                    <p className="rounded bg-red-50 p-2 text-red-700 font-bold">{String(diagResult.message)}</p>
                  )}
                </div>
              )}
            </div>

            {manageMsg && (
              <p className={`mb-4 rounded-2xl p-4 text-sm font-bold ${manageMsg.startsWith("✅") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{manageMsg}</p>
            )}
            {loadingBooks ? (
              <div className="py-12 text-center"><div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" /></div>
            ) : books.length === 0 ? (
              <div className="rounded-3xl border border-dashed bg-white p-12 text-center text-slate-400">
                <p className="text-4xl">📋</p>
                <p className="mt-3 font-bold">まだ単語帳がありません</p>
                <button onClick={() => setTab("create")} className="mt-4 rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white">最初の単語帳を登録</button>
              </div>
            ) : (
              <div className="space-y-4">
                {books.map((book) => (
                  <div key={book.id} className="rounded-3xl border bg-white p-5 shadow-sm">
                    {editId === book.id ? (
                      <div>
                        <div className="flex gap-2 mb-4">
                          {(["meta", "words"] as const).map((m) => (
                            <button key={m} onClick={() => setEditMode(m)} className={`rounded-xl px-4 py-2 text-sm font-bold ${editMode === m ? "bg-blue-600 text-white" : "border text-slate-600"}`}>
                              {m === "meta" ? "📝 基本情報" : "📋 単語を置き換え"}
                            </button>
                          ))}
                        </div>
                        {editMode === "meta" ? (
                          <div className="grid gap-3">
                            <div>
                              <label className="text-xs font-bold text-slate-500">タイトル</label>
                              <input value={editMeta.title} onChange={(e) => setEditMeta({ ...editMeta, title: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
                            </div>
                            <div>
                              <label className="text-xs font-bold text-slate-500">説明文</label>
                              <textarea value={editMeta.desc} onChange={(e) => setEditMeta({ ...editMeta, desc: e.target.value })} className="mt-1 w-full rounded-xl border p-3 text-sm h-20 resize-none" />
                            </div>
                            <div>
                              <label className="text-xs font-bold text-slate-500">カバー画像</label>
                              <div className="mt-1"><ImageInput value={editMeta.coverImage} onChange={(url) => setEditMeta({ ...editMeta, coverImage: url })} adminPassword={password} titleHint={editMeta.title} /></div>
                            </div>
                            <div>
                              <label className="text-xs font-bold text-slate-500">公開範囲</label>
                              <select value={editMeta.visibility} onChange={(e) => setEditMeta({ ...editMeta, visibility: e.target.value as Visibility })} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm">
                                <option value="public">Free（全員使える）</option>
                                <option value="personal">Personal以上</option>
                                <option value="teacher">Teacher専用</option>
                                <option value="admin">管理者限定</option>
                              </select>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <p className="text-xs text-slate-400 mb-2">現在の単語を全て置き換えます。列: 番号/英/日/Unit</p>
                            <textarea value={editPaste} onChange={(e) => setEditPaste(e.target.value)} className="w-full h-48 rounded-xl border p-3 font-mono text-sm resize-y" />
                            <p className="mt-1 text-xs text-slate-400">{`${parseWords(editPaste).length}語を認識`}</p>
                          </div>
                        )}
                        <div className="mt-4 flex gap-2">
                          <button onClick={saveEdit} className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white">保存</button>
                          <button onClick={() => setEditId(null)} className="rounded-xl border px-5 py-2 text-sm font-bold text-slate-600">キャンセル</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-4 items-start">
                        {book.coverImage && (
                          <img src={book.coverImage} alt={book.title} className="h-20 w-28 rounded-2xl object-cover flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-black text-slate-900 text-lg">{book.title}</h3>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${visibilityColor(book.visibility)}`}>{visibilityLabel(book.visibility)}</span>
                            <span className="text-xs text-slate-400">{book.words.length}語</span>
                          </div>
                          {book.description && <p className="mt-1 text-sm text-slate-500 line-clamp-1">{book.description}</p>}
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button onClick={() => startEdit(book, "meta")} className="rounded-xl border px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">✏️ 基本情報編集</button>
                            <button onClick={() => startEdit(book, "words")} className="rounded-xl border px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">📋 単語を更新</button>
                            <button onClick={() => { setPdfBookId(book.id); setTab("pdf"); }} className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700">📄 単語テスト作成</button>
                            <button onClick={() => deleteBook(book.id, book.title)} className="rounded-xl border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50">🗑️ 削除</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 単語テスト作成（フル機能） */}
        {tab === "pdf" && (
          <div className="mt-6 grid gap-6 lg:grid-cols-[420px_1fr]">
            {/* Left: settings */}
            <div className="space-y-4">
              <section className="rounded-3xl border bg-white p-5 shadow-sm">
                <h2 className="text-lg font-black mb-4">📋 単語帳・範囲</h2>

                <label className="text-sm font-bold">単語帳を選択</label>
                <select value={pdfBookId} onChange={(e) => setPdfBookId(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm">
                  <option value="">― 選択してください ―</option>
                  {books.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title}（{b.words.length}語{b.visibility === "admin" ? " 🔒管理者限定" : ""})
                    </option>
                  ))}
                </select>

                {selectedPdfBook && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {[
                      { label: "開始", value: pdfStartNo, set: setPdfStartNo },
                      { label: "終了", value: pdfEndNo, set: setPdfEndNo },
                      { label: "問題数", value: pdfCount, set: setPdfCount },
                    ].map(({ label, value, set }) => (
                      <div key={label}>
                        <label className="text-xs font-bold text-slate-500">{label}</label>
                        <input type="number" value={value} onChange={(e) => set(Number(e.target.value))} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-3xl border bg-white p-5 shadow-sm space-y-3">
                <h2 className="text-lg font-black">⚙️ PDF設定</h2>

                <div>
                  <label className="text-sm font-bold">PDFタイトル（空欄で自動）</label>
                  <input value={pdfTitle} onChange={(e) => setPdfTitle(e.target.value)} placeholder="例: 英単語テスト Unit1 問題" className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
                </div>

                <div>
                  <label className="text-sm font-bold">出力形式</label>
                  <select value={pdfType} onChange={(e) => setPdfType(e.target.value as PdfType)} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm">
                    <option value="list">一覧PDF（単語・意味を表示）</option>
                    <option value="test">問題PDF（解答欄あり）</option>
                    <option value="answer">解答PDF</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-bold">Created by（フッター表記）</label>
                  <input
                    value={pdfFooterText}
                    onChange={(e) => setPdfFooterText(e.target.value)}
                    placeholder="例: 〇〇塾 / 作成: 神谷"
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                  />
                  <p className="mt-1 text-xs text-slate-400">PDF右下に表示される作成者表記です。空欄で既定（Created by Vocab Print Pro）。</p>
                </div>

                <div>
                  <label className="text-sm font-bold">文字サイズ</label>
                  <select
                    value={pdfFontScale}
                    onChange={(e) => setPdfFontScale(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                  >
                    <option value={0.85}>小</option>
                    <option value={1}>標準</option>
                    <option value={1.15}>大</option>
                    <option value={1.3}>特大</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-bold">出題方向</label>
                  <select value={pdfDir} onChange={(e) => setPdfDir(e.target.value as Direction)} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm">
                    <option value="en-ja">英語 → 日本語</option>
                    <option value="ja-en">日本語 → 英語</option>
                    <option value="spelling">スペルテスト（日本語のみ表示）</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-bold">印刷スタイル</label>
                  <select value={pdfPrintStyle} onChange={(e) => setPdfPrintStyle(e.target.value as PrintStyle)} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm">
                    <option value="standard">標準</option>
                    <option value="blank-english">英単語を空欄</option>
                    <option value="blank-japanese">日本語を空欄</option>
                    <option value="red-english">英単語を赤字（赤シート学習）</option>
                    <option value="red-japanese">日本語を赤字（赤シート学習）</option>
                  </select>
                </div>

                <div className="space-y-2 pt-1">
                  {[
                    { label: "ランダム", checked: pdfRandom, set: setPdfRandom },
                    { label: "ページ番号を表示", checked: pdfShowPageNo, set: setPdfShowPageNo },
                    { label: "ウォーターマーク", checked: pdfWatermark, set: setPdfWatermark },
                  ].map(({ label, checked, set }) => (
                    <label key={label} className="flex items-center gap-2 text-sm font-bold cursor-pointer">
                      <input type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)} className="rounded" />
                      {label}
                    </label>
                  ))}
                </div>
              </section>

              <section className="rounded-3xl border bg-white p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-black">📝 記録欄</h2>
                  <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
                    <input type="checkbox" checked={pdfShowRecord} onChange={(e) => setPdfShowRecord(e.target.checked)} />
                    表示する
                  </label>
                </div>
                {pdfShowRecord && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { label: "クラス欄", checked: pdfClass, set: setPdfClass, val: pdfStudentClass, setVal: setPdfStudentClass, placeholder: "3年A組" },
                        { label: "番号欄", checked: pdfNumber, set: setPdfNumber, val: pdfStudentNumber, setVal: setPdfStudentNumber, placeholder: "12" },
                        { label: "氏名欄", checked: pdfName, set: setPdfName, val: pdfStudentName, setVal: setPdfStudentName, placeholder: "山田太郎" },
                        { label: "日付欄", checked: pdfDate, set: setPdfDate, val: "", setVal: () => {}, placeholder: "" },
                      ]).map(({ label, checked, set, val, setVal, placeholder }) => (
                        <label key={label} className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                          <input type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)} />
                          {label}
                        </label>
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      {[
                        { label: "クラス", value: pdfStudentClass, set: setPdfStudentClass, ph: "3年A組" },
                        { label: "番号", value: pdfStudentNumber, set: setPdfStudentNumber, ph: "12" },
                        { label: "氏名", value: pdfStudentName, set: setPdfStudentName, ph: "山田太郎" },
                      ].map(({ label, value, set, ph }) => (
                        <div key={label}>
                          <label className="text-xs text-slate-500">{label}（任意）</label>
                          <input value={value} onChange={(e) => set(e.target.value)} placeholder={ph} className="mt-1 w-full rounded-lg border px-2 py-1.5 text-xs" />
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </section>
            </div>

            {/* Right: preview + print */}
            <div className="space-y-4">
              <section className="rounded-3xl border bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-black">プレビュー</h2>
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    {selectedPdfBook && <span className="font-bold">{pdfOutputWords.length}語</span>}
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-600">管理者限定 非公開</span>
                  </div>
                </div>

                {!selectedPdfBook ? (
                  <p className="text-sm text-slate-400 text-center py-8">単語帳を選択してください</p>
                ) : (
                  <div className="overflow-hidden rounded-2xl border text-sm">
                    <table className="w-full table-fixed border-collapse">
                      <thead className="bg-slate-50 text-xs text-slate-500">
                        <tr>
                          <th className="w-12 border-b p-2 text-center">番号</th>
                          <th className="w-1/3 border-b p-2 text-left">英単語</th>
                          <th className="border-b p-2 text-left">意味</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pdfOutputWords.slice(0, 20).map((w) => (
                          <tr key={w.no} className="border-b last:border-0 hover:bg-slate-50">
                            <td className="p-2 text-center font-bold text-slate-400">{w.no}</td>
                            <td className="p-2 font-bold">{w.english}</td>
                            <td className="p-2 text-slate-600">{w.japanese}</td>
                          </tr>
                        ))}
                        {pdfOutputWords.length > 20 && (
                          <tr><td colSpan={3} className="p-2 text-center text-xs text-slate-400">… 他{pdfOutputWords.length - 20}語（計{pdfOutputWords.length}語）</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {pdfMsg && <p className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{pdfMsg}</p>}

              <button
                onClick={openPrintPage}
                disabled={!selectedPdfBook || pdfOutputWords.length === 0}
                className="w-full rounded-2xl bg-blue-600 py-4 text-lg font-black text-white hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-400 transition-colors shadow"
              >
                📄 PDF作成・印刷（新しいタブで開く）
              </button>
              <p className="text-center text-xs text-slate-400">
                開いたタブの印刷ダイアログで「PDFに保存」または「印刷」を選べます。
              </p>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl border bg-white p-4 text-center shadow-sm">
                  <p className="text-2xl font-black text-blue-600">{books.length}</p>
                  <p className="mt-1 text-xs text-slate-500">公式単語帳</p>
                </div>
                <div className="rounded-2xl border bg-white p-4 text-center shadow-sm">
                  <p className="text-2xl font-black text-slate-700">{books.reduce((s, b) => s + b.words.length, 0).toLocaleString()}</p>
                  <p className="mt-1 text-xs text-slate-500">総単語数</p>
                </div>
                <div className="rounded-2xl border bg-white p-4 text-center shadow-sm">
                  <p className="text-2xl font-black text-red-600">{books.filter((b) => b.visibility === "admin").length}</p>
                  <p className="mt-1 text-xs text-slate-500">管理者限定</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

