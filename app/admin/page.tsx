"use client";

import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import {
  buildPrintHtml,
  makeQuestion,
  formatPrintDate,
  previewCss,
  PREVIEW_SCALE,
  type PdfType,
  type Direction,
  type PrintStyle,
} from "@/lib/print/full-builder";
import { parseWordText } from "@/lib/parse-word-text";
import { downloadLockedPdf } from "@/lib/pdf/locked-pdf";
import { createClient } from "@/lib/supabase/client";

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
  wordCount?: number;
  words: Array<{ no: number; english: string; japanese: string; unit?: string | null }>;
};

type AdminMetrics = {
  visitorMetrics?: {
    available?: boolean;
    message?: string;
    viewsToday?: number;
    views7d?: number;
    views30d?: number;
    uniqueToday?: number;
    unique7d?: number;
    unique30d?: number;
    topPaths?: Array<{ path: string; views: number; href?: string }>;
    topReferrers?: Array<{ label: string; url: string | null; views: number }>;
    recentVisitors?: Array<{
      stableVisitorHash: string;
      visits: number;
      daysSeen: number;
      firstSeen: string;
      lastSeen: string;
      lastPath: string;
      referrer: string;
      referrerLabel: string;
      ua: string;
      isCurrentBrowser: boolean;
    }>;
    currentBrowserSummary?: {
      estimatedSelfVisits30d: number;
      estimatedSelfDays30d: number;
      lastPath: string;
    } | null;
  };
  overview: {
    totalUsers: number;
    profileUsers?: number;
    missingProfileCount?: number;
    freeCount: number;
    personalCount: number;
    teacherCount: number;
    adminCount: number;
    signup7d: number;
    signup30d: number;
    activeSubscriptions: number;
    trialingSubscriptions: number;
    canceledSubscriptions: number;
    estimatedMonthlyRevenue: number;
  };
  pdf: {
    totalGenerations: number;
    generations7d: number;
    generations30d: number;
    totalWordsGenerated: number;
    totalWordsGenerated30d: number;
    topTypes: Array<{ type: string; count: number }>;
    recent: Array<{
      id: string;
      created_at: string | null;
      type: string;
      word_count: number;
      wordbook_id: string | null;
      wordbook_title: string;
      user_id: string | null;
    }>;
  };
  wordbooks: {
    total: number;
    official: number;
    publicCount: number;
    personalCount: number;
    teacherCount: number;
    adminOnlyCount: number;
    topWordbooks: Array<{ wordbookId: string; title: string; uses: number }>;
  };
  accounts: Array<{
    id: string;
    email: string | null;
    created_at: string | null;
    role: string;
    plan: string;
    hasProfile: boolean;
    subscriptionStatus: string | null;
    currentPeriodEnd: string | null;
  }>;
};

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
  return parseWordText(text);
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

function getBookWordCount(book: OfficialBook) {
  return typeof book.wordCount === "number" ? book.wordCount : book.words.length;
}

function formatAdminDate(iso: string | null | undefined) {
  if (!iso) return "未記録";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "未記録";
  return date.toLocaleString("ja-JP", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCurrencyJPY(value: number) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(value);
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
  const COVER_ASPECT = 16 / 10;
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [mode, setMode] = useState<"url" | "file" | "gallery">("url");
  const inputId = useMemo(
    () => `cover-upload-${Math.random().toString(36).slice(2, 10)}`,
    []
  );
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [cropImageSize, setCropImageSize] = useState<{ width: number; height: number } | null>(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropOffsetX, setCropOffsetX] = useState(0);
  const [cropOffsetY, setCropOffsetY] = useState(0);

  function readFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") resolve(reader.result);
        else reject(new Error("画像の読み込みに失敗しました。"));
      };
      reader.onerror = () => reject(new Error("画像の読み込みに失敗しました。"));
      reader.readAsDataURL(file);
    });
  }

  function loadImageElement(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("画像の展開に失敗しました。"));
      img.src = src;
    });
  }

  function getCoverPlacement(
    imageWidth: number,
    imageHeight: number,
    targetWidth: number,
    targetHeight: number,
    zoom: number,
    offsetX: number,
    offsetY: number
  ) {
    const baseScale = Math.max(targetWidth / imageWidth, targetHeight / imageHeight);
    const finalScale = baseScale * zoom;
    const drawWidth = imageWidth * finalScale;
    const drawHeight = imageHeight * finalScale;
    const maxShiftX = Math.max(0, (drawWidth - targetWidth) / 2);
    const maxShiftY = Math.max(0, (drawHeight - targetHeight) / 2);
    const drawX = (targetWidth - drawWidth) / 2 + maxShiftX * offsetX;
    const drawY = (targetHeight - drawHeight) / 2 + maxShiftY * offsetY;
    return { drawWidth, drawHeight, drawX, drawY };
  }

  async function renderEmbeddedCover(
    source: string,
    zoom: number,
    offsetX: number,
    offsetY: number
  ) {
    const image = await loadImageElement(source);
    const targetWidth = 1280;
    const targetHeight = Math.round(targetWidth / COVER_ASPECT);
    const { drawWidth, drawHeight, drawX, drawY } = getCoverPlacement(
      image.width,
      image.height,
      targetWidth,
      targetHeight,
      zoom,
      offsetX,
      offsetY
    );
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("画像の変換に失敗しました。");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, targetWidth, targetHeight);
    context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
    return canvas.toDataURL("image/jpeg", 0.86);
  }

  async function openCropEditor(file: File) {
    const rawUrl = await readFileAsDataUrl(file);
    const image = await loadImageElement(rawUrl);
    setCropSource(rawUrl);
    setCropImageSize({ width: image.width, height: image.height });
    setCropZoom(1);
    setCropOffsetX(0);
    setCropOffsetY(0);
  }

  async function uploadClipboardItems(items: DataTransferItemList | DataTransferItem[]) {
    const list = Array.from(items);
    const imageItem = list.find((item) => item.type.startsWith("image/"));
    if (!imageItem) return false;
    const file = imageItem.getAsFile();
    if (!file) return false;
    setMode("file");
    await handleFile(file);
    return true;
  }

  async function handleFile(file: File) {
    setUploading(true);
    setUploadMsg("");
    try {
      await openCropEditor(file);
    } catch (error) {
      setUploadMsg(error instanceof Error ? error.message : "画像のセットに失敗しました。");
    } finally {
      setUploading(false);
    }
  }

  async function applyCrop() {
    if (!cropSource) return;
    setUploading(true);
    setUploadMsg("");
    try {
      const embeddedUrl = await renderEmbeddedCover(cropSource, cropZoom, cropOffsetX, cropOffsetY);
      onChange(embeddedUrl);
      setCropSource(null);
      setCropImageSize(null);
      setUploadMsg("画像をセットしました");
    } catch (error) {
      setUploadMsg(error instanceof Error ? error.message : "画像のセットに失敗しました。");
    } finally {
      setUploading(false);
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    uploadClipboardItems(e.clipboardData.items).then((handled) => {
      if (handled) e.preventDefault();
    });
  }

  useEffect(() => {
    async function onWindowPaste(event: ClipboardEvent) {
      if (!event.clipboardData) return;
      const handled = await uploadClipboardItems(event.clipboardData.items);
      if (handled) event.preventDefault();
    }

    window.addEventListener("paste", onWindowPaste);
    return () => window.removeEventListener("paste", onWindowPaste);
  }, []);

  const cropPreviewPlacement = useMemo(() => {
    if (!cropImageSize) return null;
    const previewWidth = 420;
    const previewHeight = Math.round(previewWidth / COVER_ASPECT);
    return getCoverPlacement(
      cropImageSize.width,
      cropImageSize.height,
      previewWidth,
      previewHeight,
      cropZoom,
      cropOffsetX,
      cropOffsetY
    );
  }, [cropImageSize, cropZoom, cropOffsetX, cropOffsetY, COVER_ASPECT]);

  return (
    <div onPaste={handlePaste}>
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
        <div className="space-y-3">
          <div
            className="rounded-xl border-2 border-dashed border-slate-300 p-4 text-center cursor-pointer hover:border-blue-400 transition-colors"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) handleFile(file); }}
          >
            {uploading ? <p className="text-sm text-blue-600 font-bold">Uploading...</p> : (
              <>
                <p className="text-sm font-bold text-slate-700">画像を選ぶか、ここにドラッグしてください。</p>
                <p className="mt-1 text-xs text-slate-400">JPG / PNG / WebP / GIF / AVIF, 5MBまで</p>
                <p className="mt-1 text-xs font-bold text-blue-600">コピーした画像をここで Ctrl+V / Command+V でも貼り付けできます。</p>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label
              htmlFor={inputId}
              className="inline-flex cursor-pointer items-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
            >
              ファイルを選ぶ
            </label>
            <span className="text-xs text-slate-500">うまく開かないときは、このボタンから選んでください。</span>
          </div>
          <input
            id={inputId}
            ref={fileRef}
            type="file"
            accept="image/*"
            className="block w-full rounded-xl border px-3 py-2 text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-bold"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
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
        <p className={`mt-2 text-xs font-bold ${uploadMsg.includes("セット") ? "text-emerald-600" : "text-red-600"}`}>
          {uploadMsg}
        </p>
      )}
      {mode === "file" && !uploadMsg && (
        <p className="mt-2 text-xs text-slate-400">
          手元の画像を選ぶか、画像をコピーしてこの欄で貼り付けてください。画像はそのままカバーに埋め込まれます。
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
      {cropSource && (
        <div className="mt-4 rounded-2xl border bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-slate-900">カバー画像の位置調整</p>
              <p className="mt-1 text-xs text-slate-500">
                プレビューを見ながら、見せたい位置に合わせてから反映できます。
                {cropImageSize ? ` 元画像: ${cropImageSize.width} × ${cropImageSize.height}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setCropSource(null); setCropImageSize(null); }}
              className="rounded-xl border px-3 py-2 text-xs font-bold text-slate-600 hover:bg-white"
            >
              キャンセル
            </button>
          </div>
          <div className="mt-4 flex justify-center">
            <div
              className="relative overflow-hidden rounded-2xl border bg-white shadow-sm"
              style={{ width: "100%", maxWidth: 420, aspectRatio: String(COVER_ASPECT) }}
            >
              <img
                src={cropSource}
                alt="crop-preview"
                className="pointer-events-none absolute select-none"
                style={{
                  left: cropPreviewPlacement ? `${cropPreviewPlacement.drawX}px` : 0,
                  top: cropPreviewPlacement ? `${cropPreviewPlacement.drawY}px` : 0,
                  width: cropPreviewPlacement ? `${cropPreviewPlacement.drawWidth}px` : "100%",
                  height: cropPreviewPlacement ? `${cropPreviewPlacement.drawHeight}px` : "100%",
                }}
              />
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <label className="text-xs font-bold text-slate-600">
              拡大
              <input
                type="range"
                min="1"
                max="2.4"
                step="0.01"
                value={cropZoom}
                onChange={(e) => setCropZoom(Number(e.target.value))}
                className="mt-2 w-full"
              />
            </label>
            <label className="text-xs font-bold text-slate-600">
              左右
              <input
                type="range"
                min="-1"
                max="1"
                step="0.01"
                value={cropOffsetX}
                onChange={(e) => setCropOffsetX(Number(e.target.value))}
                className="mt-2 w-full"
              />
            </label>
            <label className="text-xs font-bold text-slate-600">
              上下
              <input
                type="range"
                min="-1"
                max="1"
                step="0.01"
                value={cropOffsetY}
                onChange={(e) => setCropOffsetY(Number(e.target.value))}
                className="mt-2 w-full"
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { setCropZoom(1); setCropOffsetX(0); setCropOffsetY(0); }}
              className="rounded-xl border px-4 py-2 text-xs font-bold text-slate-600 hover:bg-white"
            >
              リセット
            </button>
            <button
              type="button"
              onClick={applyCrop}
              className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white hover:bg-blue-700"
            >
              この位置で反映
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* 笏笏笏 Main Component 笏笏笏 */
export default function AdminPage() {
  const supabase = useMemo(() => createClient(), []);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authRole, setAuthRole] = useState<"user" | "admin">("user");
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
  const [authLoading, setAuthLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  /* 2FA */
  const [twoFaEnabled, setTwoFaEnabled] = useState<boolean | null>(null);
  const [twoFaSecret, setTwoFaSecret] = useState("");
  const [twoFaQr, setTwoFaQr] = useState("");
  const [twoFaMsg, setTwoFaMsg] = useState("");
  const [twoFaCode, setTwoFaCode] = useState("");
  const [twoFaConfirming, setTwoFaConfirming] = useState(false);
  const [twoFaOk, setTwoFaOk] = useState(false);

  const [tab, setTab] = useState<"dashboard" | "create" | "manage" | "pdf">("dashboard");

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
  const [books, setBooks] = useState<OfficialBook[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(false);
  const [manageMsg, setManageMsg] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<"meta" | "words">("meta");
  const [editMeta, setEditMeta] = useState({ title: "", desc: "", coverImage: "", visibility: "public" as Visibility });
  const [editPaste, setEditPaste] = useState("");
  const fetchBooksSeqRef = useRef(0);
  const duplicateTitleGroups = useMemo(() => {
    const groups = new Map<string, OfficialBook[]>();
    for (const book of books) {
      const key = book.title.trim().toLowerCase();
      const bucket = groups.get(key) ?? [];
      bucket.push(book);
      groups.set(key, bucket);
    }
    return Array.from(groups.values()).filter((items) => items.length > 1);
  }, [books]);

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
  const [pdfLockEditing, setPdfLockEditing] = useState(true);
  const [pdfOwnerPassword, setPdfOwnerPassword] = useState("");
  const [pdfStudentClass, setPdfStudentClass] = useState("");
  const [pdfStudentNumber, setPdfStudentNumber] = useState("");
  const [pdfStudentName, setPdfStudentName] = useState("");
  const [pdfTitleOffset, setPdfTitleOffset] = useState({ x: 0, y: 0 });
  const [pdfDateOffset, setPdfDateOffset] = useState({ x: 0, y: 0 });
  const [pdfInfoOffset, setPdfInfoOffset] = useState({ x: 0, y: 0 });
  const [pdfGridOffset, setPdfGridOffset] = useState({ x: 0, y: 0 });
  const [pdfPageNoOffset, setPdfPageNoOffset] = useState({ x: 0, y: 0 });
  const [showLayoutEditor, setShowLayoutEditor] = useState(false);
  const [dragging, setDragging] = useState<"title" | "date" | "info" | "grid" | "pageNo" | null>(null);
  const [dragStart, setDragStart] = useState<{ cx: number; cy: number; ox: number; oy: number } | null>(null);
  const [pdfMsg, setPdfMsg] = useState("");
  const [exportingAction, setExportingAction] = useState<string | null>(null);
  const previewIframeRef = useRef<HTMLIFrameElement | null>(null);

  /* 笏笏 diagnose 笏笏 */
  const [diagResult, setDiagResult] = useState<Record<string, unknown> | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsMsg, setMetricsMsg] = useState("");

  async function getAdminHeaders(): Promise<Record<string, string>> {
    const token = sessionStorage.getItem("vpp-admin-pw");
    if (token) {
      return { "x-admin-password": token };
    }
    if (!supabase) return {};
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
  }

  async function loadSupabaseAdminSession() {
    if (!supabase) return;
    const { data: userData } = await supabase.auth.getUser();
    const currentUser = userData.user ?? null;
    setAuthUser(currentUser);
    if (!currentUser) {
      setAuthRole("user");
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setAuthRole("user");
      return;
    }

    const response = await fetch("/api/me/profile", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    }).catch(() => null);
    const result = await response?.json().catch(() => ({}));
    const nextRole = result?.profile?.role === "admin" ? "admin" : "user";
    setAuthRole(nextRole);
    if (nextRole === "admin") {
      sessionStorage.setItem("vpp-admin-unlocked", "1");
      setUnlocked(true);
      setAuthMsg("");
    }
  }

  async function runDiagnose() {
    setDiagLoading(true);
    const headers = await getAdminHeaders();
    const res = await fetch("/api/admin/diagnose", { headers }).catch(() => null);
    if (!res) { setDiagResult({ error: "API request failed" }); setDiagLoading(false); return; }
    const data = await res.json().catch(() => ({ error: "Failed to parse response" }));
    setDiagResult(data);
    setDiagLoading(false);
  }

  async function fetchMetrics(options?: { silent?: boolean }) {
    if (!options?.silent) setMetricsLoading(true);
    setMetricsMsg("");
    const headers = await getAdminHeaders();
    const res = await fetch("/api/admin/metrics", {
      headers,
      cache: "no-store",
    }).catch(() => null);
    if (!res) {
      setMetricsMsg("⚠️ ダッシュボードAPIに接続できませんでした。");
      setMetricsLoading(false);
      return null;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      setMetrics(null);
      setMetricsMsg(typeof data?.message === "string" ? data.message : "ダッシュボードの読み込みに失敗しました。");
      setMetricsLoading(false);
      return null;
    }
    setMetrics(data as AdminMetrics);
    setMetricsLoading(false);
    return data as AdminMetrics;
  }

  /* 笏笏 fetch books 笏笏 */
  async function fetchBooks(options?: { silent?: boolean; preserveMessage?: boolean; includeWords?: boolean }) {
    const requestSeq = ++fetchBooksSeqRef.current;
    const includeWords = options?.includeWords ?? false;
    if (!options?.silent) setLoadingBooks(true);
    if (!options?.preserveMessage) setManageMsg("");
    const headers = await getAdminHeaders();
    const res = await fetch(`/api/admin/all-wordbooks?includeWords=${includeWords ? "1" : "0"}`, {
      headers,
      cache: "no-store",
    }).catch(() => null);
    if (requestSeq !== fetchBooksSeqRef.current) return null;
    if (!res) { setManageMsg("⚠️ ネットワークエラー: APIに接続できません"); setLoadingBooks(false); return null; }
    const data = await res.json().catch(() => ({}));
    if (requestSeq !== fetchBooksSeqRef.current) return null;
    const list = Array.isArray(data?.wordbooks) ? data.wordbooks : [];
    setBooks(list);
    if (!options?.preserveMessage) {
      if (data?.message) setManageMsg(data.message);
      else if (list.length === 0) setManageMsg("Supabaseに単語帳がありません。「単語帳を登録」タブから追加してください。");
    }
    setLoadingBooks(false);
    return list as OfficialBook[];
  }

  useEffect(() => {
    void loadSupabaseAdminSession();
    if (!supabase) return;
    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      void loadSupabaseAdminSession();
    });
    return () => {
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => { if (unlocked) { fetchBooks({ includeWords: false }); fetchMetrics({ silent: true }); loadTwoFaStatus(); } }, [unlocked]);
  // タブ切り替え時は初回のみ取得（編集中の変更を上書きしないようsilentで）
  useEffect(() => {
    if (!unlocked || (tab !== "manage" && tab !== "pdf")) return;
    fetchBooks({ silent: true, includeWords: tab === "pdf" });
  }, [tab, unlocked]);
  useEffect(() => {
    if (!unlocked || tab !== "dashboard") return;
    fetchMetrics({ silent: false });
  }, [tab, unlocked]);
  useEffect(() => {
    if (!pdfBookId && books.length > 0) {
      setPdfBookId(books[0].id);
    }
  }, [books, pdfBookId]);

  /* 笏笏 auth 笏笏 */
  async function unlock() {
    if (authLoading) return;
    setAuthMsg("");
    if (!password.trim()) {
      if (authUser && authRole === "admin") {
        sessionStorage.setItem("vpp-admin-unlocked", "1");
        setUnlocked(true);
        return;
      }
      setAuthMsg("管理者パスワードを入力してください。管理者アカウントでログイン済みなら、そのまま入れる場合があります。");
      return;
    }
    setAuthLoading(true);
    try {
      const res = await fetch("/api/admin/auth/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, code: authCode }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.ok) {
        setAuthMsg(result.message ?? "認証に失敗しました。");
        return;
      }
      // 以降のAPIはトークンで認証する（x-admin-passwordヘッダーにトークンを入れる）
      const token = typeof result.token === "string" ? result.token : password;
      sessionStorage.setItem("vpp-admin-unlocked", "1");
      sessionStorage.setItem("vpp-admin-pw", token);
      setPassword(token);
      setAuthCode("");
      setUnlocked(true);
    } catch {
      setAuthMsg("管理者ログインAPIに接続できませんでした。");
    } finally {
      setAuthLoading(false);
    }
  }

  function lockAdmin() {
    sessionStorage.removeItem("vpp-admin-unlocked");
    sessionStorage.removeItem("vpp-admin-pw");
    setUnlocked(false);
    setPassword("");
  }

  async function loadTwoFaStatus() {
    const headers = await getAdminHeaders();
    const res = await fetch("/api/admin/2fa", { headers }).catch(() => null);
    if (!res) return;
    const r = await res.json().catch(() => ({}));
    if (r.ok) setTwoFaEnabled(Boolean(r.enabled));
  }

  async function setupTwoFa() {
    setTwoFaMsg("");
    const headers = await getAdminHeaders();
    const res = await fetch("/api/admin/2fa", { method: "POST", headers }).catch(() => null);
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
    const headers = await getAdminHeaders();
    const res = await fetch("/api/admin/2fa/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
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
    const headers = await getAdminHeaders();
    const res = await fetch("/api/admin/official-wordbooks", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ title, description: desc, cover_image: coverImage, visibility, words }),
    });
    const result = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setCreateMsg(result.message ?? "保存失敗"); return; }
    setCreateMsg(`✅ 保存しました（${result.wordCount}語）`);
    if (result.wordbook?.id) {
      const createdBook: OfficialBook = {
        id: String(result.wordbook.id),
        title,
        description: desc,
        coverImage: coverImage || null,
        requiredPlan: visibility === "teacher" ? "teacher" : visibility === "personal" ? "personal" : visibility === "admin" ? "admin" : "free",
        visibility,
        wordCount: words.length,
        words,
      };
      setBooks((current) => [createdBook, ...current.filter((book) => book.id !== createdBook.id)]);
    }
    await fetchBooks({ includeWords: false });
    setTab("manage");
  }

  /* 笏笏 edit 笏笏 */
  async function startEdit(book: OfficialBook, mode: "meta" | "words") {
    let sourceBook = book;
    if (book.words.length === 0 && (mode === "words" || tab === "pdf") && getBookWordCount(book) > 0) {
      const refreshed = await fetchBooks({ silent: true, preserveMessage: true, includeWords: true });
      const matched = refreshed?.find((candidate) => candidate.id === book.id);
      if (matched) {
        sourceBook = matched;
      }
    }
    setEditId(book.id); setEditMode(mode);
    setEditMeta({ title: sourceBook.title, desc: sourceBook.description, coverImage: sourceBook.coverImage ?? "", visibility: sourceBook.visibility as Visibility });
    setEditPaste(sourceBook.words.map((w) => `${w.no}\t${w.english}\t${w.japanese}\t${w.unit ?? ""}`).join("\n"));
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
    const headers = await getAdminHeaders();
    if (!isPersistedBookId(editId)) {
      const postRes = await fetch("/api/admin/official-wordbooks", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
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
      setManageMsg("✅ Supabaseに登録して保存しました");
      setEditId(null);
      await fetchBooks({ silent: true, preserveMessage: true, includeWords: false });
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
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) { setManageMsg(result.message ?? "更新失敗"); return; }
    if (result.warning) {
      setManageMsg(`⚠️ ${result.warning} — Supabaseのwordbooksテーブルにカラムを追加してください。`);
    } else {
      setManageMsg(editMode === "words" ? `✅ 単語を更新しました（${result.wordCount}語）` : "✅ メタデータを更新しました");
    }
    setEditId(null);
    await fetchBooks({ silent: true, preserveMessage: true, includeWords: false });
  }

  async function deleteBook(id: string, bookTitle: string) {
    if (!confirm(`「${bookTitle}」を削除しますか？`)) return;
    setBooks((current) => current.filter((book) => book.id !== id));
    const headers = await getAdminHeaders();
    const res = await fetch("/api/admin/official-wordbooks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ id }),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      setManageMsg(result.message ?? "削除失敗");
      await fetchBooks({ silent: true, preserveMessage: true, includeWords: false });
      return;
    }
    setManageMsg(result.hiddenTemplate ? "✅ テンプレート単語帳を非表示にしました" : "✅ 削除しました");
    await fetchBooks({ silent: true, preserveMessage: true, includeWords: false });
  }

  /* 笏笏 PDF 笏笏 */
  const selectedPdfBook = books.find((b) => b.id === pdfBookId) ?? null;

  const pdfOutputWords = useMemo(() => {
    if (!selectedPdfBook) return [];
    const all = selectedPdfBook.words;
    const total = all.length;
    if (total === 0) return [];
    // 「開始／終了」は単語リストの位置（何番目）。値が古い/範囲外でもクランプして常に有効化。
    const start = Math.min(Math.max(1, Number(pdfStartNo) || 1), total);
    const end = Math.min(Math.max(start, Number(pdfEndNo) || total), total);
    let list = all
      .slice(start - 1, end)
      .map((w) => ({ no: w.no, english: w.english, japanese: w.japanese }));
    if (pdfRandom) list = [...list].sort(() => Math.random() - 0.5);
    const count = Math.max(1, Math.min(Number(pdfCount) || list.length, list.length));
    return list.slice(0, count);
  }, [selectedPdfBook, pdfStartNo, pdfEndNo, pdfCount, pdfRandom]);

  // メイン画面と同じエンジンで実寸A4プレビューを生成
  const pdfPreviewDoc = useMemo(() => {
    if (!selectedPdfBook || pdfOutputWords.length === 0) return "";
    const autoTitle = `${selectedPdfBook.title} ${pdfType === "list" ? "一覧" : pdfType === "test" ? "問題" : "解答"}`;
    const html = buildPrintHtml({
      title: pdfTitle.trim() || autoTitle,
      words: pdfOutputWords,
      type: pdfType,
      makeQuestion: (w) => makeQuestion(w, pdfDir),
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
      generatedAt: new Date(),
      userEmail: "",
      footerText: pdfFooterText,
      fontScale: pdfFontScale,
      titleOffsetX: pdfTitleOffset.x,
      titleOffsetY: pdfTitleOffset.y,
      dateOffsetX: pdfDateOffset.x,
      dateOffsetY: pdfDateOffset.y,
      infoOffsetX: pdfInfoOffset.x,
      infoOffsetY: pdfInfoOffset.y,
      gridOffsetX: pdfGridOffset.x,
      gridOffsetY: pdfGridOffset.y,
      pageNoOffsetX: pdfPageNoOffset.x,
      pageNoOffsetY: pdfPageNoOffset.y,
    });
    return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><style>${previewCss}</style></head><body><div id="print-root">${html}</div></body></html>`;
  }, [selectedPdfBook, pdfOutputWords, pdfType, pdfDir, pdfShowPageNo, pdfPrintStyle, pdfWatermark, pdfShowRecord, pdfClass, pdfNumber, pdfName, pdfStudentClass, pdfStudentNumber, pdfStudentName, pdfDate, pdfTitle, pdfFooterText, pdfFontScale, pdfTitleOffset, pdfDateOffset, pdfInfoOffset, pdfGridOffset, pdfPageNoOffset]);

  useEffect(() => {
    if (selectedPdfBook) {
      const total = selectedPdfBook.words.length;
      setPdfStartNo(1);
      setPdfEndNo(total);
      setPdfCount(Math.min(total, 1900));
      setPdfTitle("");
    }
    // 単語帳を切り替えた時、または選択中の単語帳の語数が変わった時（編集後の再取得など）に範囲を初期化
  }, [pdfBookId, selectedPdfBook?.words.length]);

  useEffect(() => {
    if (!dragging || !dragStart) return;
    const mmPerPx = 1 / (PREVIEW_SCALE * 3.78);
    const onMove = (event: MouseEvent) => {
      const nextX = Math.round((dragStart.ox + (event.clientX - dragStart.cx) * mmPerPx) * 10) / 10;
      const nextY = Math.round((dragStart.oy + (event.clientY - dragStart.cy) * mmPerPx) * 10) / 10;
      const snap = (value: number) => (Math.abs(value) < 0.8 ? 0 : value);
      const x = snap(nextX);
      const y = snap(nextY);
      if (dragging === "title") setPdfTitleOffset({ x, y });
      else if (dragging === "date") setPdfDateOffset({ x, y });
      else if (dragging === "grid") setPdfGridOffset({ x, y });
      else if (dragging === "pageNo") setPdfPageNoOffset({ x, y });
      else setPdfInfoOffset({ x, y });
    };
    const onUp = () => {
      setDragging(null);
      setDragStart(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, dragStart]);

  function buildAdminPrintDocument(mode: "all" | "first" = "all", target: "print" | "render" = "render") {
    if (!selectedPdfBook || pdfOutputWords.length === 0) { setPdfMsg("単語帳と範囲を確認してください。"); return; }
    const now = new Date();
    const autoTitle = `${selectedPdfBook.title} ${pdfType === "list" ? "一覧" : pdfType === "test" ? "問題" : "解答"}`;
    const html = buildPrintHtml({
      title: pdfTitle.trim() || autoTitle,
      words: pdfOutputWords,
      type: pdfType,
      makeQuestion: (w) => makeQuestion(w, pdfDir),
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
      userEmail: "",
      footerText: pdfFooterText,
      fontScale: pdfFontScale,
      titleOffsetX: pdfTitleOffset.x,
      titleOffsetY: pdfTitleOffset.y,
      dateOffsetX: pdfDateOffset.x,
      dateOffsetY: pdfDateOffset.y,
      infoOffsetX: pdfInfoOffset.x,
      infoOffsetY: pdfInfoOffset.y,
      gridOffsetX: pdfGridOffset.x,
      gridOffsetY: pdfGridOffset.y,
      pageNoOffsetX: pdfPageNoOffset.x,
      pageNoOffsetY: pdfPageNoOffset.y,
    });
    const safeTitle = (pdfTitle.trim() || autoTitle).replace(/[<>"&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", '"': "&quot;", "&": "&amp;" }[c] ?? c));
    const titleBase = (pdfTitle.trim() || `${selectedPdfBook.title}-${pdfType}`).replace(/[\\/:*?"<>|]+/g, "_");
    const previewStyle = target === "render" ? `<style>${previewCss}</style>` : "";
    const copyGuardStyle = `<style>#print-root,#print-root *{ -webkit-user-select:none!important; -moz-user-select:none!important; -ms-user-select:none!important; user-select:none!important; -webkit-touch-callout:none!important; }</style>`;
    const copyGuardScript = `<script>(function(){var b=["contextmenu","copy","cut","selectstart","dragstart"];b.forEach(function(e){document.addEventListener(e,function(ev){ev.preventDefault();return false;});});document.addEventListener("keydown",function(e){if((e.ctrlKey||e.metaKey)&&["c","x","a","u"].indexOf((e.key||"").toLowerCase())>-1){e.preventDefault();return false;}});})();<\/script>`;
    const firstPageOnlyStyle = mode === "first" ? "<style>.print-page:nth-of-type(n+2){display:none!important;}</style>" : "";
    const fullDoc = `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>${safeTitle}</title>${previewStyle}${copyGuardStyle}${firstPageOnlyStyle}</head><body style="margin:0">${copyGuardScript}<div id="print-root">${html}</div></body></html>`;
    const printPageHtml = `${copyGuardStyle}${copyGuardScript}${firstPageOnlyStyle}<div id="print-root">${html}</div>`;
    return { fullDoc, printPageHtml, titleBase, title: pdfTitle.trim() || autoTitle };
  }

  function openPrintPage(mode: "all" | "first" = "all") {
    const built = buildAdminPrintDocument(mode, "print");
    if (!built) return;
    setPdfMsg("");
    const { fullDoc } = built;

    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;visibility:hidden;";
    document.body.appendChild(iframe);
    const iframeDoc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (iframeDoc) {
      iframeDoc.open();
      iframeDoc.write(fullDoc);
      iframeDoc.close();
      iframe.contentWindow?.focus();
      setTimeout(() => {
        try { iframe.contentWindow?.print(); } catch { /* ignore */ }
        setTimeout(() => { try { iframe.remove(); } catch { /* ignore */ } }, 60_000);
      }, 400);
      setPdfMsg("印刷ダイアログが開きます。");
    } else {
      iframe.remove();
      setPdfMsg("印刷を開始できませんでした。ブラウザの設定をご確認ください。");
    }
  }

  async function prepareRenderedPages(fullDoc: string) {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:820px;height:2000px;border:none;background:white;visibility:hidden;";
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!doc) {
      iframe.remove();
      throw new Error("出力用プレビューを準備できませんでした。");
    }

    doc.open();
    doc.write(fullDoc);
    doc.close();

    await new Promise((resolve) => setTimeout(resolve, 350));
    if (doc.fonts && doc.fonts.ready) {
      try { await doc.fonts.ready; } catch { /* ignore */ }
    }

    const pages = Array.from(doc.querySelectorAll<HTMLElement>(".print-page"));
    if (pages.length === 0) {
      iframe.remove();
      throw new Error("出力ページが見つかりませんでした。");
    }

    return {
      iframe,
      cleanup: () => { try { iframe.remove(); } catch { /* ignore */ } },
      pages,
    };
  }

  async function downloadPdf(mode: "all" | "first" = "all") {
    const built = buildAdminPrintDocument(mode, "render");
    if (!built) return;

    setPdfMsg("");
    setExportingAction(mode === "first" ? "pdf-first" : "pdf-all");
    try {
      await downloadLockedPdf(
        built.fullDoc,
        mode === "first" ? `${built.titleBase}-page1.pdf` : `${built.titleBase}.pdf`,
        true,
        {
          lockEditing: pdfLockEditing,
          ownerPassword: pdfOwnerPassword,
        }
      );
      setPdfMsg(pdfLockEditing ? "PDFを保存しました。編集制限も設定されています。" : "PDFを保存しました。");
    } catch (error) {
      setPdfMsg(error instanceof Error ? `PDF出力に失敗しました: ${error.message}` : "PDF出力に失敗しました。");
    } finally {
      setExportingAction(null);
    }
  }

  async function exportPreviewAsImage(mode: "all" | "first" = "all") {
    const built = buildAdminPrintDocument(mode, "render");
    if (!built) return;

    setPdfMsg("");
    setExportingAction(mode === "first" ? "image-first" : "image-all");
    try {
      const { default: html2canvas } = await import("html2canvas");
      const rendered = await prepareRenderedPages(built.fullDoc);
      const canvases: HTMLCanvasElement[] = [];
      try {
        const pagesToRender = mode === "first" ? rendered.pages.slice(0, 1) : rendered.pages;
        const renderScale = mode === "first" ? 2.2 : 1.6;
        for (let index = 0; index < pagesToRender.length; index += 1) {
          const page = pagesToRender[index];
          if (index > 0) {
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
          canvases.push(await html2canvas(page, {
            backgroundColor: "#ffffff",
            scale: renderScale,
            useCORS: true,
            logging: false,
            removeContainer: true,
            windowWidth: Math.ceil(page.scrollWidth || page.clientWidth || 820),
            windowHeight: Math.ceil(page.scrollHeight || page.clientHeight || 1123),
          }));
        }
      } finally {
        rendered.cleanup();
      }

      const pageCanvas = mode === "first" || canvases.length === 1
        ? canvases[0]
        : (() => {
            const gap = 32;
            const width = Math.max(...canvases.map((canvas) => canvas.width));
            const height = canvases.reduce((sum, canvas, index) => sum + canvas.height + (index > 0 ? gap : 0), 0);
            const merged = document.createElement("canvas");
            merged.width = width;
            merged.height = height;
            const ctx = merged.getContext("2d");
            if (!ctx) return canvases[0];
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, width, height);
            let y = 0;
            for (const canvas of canvases) {
              const x = Math.round((width - canvas.width) / 2);
              ctx.drawImage(canvas, x, y);
              y += canvas.height + gap;
            }
            return merged;
          })();
      const link = document.createElement("a");
      link.href = pageCanvas.toDataURL("image/png");
      link.download = mode === "first" ? `${built.titleBase}-page1.png` : `${built.titleBase}.png`;
      link.click();
    } catch (error) {
      setPdfMsg(error instanceof Error ? `画像出力に失敗しました: ${error.message}` : "画像出力に失敗しました。");
    } finally {
      setExportingAction(null);
    }
  }

  function startLayoutDrag(type: "title" | "date" | "info" | "grid" | "pageNo", event: ReactMouseEvent, ox: number, oy: number) {
    event.preventDefault();
    setDragging(type);
    setDragStart({ cx: event.clientX, cy: event.clientY, ox, oy });
  }

  function fmtOffset(value: number) {
    return `${value >= 0 ? "+" : ""}${Math.round(value * 10) / 10}`;
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
            {authUser && authRole === "admin" && (
              <p className="mt-2 text-xs font-bold text-emerald-600">
                管理者アカウント（{authUser.email ?? "ログイン中"}）を検出しました。パスワード入力なしでも入れる場合があります。
              </p>
            )}
          </div>
          <div className="rounded-3xl border bg-white p-8 shadow-sm">
            <div className="relative">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && unlock()}
                type={showPassword ? "text" : "password"}
                placeholder="管理者パスワード"
                autoFocus
                className="w-full rounded-xl border px-4 py-3 pr-14 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
                aria-label={showPassword ? "パスワードを隠す" : "パスワードを表示"}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
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
              disabled={authLoading}
              className="mt-4 w-full rounded-2xl bg-blue-600 py-3 font-black text-white hover:bg-blue-700 transition-colors"
            >
              {authLoading ? "確認中..." : "ログイン"}
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
            ["dashboard", `📊 ダッシュボード${metricsLoading && !metrics ? "（読込中）" : ""}`],
            ["create", "📚 単語帳を登録"],
            ["manage", `📋 管理（${loadingBooks && books.length === 0 ? "読込中" : `${books.length}件`}）`],
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

        {tab === "dashboard" && (
          <div className="mt-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-slate-900">運営ダッシュボード</h2>
                <p className="text-sm text-slate-500">登録者数・プラン・PDF利用状況を管理者画面でまとめて確認できます。</p>
              </div>
              <button
                onClick={() => fetchMetrics()}
                className="rounded-xl border px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                🔄 集計を更新
              </button>
            </div>

            {metricsMsg && (
              <div className="rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-800">{metricsMsg}</div>
            )}

            {!metrics && metricsLoading && (
              <div className="rounded-3xl border bg-white p-10 text-center shadow-sm">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
                <p className="mt-3 text-sm text-slate-400">ダッシュボードを集計しています...</p>
              </div>
            )}

            {metrics && (
              <>
                <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-3xl border bg-white p-5 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">登録ユーザー</p>
                    <p className="mt-2 text-3xl font-black text-slate-900">{metrics.overview.totalUsers.toLocaleString()}</p>
                    <p className="mt-2 text-xs text-slate-500">7日: {metrics.overview.signup7d}人 / 30日: {metrics.overview.signup30d}人</p>
                    <p className="mt-1 text-xs text-slate-400">
                      profiles {metrics.overview.profileUsers ?? 0}件 / 未作成 {metrics.overview.missingProfileCount ?? 0}件
                    </p>
                  </div>
                  <div className="rounded-3xl border bg-white p-5 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">有料プラン</p>
                    <p className="mt-2 text-3xl font-black text-blue-700">{metrics.overview.personalCount + metrics.overview.teacherCount}</p>
                    <p className="mt-2 text-xs text-slate-500">Personal {metrics.overview.personalCount} / Teacher {metrics.overview.teacherCount}</p>
                  </div>
                  <div className="rounded-3xl border bg-white p-5 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">アクティブ購読</p>
                    <p className="mt-2 text-3xl font-black text-emerald-700">{metrics.overview.activeSubscriptions}</p>
                    <p className="mt-2 text-xs text-slate-500">トライアル中 {metrics.overview.trialingSubscriptions} / 解約済み {metrics.overview.canceledSubscriptions}</p>
                  </div>
                  <div className="rounded-3xl border bg-white p-5 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">推定月額売上</p>
                    <p className="mt-2 text-3xl font-black text-violet-700">{formatCurrencyJPY(metrics.overview.estimatedMonthlyRevenue)}</p>
                    <p className="mt-2 text-xs text-slate-500">固定料金ベースの概算です</p>
                  </div>
                </section>

                <section className="grid gap-4 lg:grid-cols-3">
                  <div className="rounded-3xl border bg-white p-5 shadow-sm">
                    <h3 className="text-sm font-black text-slate-900">プラン内訳</h3>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      {[
                        { label: "Free", value: metrics.overview.freeCount, tone: "text-slate-700 bg-slate-50" },
                        { label: "Personal", value: metrics.overview.personalCount, tone: "text-blue-700 bg-blue-50" },
                        { label: "Teacher", value: metrics.overview.teacherCount, tone: "text-purple-700 bg-purple-50" },
                        { label: "Admin", value: metrics.overview.adminCount, tone: "text-red-700 bg-red-50" },
                      ].map((item) => (
                        <div key={item.label} className={`rounded-2xl p-4 ${item.tone}`}>
                          <p className="text-xs font-bold">{item.label}</p>
                          <p className="mt-2 text-2xl font-black">{item.value.toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-3xl border bg-white p-5 shadow-sm">
                    <h3 className="text-sm font-black text-slate-900">PDF利用状況</h3>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-blue-50 p-4 text-blue-700">
                        <p className="text-xs font-bold">累計生成</p>
                        <p className="mt-2 text-2xl font-black">{metrics.pdf.totalGenerations.toLocaleString()}</p>
                      </div>
                      <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-700">
                        <p className="text-xs font-bold">30日生成</p>
                        <p className="mt-2 text-2xl font-black">{metrics.pdf.generations30d.toLocaleString()}</p>
                      </div>
                      <div className="rounded-2xl bg-violet-50 p-4 text-violet-700">
                        <p className="text-xs font-bold">累計語数</p>
                        <p className="mt-2 text-2xl font-black">{metrics.pdf.totalWordsGenerated.toLocaleString()}</p>
                      </div>
                      <div className="rounded-2xl bg-amber-50 p-4 text-amber-700">
                        <p className="text-xs font-bold">30日語数</p>
                        <p className="mt-2 text-2xl font-black">{metrics.pdf.totalWordsGenerated30d.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border bg-white p-5 shadow-sm">
                    <h3 className="text-sm font-black text-slate-900">閲覧者数</h3>
                    <div className="mt-4 space-y-3">
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4">
                        <p className="text-sm font-bold text-slate-700">
                          {metrics.visitorMetrics?.available ? "閲覧者数を集計中" : "まだ閲覧データなし"}
                        </p>
                        <p className="mt-2 text-xs leading-6 text-slate-500">
                          {metrics.visitorMetrics?.message ?? "閲覧者数をここに表示します。"}
                        </p>
                        {metrics.visitorMetrics?.currentBrowserSummary && (
                          <p className="mt-2 text-xs leading-6 text-blue-700">
                            このブラウザ由来と見られる訪問は、30日で約{metrics.visitorMetrics.currentBrowserSummary.estimatedSelfVisits30d}回 / {metrics.visitorMetrics.currentBrowserSummary.estimatedSelfDays30d}日です。
                          </p>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-2xl bg-blue-50 p-4 text-blue-700">
                          <p className="text-xs font-bold">今日のPV</p>
                          <p className="mt-2 text-2xl font-black">{(metrics.visitorMetrics?.viewsToday ?? 0).toLocaleString()}</p>
                        </div>
                        <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-700">
                          <p className="text-xs font-bold">今日の訪問者</p>
                          <p className="mt-2 text-2xl font-black">{(metrics.visitorMetrics?.uniqueToday ?? 0).toLocaleString()}</p>
                        </div>
                        <div className="rounded-2xl bg-violet-50 p-4 text-violet-700">
                          <p className="text-xs font-bold">7日PV</p>
                          <p className="mt-2 text-2xl font-black">{(metrics.visitorMetrics?.views7d ?? 0).toLocaleString()}</p>
                        </div>
                        <div className="rounded-2xl bg-amber-50 p-4 text-amber-700">
                          <p className="text-xs font-bold">30日PV</p>
                          <p className="mt-2 text-2xl font-black">{(metrics.visitorMetrics?.views30d ?? 0).toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-black text-slate-900">よく見られているページ</p>
                          <span className="text-xs text-slate-400">30日</span>
                        </div>
                        <div className="mt-3 space-y-2">
                          {(metrics.visitorMetrics?.topPaths?.length ?? 0) === 0 ? (
                            <p className="text-sm text-slate-400">まだ閲覧ページの集計がありません。</p>
                          ) : (
                            metrics.visitorMetrics?.topPaths?.map((item) => (
                              <div key={item.path} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                                <a
                                  href={item.href ?? item.path}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="truncate pr-3 text-sm font-bold text-blue-700 hover:underline"
                                >
                                  {item.path}
                                </a>
                                <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-bold text-slate-700">{item.views} PV</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-black text-slate-900">流入元</p>
                          <span className="text-xs text-slate-400">30日</span>
                        </div>
                        <div className="mt-3 space-y-2">
                          {(metrics.visitorMetrics?.topReferrers?.length ?? 0) === 0 ? (
                            <p className="text-sm text-slate-400">まだ流入元の集計がありません。</p>
                          ) : (
                            metrics.visitorMetrics?.topReferrers?.map((item) => (
                              <div key={`${item.label}-${item.views}`} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                                {item.url ? (
                                  <a href={item.url} target="_blank" rel="noreferrer" className="truncate pr-3 text-sm font-bold text-blue-700 hover:underline">
                                    {item.label}
                                  </a>
                                ) : (
                                  <span className="truncate pr-3 text-sm font-bold text-slate-700">{item.label}</span>
                                )}
                                <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-bold text-slate-700">{item.views} PV</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-black text-slate-900">最近の訪問者</p>
                          <span className="text-xs text-slate-400">30日</span>
                        </div>
                        <div className="mt-3 space-y-2">
                          {(metrics.visitorMetrics?.recentVisitors?.length ?? 0) === 0 ? (
                            <p className="text-sm text-slate-400">まだ訪問者データがありません。</p>
                          ) : (
                            metrics.visitorMetrics?.recentVisitors?.map((item) => (
                              <div key={item.stableVisitorHash} className="rounded-xl bg-slate-50 px-3 py-3">
                                <div className="flex items-center justify-between gap-3">
                                  <p className="truncate text-sm font-black text-slate-800">
                                    {item.isCurrentBrowser ? "このブラウザ" : `訪問者 ${item.stableVisitorHash.slice(0, 8)}`}
                                  </p>
                                  <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-bold text-slate-700">
                                    {item.visits}日
                                  </span>
                                </div>
                                <p className="mt-1 text-xs text-slate-500">最終ページ: {item.lastPath}</p>
                                <p className="mt-1 text-xs text-slate-500">流入元: {item.referrerLabel || "direct"}</p>
                                <p className="mt-1 text-xs text-slate-400">UA: {item.ua || "unknown"}</p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-3xl border bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-black text-slate-900">よく使われた単語帳（30日）</h3>
                      <span className="text-xs text-slate-400">PDF生成ベース</span>
                    </div>
                    <div className="mt-4 space-y-3">
                      {metrics.wordbooks.topWordbooks.length === 0 ? (
                        <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">まだ利用データがありません。</p>
                      ) : (
                        metrics.wordbooks.topWordbooks.map((item, index) => (
                          <div key={`${item.wordbookId}-${index}`} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                            <div>
                              <p className="text-sm font-bold text-slate-800">{item.title}</p>
                              <p className="text-xs text-slate-400">ID: {item.wordbookId}</p>
                            </div>
                            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">{item.uses}回</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-3xl border bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-black text-slate-900">最近のPDF生成</h3>
                      <span className="text-xs text-slate-400">最新10件</span>
                    </div>
                    <div className="mt-4 overflow-hidden rounded-2xl border">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-xs text-slate-500">
                          <tr>
                            <th className="px-3 py-2 text-left">日時</th>
                            <th className="px-3 py-2 text-left">単語帳</th>
                            <th className="px-3 py-2 text-left">種類</th>
                            <th className="px-3 py-2 text-right">語数</th>
                          </tr>
                        </thead>
                        <tbody>
                          {metrics.pdf.recent.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-3 py-6 text-center text-slate-400">まだPDF生成履歴がありません。</td>
                            </tr>
                          ) : (
                            metrics.pdf.recent.map((item) => (
                              <tr key={item.id} className="border-t">
                                <td className="px-3 py-2 text-slate-500">{formatAdminDate(item.created_at)}</td>
                                <td className="px-3 py-2 font-bold text-slate-800">{item.wordbook_title}</td>
                                <td className="px-3 py-2 text-slate-500">{item.type}</td>
                                <td className="px-3 py-2 text-right font-bold text-slate-700">{item.word_count.toLocaleString()}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>

                <section className="rounded-3xl border bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-black text-slate-900">アカウント一覧</h3>
                      <p className="mt-1 text-xs text-slate-500">新しい順に最大100件まで表示します。</p>
                    </div>
                    <span className="text-xs text-slate-400">登録者 / 契約状況</span>
                  </div>
                  <div className="mt-4 overflow-x-auto">
                    {metrics.accounts.length === 0 ? (
                      <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">まだアカウントがありません。</p>
                    ) : (
                      <table className="min-w-full text-left text-sm">
                        <thead>
                          <tr className="border-b text-xs font-bold uppercase tracking-wide text-slate-400">
                            <th className="px-3 py-2">メール</th>
                            <th className="px-3 py-2">プラン</th>
                            <th className="px-3 py-2">購読</th>
                            <th className="px-3 py-2">role</th>
                            <th className="px-3 py-2">profiles</th>
                            <th className="px-3 py-2">登録日</th>
                          </tr>
                        </thead>
                        <tbody>
                          {metrics.accounts.map((account) => (
                            <tr key={account.id} className="border-b last:border-b-0">
                              <td className="px-3 py-3">
                                <div className="min-w-[220px]">
                                  <p className="font-bold text-slate-800">{account.email ?? "メール未設定"}</p>
                                  <p className="mt-1 font-mono text-[11px] text-slate-400">{account.id}</p>
                                </div>
                              </td>
                              <td className="px-3 py-3">
                                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                                  {account.plan || "free"}
                                </span>
                              </td>
                              <td className="px-3 py-3">
                                <div className="min-w-[120px]">
                                  <p className="font-bold text-slate-700">{account.subscriptionStatus ?? "-"}</p>
                                  <p className="mt-1 text-xs text-slate-400">
                                    {account.currentPeriodEnd ? formatAdminDate(account.currentPeriodEnd) : ""}
                                  </p>
                                </div>
                              </td>
                              <td className="px-3 py-3 text-slate-600">{account.role}</td>
                              <td className="px-3 py-3">
                                <span className={`rounded-full px-2 py-1 text-xs font-bold ${account.hasProfile ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                                  {account.hasProfile ? "あり" : "未作成"}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-slate-600">{formatAdminDate(account.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </section>

                <section className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-3xl border bg-white p-5 shadow-sm">
                    <h3 className="text-sm font-black text-slate-900">単語帳の公開状況</h3>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      {[
                        { label: "全単語帳", value: metrics.wordbooks.total, tone: "bg-slate-50 text-slate-700" },
                        { label: "公式単語帳", value: metrics.wordbooks.official, tone: "bg-blue-50 text-blue-700" },
                        { label: "公開中", value: metrics.wordbooks.publicCount, tone: "bg-emerald-50 text-emerald-700" },
                        { label: "Personal限定", value: metrics.wordbooks.personalCount, tone: "bg-indigo-50 text-indigo-700" },
                        { label: "Teacher限定", value: metrics.wordbooks.teacherCount, tone: "bg-purple-50 text-purple-700" },
                        { label: "管理者限定", value: metrics.wordbooks.adminOnlyCount, tone: "bg-red-50 text-red-700" },
                      ].map((item) => (
                        <div key={item.label} className={`rounded-2xl p-4 ${item.tone}`}>
                          <p className="text-xs font-bold">{item.label}</p>
                          <p className="mt-2 text-2xl font-black">{item.value.toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-3xl border bg-white p-5 shadow-sm">
                    <h3 className="text-sm font-black text-slate-900">PDFタイプ内訳（30日）</h3>
                    <div className="mt-4 space-y-3">
                      {metrics.pdf.topTypes.length === 0 ? (
                        <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">まだ集計対象のPDF生成がありません。</p>
                      ) : (
                        metrics.pdf.topTypes.map((item) => (
                          <div key={item.type} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                            <span className="text-sm font-bold text-slate-800">{item.type}</span>
                            <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-700">{item.count}件</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </section>
              </>
            )}
          </div>
        )}

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
                            const headers = await getAdminHeaders();
                            const res = await fetch("/api/admin/official-wordbooks", {
                              method: "POST",
                              headers: { "Content-Type": "application/json", ...headers },
                              body: JSON.stringify({
                                title: tmpl.title,
                                description: tmpl.description,
                                cover_image: tmpl.coverImage,
                                visibility: tmpl.visibility,
                                words: [],
                              }),
                            });
                            const result = await res.json().catch(() => ({}));
                            if (res.ok) { setManageMsg(`✅ 「${tmpl.title}」を登録しました。単語を追加してください。`); await fetchBooks({ includeWords: false }); }
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
            {duplicateTitleGroups.length > 0 && (
              <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-black">同名の公式単語帳が複数あります</p>
                <p className="mt-1 text-xs">
                  保存した内容が別レコードに戻る原因になります。下の一覧で同じタイトルが複数表示されていないか確認してください。
                </p>
              </div>
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
                            <span className="text-xs text-slate-400">{getBookWordCount(book)}語</span>
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
                      {b.title}（{getBookWordCount(b)}語{b.visibility === "admin" ? " 🔒管理者限定" : ""})
                    </option>
                  ))}
                </select>

                {selectedPdfBook && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {[
                      { label: "開始（何番目）", value: pdfStartNo, set: setPdfStartNo },
                      { label: "終了（何番目）", value: pdfEndNo, set: setPdfEndNo },
                      { label: "問題数", value: pdfCount, set: setPdfCount },
                    ].map(({ label, value, set }) => (
                      <div key={label}>
                        <label className="text-xs font-bold text-slate-500">{label}</label>
                        <input type="number" min={1} value={value} onChange={(e) => set(Math.max(1, Number(e.target.value) || 1))} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
                      </div>
                    ))}
                    <p className="col-span-3 text-xs text-slate-400">
                      この単語帳は全{getBookWordCount(selectedPdfBook)}語。「開始／終了」はリストの何番目かで指定します。
                    </p>
                  </div>
                )}
              </section>

              <section className="rounded-3xl border bg-white p-5 shadow-sm space-y-3">
                <h2 className="text-lg font-black">⚙️ 印刷設定</h2>

                <div>
                  <label className="text-sm font-bold">印刷タイトル（空欄で自動）</label>
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
                    { label: "日付を入れる", checked: pdfDate, set: setPdfDate },
                    { label: "ウォーターマーク", checked: pdfWatermark, set: setPdfWatermark },
                  ].map(({ label, checked, set }) => (
                    <label key={label} className="flex items-center gap-2 text-sm font-bold cursor-pointer">
                      <input type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)} className="rounded" />
                      {label}
                    </label>
                  ))}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
                    <input type="checkbox" checked={pdfLockEditing} onChange={(e) => setPdfLockEditing(e.target.checked)} className="rounded" />
                    PDFの編集を制限する
                  </label>
                  <p className="mt-1 text-xs text-slate-500">
                    Acrobatなどで編集・コピーを制限します。閲覧と印刷はできます。
                  </p>
                  {pdfLockEditing && (
                    <div className="mt-3">
                      <label className="text-xs font-bold text-slate-500">変更用パスワード（任意）</label>
                      <input
                        type="text"
                        value={pdfOwnerPassword}
                        onChange={(e) => setPdfOwnerPassword(e.target.value)}
                        placeholder="空欄なら自動で設定"
                        className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"
                      />
                    </div>
                  )}
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
                    <button
                      onClick={() => setShowLayoutEditor(true)}
                      disabled={!selectedPdfBook || pdfOutputWords.length === 0}
                      className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      プレビュー調整
                    </button>
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-600">管理者限定 非公開</span>
                  </div>
                </div>

                {!selectedPdfBook || pdfOutputWords.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">単語帳を選択してください</p>
                ) : (
                  <div className="flex justify-center rounded-2xl border bg-slate-100 p-4">
                    <div
                      className="overflow-hidden bg-white shadow-md"
                      style={{ width: Math.round(794 * PREVIEW_SCALE), height: Math.round(1123 * PREVIEW_SCALE) }}
                    >
	                      <iframe
	                        ref={previewIframeRef}
	                        title="印刷プレビュー"
	                        srcDoc={pdfPreviewDoc}
	                        aria-label="印刷プレビュー"
	                        style={{ width: 794, height: 1123, border: 0, transform: `scale(${PREVIEW_SCALE})`, transformOrigin: "top left" }}
	                      />
                    </div>
                  </div>
                )}
                {selectedPdfBook && pdfOutputWords.length > 0 && (
                  <p className="mt-2 text-center text-xs text-slate-400">
                    実際のA4レイアウトのプレビューです（{pdfOutputWords.length}語 / {Math.max(1, Math.ceil(pdfOutputWords.length / 50))}ページ）。
                  </p>
                )}
              </section>

              {pdfMsg && <p className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{pdfMsg}</p>}

	              <div className="grid gap-4 lg:grid-cols-2">
	                <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 shadow-sm">
	                  <div className="mb-3">
	                    <p className="text-sm font-black text-blue-900">通常出力</p>
	                    <p className="text-xs text-blue-700">全ページをそのまま印刷・PDF・画像にできます。</p>
	                  </div>
	                  <div className="grid gap-2 sm:grid-cols-3">
	                    <button
	                      onClick={() => openPrintPage("all")}
	                      disabled={!selectedPdfBook || pdfOutputWords.length === 0 || exportingAction !== null}
	                      className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-400 transition-colors shadow"
	                    >
	                      印刷
	                    </button>
	                    <button
	                      onClick={() => downloadPdf("all")}
	                      disabled={!selectedPdfBook || pdfOutputWords.length === 0 || exportingAction !== null}
	                      className="rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm font-black text-blue-700 hover:bg-blue-50 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 transition-colors shadow-sm"
	                    >
	                      {exportingAction === "pdf-all" ? "PDF作成中..." : "PDF保存"}
	                    </button>
	                    <button
	                      onClick={() => exportPreviewAsImage("all")}
	                      disabled={!selectedPdfBook || pdfOutputWords.length === 0 || exportingAction !== null}
	                      className="rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm font-black text-blue-700 hover:bg-blue-50 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 transition-colors shadow-sm"
	                    >
	                      {exportingAction === "image-all" ? "画像出力中..." : "画像保存"}
	                    </button>
	                  </div>
	                </div>
	                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
	                  <div className="mb-3">
	                    <p className="text-sm font-black text-slate-900">最初の1枚だけ</p>
	                    <p className="text-xs text-slate-500">表紙や見本用に、1ページ目だけを切り出して使えます。</p>
	                  </div>
	                  <div className="grid gap-2 sm:grid-cols-3">
	                    <button
	                      onClick={() => openPrintPage("first")}
	                      disabled={!selectedPdfBook || pdfOutputWords.length === 0 || exportingAction !== null}
	                      className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-400 transition-colors shadow"
	                    >
	                      1枚目を印刷
	                    </button>
	                    <button
	                      onClick={() => downloadPdf("first")}
	                      disabled={!selectedPdfBook || pdfOutputWords.length === 0 || exportingAction !== null}
	                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400 transition-colors shadow-sm"
	                    >
	                      {exportingAction === "pdf-first" ? "PDF作成中..." : "1枚目PDF"}
	                    </button>
	                    <button
	                      onClick={() => exportPreviewAsImage("first")}
	                      disabled={!selectedPdfBook || pdfOutputWords.length === 0 || exportingAction !== null}
	                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400 transition-colors shadow-sm"
	                    >
	                      {exportingAction === "image-first" ? "画像出力中..." : "1枚目画像"}
	                    </button>
	                  </div>
	                </div>
	              </div>
	              <p className="text-center text-xs text-slate-400">
	                印刷はダイアログを開き、PDFはファイル保存、画像はPNG保存です。
	              </p>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl border bg-white p-4 text-center shadow-sm">
                  <p className="text-2xl font-black text-blue-600">{books.length}</p>
                  <p className="mt-1 text-xs text-slate-500">公式単語帳</p>
                </div>
                <div className="rounded-2xl border bg-white p-4 text-center shadow-sm">
                  <p className="text-2xl font-black text-slate-700">{books.reduce((sum, book) => sum + getBookWordCount(book), 0).toLocaleString()}</p>
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
      {showLayoutEditor && selectedPdfBook && pdfOutputWords.length > 0 && (() => {
        const ppMM = PREVIEW_SCALE * 3.78;
        const iframeW = 794;
        const iframeH = 1123;
        const overlayW = Math.round(iframeW * PREVIEW_SCALE);
        const overlayH = Math.round(iframeH * PREVIEW_SCALE);
        const hasInfoFields = pdfShowRecord && (pdfClass || pdfNumber || pdfName);
        const titleHandleStyle: CSSProperties = {
          position: "absolute",
          top: Math.round((9 + pdfTitleOffset.y) * ppMM),
          left: "12%",
          right: "12%",
          height: Math.round(13 * ppMM),
          transform: `translateX(${pdfTitleOffset.x * ppMM}px)`,
          background: "rgba(59,130,246,0.18)",
          border: "1.5px dashed #3b82f6",
          borderRadius: 3,
          cursor: "move",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        };
        const dateHandleStyle: CSSProperties = {
          position: "absolute",
          top: Math.round((9 + pdfTitleOffset.y + pdfDateOffset.y) * ppMM),
          right: Math.max(2, Math.round((9 - pdfDateOffset.x) * ppMM)),
          width: 52,
          height: Math.round(8 * ppMM),
          background: "rgba(234,179,8,0.22)",
          border: "1.5px dashed #ca8a04",
          borderRadius: 3,
          cursor: "move",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        };
        const pageNoHandleStyle: CSSProperties = {
          position: "absolute",
          top: Math.round((9 + 280 - 9 - 6 + pdfPageNoOffset.y) * ppMM),
          left: "35%",
          right: "35%",
          height: Math.round(8 * ppMM),
          transform: `translateX(${pdfPageNoOffset.x * ppMM}px)`,
          background: "rgba(100,116,139,0.2)",
          border: "1.5px dashed #64748b",
          borderRadius: 3,
          cursor: "move",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        };
        const gridHandleStyle: CSSProperties = {
          position: "absolute",
          top: Math.round((9 + 10 + 85 + pdfGridOffset.y) * ppMM),
          left: "3%",
          right: "3%",
          height: Math.round(16 * ppMM),
          transform: `translateX(${pdfGridOffset.x * ppMM}px)`,
          background: "rgba(139,92,246,0.15)",
          border: "1.5px dashed #8b5cf6",
          borderRadius: 3,
          cursor: "move",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        };
        const infoHandleStyle: CSSProperties = {
          position: "absolute",
          bottom: Math.round((8 + 5 + 6 + 9) * ppMM) - Math.round(pdfInfoOffset.y * ppMM),
          left: "5%",
          right: "5%",
          height: Math.round(10 * ppMM),
          transform: `translateX(${pdfInfoOffset.x * ppMM}px)`,
          background: "rgba(16,185,129,0.18)",
          border: "1.5px dashed #10b981",
          borderRadius: 3,
          cursor: "move",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        };
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseLeave={() => { if (dragging) setDragging(null); }}>
            <div className="flex max-h-[95vh] max-w-[96vw] overflow-hidden rounded-3xl bg-white shadow-2xl">
              <div className="flex flex-col">
                <div className="border-b px-5 py-4">
                  <h2 className="text-lg font-black">印刷プレビュー調整</h2>
                  <p className="mt-0.5 text-xs text-slate-400">青=タイトル / 黄=日付 / 紫=単語リスト / 緑=記録欄 / 灰=ページ番号</p>
                </div>
                <div className="overflow-auto p-4" style={{ background: "#e8edf2" }}>
                  <div style={{ position: "relative", width: overlayW, height: overlayH, background: "white", boxShadow: "0 4px 20px rgba(0,0,0,0.18)" }}>
                    <iframe
                      srcDoc={pdfPreviewDoc}
                      style={{ width: iframeW, height: iframeH, transform: `scale(${PREVIEW_SCALE})`, transformOrigin: "top left", border: "none", display: "block", pointerEvents: "none" }}
                    />
                    <div style={{ position: "absolute", inset: 0 }}>
                      <div style={titleHandleStyle} onMouseDown={(e) => startLayoutDrag("title", e, pdfTitleOffset.x, pdfTitleOffset.y)}><span style={{ fontSize: 9, color: "#3b82f6", fontWeight: 800, userSelect: "none" }}>タイトル</span></div>
                      {pdfDate && <div style={dateHandleStyle} onMouseDown={(e) => startLayoutDrag("date", e, pdfDateOffset.x, pdfDateOffset.y)}><span style={{ fontSize: 8, color: "#92400e", fontWeight: 800, userSelect: "none" }}>日付</span></div>}
                      <div style={gridHandleStyle} onMouseDown={(e) => startLayoutDrag("grid", e, pdfGridOffset.x, pdfGridOffset.y)}><span style={{ fontSize: 9, color: "#8b5cf6", fontWeight: 800, userSelect: "none" }}>単語リスト</span></div>
                      {hasInfoFields && <div style={infoHandleStyle} onMouseDown={(e) => startLayoutDrag("info", e, pdfInfoOffset.x, pdfInfoOffset.y)}><span style={{ fontSize: 9, color: "#10b981", fontWeight: 800, userSelect: "none" }}>記録欄</span></div>}
                      {pdfShowPageNo && <div style={pageNoHandleStyle} onMouseDown={(e) => startLayoutDrag("pageNo", e, pdfPageNoOffset.x, pdfPageNoOffset.y)}><span style={{ fontSize: 8, color: "#475569", fontWeight: 800, userSelect: "none" }}>ページ番号</span></div>}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex w-56 flex-col border-l">
                <div className="flex-1 space-y-4 overflow-auto p-5 text-xs">
                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-3"><p className="mb-1 font-bold text-blue-700">タイトル</p><p className="text-slate-500">横 {fmtOffset(pdfTitleOffset.x)}mm / 縦 {fmtOffset(pdfTitleOffset.y)}mm</p></div>
                  {pdfDate && <div className="rounded-xl border border-yellow-100 bg-yellow-50 p-3"><p className="mb-1 font-bold text-yellow-700">日付</p><p className="text-slate-500">横 {fmtOffset(pdfDateOffset.x)}mm / 縦 {fmtOffset(pdfDateOffset.y)}mm</p></div>}
                  <div className="rounded-xl border border-violet-100 bg-violet-50 p-3"><p className="mb-1 font-bold text-violet-700">単語リスト</p><p className="text-slate-500">横 {fmtOffset(pdfGridOffset.x)}mm / 縦 {fmtOffset(pdfGridOffset.y)}mm</p></div>
                  {hasInfoFields && <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3"><p className="mb-1 font-bold text-emerald-700">記録欄</p><p className="text-slate-500">横 {fmtOffset(pdfInfoOffset.x)}mm / 縦 {fmtOffset(pdfInfoOffset.y)}mm</p></div>}
                  {pdfShowPageNo && <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="mb-1 font-bold text-slate-700">ページ番号</p><p className="text-slate-500">横 {fmtOffset(pdfPageNoOffset.x)}mm / 縦 {fmtOffset(pdfPageNoOffset.y)}mm</p></div>}
                </div>
                <div className="border-t p-4">
                  <div className="grid gap-2">
                    <button onClick={() => { setPdfTitleOffset({ x: 0, y: 0 }); setPdfDateOffset({ x: 0, y: 0 }); setPdfInfoOffset({ x: 0, y: 0 }); setPdfGridOffset({ x: 0, y: 0 }); setPdfPageNoOffset({ x: 0, y: 0 }); }} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">位置をリセット</button>
                    <button onClick={() => setShowLayoutEditor(false)} className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700">閉じる</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </main>
  );
}
