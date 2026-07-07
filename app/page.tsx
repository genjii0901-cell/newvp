"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fallbackOfficialWordbooks } from "@/lib/official-wordbooks";
import { getPageCount, planLimits } from "@/lib/plan-limits";
import { formatMeaning } from "@/lib/meaning";
import { primeSpeechVoices, speakText } from "@/lib/speech";
import { buildWordbookPath } from "@/lib/wordbook-slug";

type Word = {
  no: number;
  english: string;
  japanese: string;
};

type WordBook = {
  id: string;
  title: string;
  level: string;
  premium: boolean;
  requiredPlan: Plan;
  description?: string;
  coverImage?: string;
  creator?: string;
  wordCount?: number;
  words: Word[];
};

type Plan = "free" | "personal" | "teacher";
type PdfType = "list" | "test" | "answer";
type Direction = "en-ja" | "ja-en" | "spelling";
type PrintStyle = "standard" | "blank-english" | "blank-japanese" | "red-english" | "red-japanese";
type Role = "user" | "admin";
type OverlapMode = "common" | "base-only" | "compare-only" | "all";
type StudyPanelMode = "list" | "listening";
type ListeningVoiceMode = "en-only" | "en-ja" | "ja-en";
type MeaningMode = "all" | "main";
type ListeningStudyMode = "listen" | "test";

function normalizeAuthErrorMessage(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("security purposes") && lower.includes("60 seconds")) {
    return "短時間に続けて送信されたため、次の確認メールは60秒ほど待ってから再度お試しください。";
  }
  if (lower.includes("email rate limit exceeded")) {
    return "確認メールの送信回数が上限に達しました。少し待ってからもう一度お試しください。";
  }
  if (lower.includes("invalid login credentials")) {
    return "メールアドレスまたはパスワードが違います。";
  }
  return message;
}

function normalizePlan(value: unknown): Plan {
  return value === "personal" || value === "teacher" ? value : "free";
}

function planLabel(plan: Plan) {
  if (plan === "teacher") return "Teacher";
  if (plan === "personal") return "Personal";
  return "Free";
}

function planRank(plan: Plan) {
  if (plan === "teacher") return 2;
  if (plan === "personal") return 1;
  return 0;
}

function planCacheKey(userId: string) {
  return `vpp-profile-plan:${userId}`;
}

function parsePastedWords(text: string) {
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(1)
    .map((line, index) => {
      const cells = line.includes("\t") ? line.split("\t") : line.split(",");
      return {
        no: Number(cells[0]) || index + 1,
        english: cells[1]?.trim() || "",
        japanese: cells[2]?.trim() || "",
      };
    })
    .filter((word) => word.english && word.japanese);
}

function formatPrintDate(date = new Date()) {
  return date.toLocaleDateString("ja-JP");
}

function getListeningPlaceholder(word: Word, selectedBook: WordBook | null) {
  if (selectedBook?.coverImage) return selectedBook.coverImage;
  return `https://dummyimage.com/900x540/e2e8f0/334155&text=${encodeURIComponent(word.english || "Word")}`;
}

function normalizeWordKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isJapaneseOnlyText(value: string) {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(value) && !/[A-Za-z]/.test(value);
}

function rateValue(speed: number, base: number) {
  return Math.max(0.5, Math.min(1.4, Math.round(base * speed * 100) / 100));
}

function localUsageKey(userId: string, plan: Plan) {
  const now = new Date();
  const period =
    planLimits[plan].period === "month"
      ? `${now.getFullYear()}-${now.getMonth() + 1}`
      : now.toISOString().slice(0, 10);
  return `vpp-pdf-usage:${userId}:${plan}:${period}`;
}

function localUsageTotalKey(userId: string, plan: Plan) {
  return `vpp-pdf-usage-total:${userId}:${plan}`;
}

function readCachedPlan(userId: string): Plan | null {
  try {
    const value = window.localStorage.getItem(planCacheKey(userId));
    return value ? normalizePlan(value) : null;
  } catch {
    return null;
  }
}

function writeCachedPlan(userId: string, nextPlan: Plan) {
  try {
    window.localStorage.setItem(planCacheKey(userId), nextPlan);
  } catch {
    // localStorage can be unavailable in private or restricted browser modes.
  }
}

function checkLocalUsage(userId: string, plan: Plan, wordCount: number, pageCount: number) {
  const rule = planLimits[plan];

  if (typeof rule.maxPages === "number" && pageCount > rule.maxPages) {
    return {
      ok: false,
      message: `${planLabel(plan)} plan allows up to ${rule.maxPages} pages per export.`,
    };
  }

  if (typeof rule.maxWords === "number" && wordCount > rule.maxWords) {
    return {
      ok: false,
      message: `${planLabel(plan)} plan allows up to ${rule.maxWords} words per export.`,
    };
  }

  try {
    const key = localUsageKey(userId, plan);
    const used = Number(window.localStorage.getItem(key) ?? "0");
    if (used >= rule.maxGenerations) {
      return {
        ok: false,
        message: `${planLabel(plan)} plan has reached today's export limit.`,
      };
    }
    if (typeof rule.maxTotalGenerations === "number") {
      const totalKey = localUsageTotalKey(userId, plan);
      const totalUsed = Number(window.localStorage.getItem(totalKey) ?? "0");
      if (totalUsed >= rule.maxTotalGenerations) {
        return {
          ok: false,
          message: `${planLabel(plan)} plan has reached the total export limit (${rule.maxTotalGenerations}).`,
        };
      }
    }
  } catch {
    // If localStorage is blocked, do not stop printing solely because of that.
  }

  return { ok: true, message: "" };
}

function recordLocalUsage(userId: string, plan: Plan) {
  try {
    const key = localUsageKey(userId, plan);
    const used = Number(window.localStorage.getItem(key) ?? "0");
    window.localStorage.setItem(key, String(used + 1));
    const totalKey = localUsageTotalKey(userId, plan);
    const totalUsed = Number(window.localStorage.getItem(totalKey) ?? "0");
    window.localStorage.setItem(totalKey, String(totalUsed + 1));
  } catch {
    // Best-effort backup only. Server-side history is still attempted when a token exists.
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

const sampleWords: Word[] = [
  { no: 1, english: "vital", japanese: "非常に重要な；生命の" },
  { no: 2, english: "vivid", japanese: "生き生きとした；鮮やかな" },
  { no: 3, english: "revive", japanese: "〜を生き返らせる；復活する" },
  { no: 4, english: "essential", japanese: "必要不可欠な；本質的な" },
  { no: 5, english: "indispensable", japanese: "なくてはならない；必須の" },
  { no: 6, english: "crucial", japanese: "極めて重要な；決定的な" },
  { no: 7, english: "significance", japanese: "重要性；意義" },
  { no: 8, english: "consequence", japanese: "結果；重要さ" },
  { no: 9, english: "distinguish", japanese: "〜を区別する；見分ける" },
  { no: 10, english: "ambiguous", japanese: "曖昧な；どちらとも取れる" },
  { no: 11, english: "concentrate", japanese: "集中する；〜を集中させる" },
  { no: 12, english: "component", japanese: "構成要素；部品" },
  { no: 13, english: "reveal", japanese: "〜を明らかにする" },
  { no: 14, english: "conceal", japanese: "〜を隠す" },
  { no: 15, english: "accelerate", japanese: "〜を加速する；促進する" },
  { no: 16, english: "perspective", japanese: "視点；見通し" },
  { no: 17, english: "interpret", japanese: "〜を解釈する；通訳する" },
  { no: 18, english: "hypothesis", japanese: "仮説；前提" },
  { no: 19, english: "demonstrate", japanese: "〜を実証する；実演する" },
  { no: 20, english: "sufficient", japanese: "十分な" },
];

function createWords(count: number): Word[] {
  return Array.from({ length: count }, (_, index) => {
    const base = sampleWords[index % sampleWords.length];
    return {
      no: index + 1,
      english: base.english,
      japanese: base.japanese,
    };
  });
}

const initialBooks: WordBook[] = [
  {
    id: "eiken-pre1",
    title: "英検準1級 重要語彙セット",
    level: "準1級",
    premium: false,
    requiredPlan: "free",
    description: "英検準1級レベルの重要語彙を厳選。印刷しやすいA4レイアウトで学習をサポートします。",
    coverImage:
      "https://images.unsplash.com/photo-1513258496099-48168024aec0?auto=format&fit=crop&w=900&q=80",
    words: createWords(120),
  },
  {
    id: "academic",
    title: "難関大向け 学術語彙セット",
    level: "難関大",
    premium: true,
    requiredPlan: "personal",
    description: "難関大受験対応の高レベル語彙セット。長文読解と記述式対策に最適です。",
    coverImage:
      "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=900&q=80",
    words: createWords(160),
  },
  {
    id: "junior",
    title: "中学英単語 基礎セット",
    level: "中学",
    premium: false,
    requiredPlan: "free",
    description: "中学校で学ぶ基礎英単語を網羅。すっきり見やすいレイアウトで素早く印刷できます。",
    coverImage:
      "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=900&q=80",
    words: createWords(80),
  },
];

const defaultCoverImages = [
  "https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1516979187457-637abb4f9353?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=900&q=80",
];
const PASTE_STORAGE_KEY = "vpp-pasted-words";

const sharedInitialBooks: WordBook[] = fallbackOfficialWordbooks.map((book) => ({
  id: book.id,
  title: book.title,
  level: book.level,
  premium: book.requiredPlan !== "free",
  requiredPlan: book.requiredPlan,
  description: book.description,
  coverImage: book.coverImage,
  words: book.words.map((word) => ({
    no: word.no,
    english: word.english,
    japanese: word.japanese,
  })),
}));

function getBookCover(book: WordBook, index: number) {
  if (book.coverImage) return book.coverImage;
  return defaultCoverImages[index % defaultCoverImages.length];
}

function getBookWordCount(book: WordBook) {
  return typeof book.wordCount === "number" ? book.wordCount : book.words.length;
}

function buildOverlapRows(baseBook: WordBook | null, compareBook: WordBook | null, mode: OverlapMode) {
  if (!baseBook || !compareBook) return [];
  if (baseBook.id === compareBook.id) return [];
  if (baseBook.words.length === 0 || compareBook.words.length === 0) return [];

  const compareMap = new Map(compareBook.words.map((word) => [normalizeWordKey(word.english), word] as const));
  const baseMap = new Map(baseBook.words.map((word) => [normalizeWordKey(word.english), word] as const));

  const common = baseBook.words
    .filter((word) => compareMap.has(normalizeWordKey(word.english)))
    .map((word, index) => {
      const pair = compareMap.get(normalizeWordKey(word.english));
      return {
        no: index + 1,
        baseNo: word.no,
        compareNo: pair?.no ?? null,
        english: word.english,
        japanese: pair && pair.japanese !== word.japanese ? `${word.japanese} / ${pair.japanese}` : word.japanese,
        bucket: "common" as const,
        source: "共通",
      };
    });

  const baseOnly = baseBook.words
    .filter((word) => !compareMap.has(normalizeWordKey(word.english)))
    .map((word, index) => ({
      no: index + 1,
      baseNo: word.no,
      compareNo: null,
      english: word.english,
      japanese: word.japanese,
      bucket: "base-only" as const,
      source: `${baseBook.title}のみ`,
    }));

  const compareOnly = compareBook.words
    .filter((word) => !baseMap.has(normalizeWordKey(word.english)))
    .map((word, index) => ({
      no: index + 1,
      baseNo: null,
      compareNo: word.no,
      english: word.english,
      japanese: word.japanese,
      bucket: "compare-only" as const,
      source: `${compareBook.title}のみ`,
    }));

  const merged =
    mode === "common"
      ? common
      : mode === "base-only"
        ? baseOnly
        : mode === "compare-only"
          ? compareOnly
          : [...common, ...baseOnly, ...compareOnly];

  return merged.map((row, index) => ({ ...row, no: index + 1 }));
}

export default function Home() {
  const supabase = useMemo(() => createClient(), []);

  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>("user");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"info" | "success" | "error">("info");

  const [plan, setPlan] = useState<Plan>("free");
  const [books, setBooks] = useState<WordBook[]>([]);
  const [booksLoaded, setBooksLoaded] = useState(false);
  const [bookId, setBookId] = useState("");
  const [bookSearch, setBookSearch] = useState("");
  const [startNo, setStartNo] = useState(1);
  const [endNo, setEndNo] = useState(50);
  const [count, setCount] = useState(50);
  const [random, setRandom] = useState(false);
  const [type, setType] = useState<PdfType>("list");
  const [direction, setDirection] = useState<Direction>("en-ja");
  const [showPageNo, setShowPageNo] = useState(true);
  const [printStyle, setPrintStyle] = useState<PrintStyle>("standard");
  const [includeWatermark, setIncludeWatermark] = useState(true);
  const [showRecordFields, setShowRecordFields] = useState(true);
  const [showClassField, setShowClassField] = useState(true);
  const [showNumberField, setShowNumberField] = useState(true);
  const [showNameField, setShowNameField] = useState(true);
  const [studentClass, setStudentClass] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [studentName, setStudentName] = useState("");
  const [includeDate, setIncludeDate] = useState(true);
  const [overlapBaseBookId, setOverlapBaseBookId] = useState("");
  const [overlapCompareBookId, setOverlapCompareBookId] = useState("");
  const [overlapMode, setOverlapMode] = useState<OverlapMode>("common");
  const [pasteText, setPasteText] = useState(
    "number\tenglish\tjapanese\n1\tcustomize\t〜をカスタマイズする\n2\tevaluate\t〜を評価する\n3\tsustain\t〜を維持する"
  );
  const [history, setHistory] = useState<string[]>([]);
  const [pdfMessage, setPdfMessage] = useState("");
  const [configuredPlans, setConfiguredPlans] = useState<Record<Exclude<Plan, "free">, boolean>>({
    personal: false,
    teacher: false,
  });
  const [pdfTitle, setPdfTitle] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [studyPanelMode, setStudyPanelMode] = useState<StudyPanelMode>("list");
  const [listeningIndex, setListeningIndex] = useState(0);
  const [listeningRepeat, setListeningRepeat] = useState(1);
  const [listeningGapMs, setListeningGapMs] = useState(1200);
  const [listeningSpeed, setListeningSpeed] = useState(1);
  const [listeningVoiceMode, setListeningVoiceMode] = useState<ListeningVoiceMode>("en-ja");
  const [listeningMeaningMode, setListeningMeaningMode] = useState<MeaningMode>("main");
  const [listeningStudyMode, setListeningStudyMode] = useState<ListeningStudyMode>("listen");
  const [showListeningAnswer, setShowListeningAnswer] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [loadingBookWordsId, setLoadingBookWordsId] = useState("");
  const [titleOffset, setTitleOffset] = useState({ x: 0, y: 0 });
  const [dateOffset, setDateOffset] = useState({ x: 0, y: 0 });
  const [infoOffset, setInfoOffset] = useState({ x: 0, y: 0 });
  const [gridOffset, setGridOffset] = useState({ x: 0, y: 0 });
  const [pageNoOffset, setPageNoOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState<"title" | "date" | "info" | "grid" | "pageNo" | null>(null);
  const [dragStart, setDragStart] = useState({ cx: 0, cy: 0, ox: 0, oy: 0 });
  const previewIframeRef = useRef<HTMLIFrameElement>(null);
  const listeningTimerRef = useRef<number | null>(null);
  const listeningRunRef = useRef({ stopped: false, id: 0 });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedPaste = window.localStorage.getItem(PASTE_STORAGE_KEY);
    if (savedPaste) setPasteText(savedPaste);
    primeSpeechVoices();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PASTE_STORAGE_KEY, pasteText);
  }, [pasteText]);

  const ensureBookWords = useCallback(
    async (targetBookId: string) => {
      const existingBook = books.find((book) => book.id === targetBookId);
      if (!existingBook) return null;
      if (existingBook.words.length > 0 || targetBookId.startsWith("custom-") || targetBookId.startsWith("wb-")) {
        return existingBook;
      }
      if (loadingBookWordsId === targetBookId) {
        return existingBook;
      }

      setLoadingBookWordsId(targetBookId);

      try {
        const response = await fetch(
          `/api/wordbooks/official?id=${encodeURIComponent(targetBookId)}&includeWords=1`
        );
        const result = await response.json().catch(() => ({}));
        const rawBook = Array.isArray(result.wordbooks)
          ? result.wordbooks.find((book: { id?: string | number }) => String(book.id) === targetBookId) ?? null
          : null;
        if (!response.ok || !rawBook) return existingBook;

        const nextWords = Array.isArray(rawBook.words)
          ? rawBook.words
              .filter((word: { english?: string; japanese?: string }) => word.english && word.japanese)
              .map((word: { no?: number; english?: string; japanese?: string }, index: number) => ({
                no: Number(word.no) || index + 1,
                english: word.english ?? "",
                japanese: word.japanese ?? "",
              }))
          : [];

        const detailedBook: WordBook = {
          ...existingBook,
          wordCount: typeof rawBook.wordCount === "number" ? rawBook.wordCount : nextWords.length,
          words: nextWords,
        };

        setBooks((prev) => prev.map((book) => (book.id === targetBookId ? { ...book, ...detailedBook } : book)));
        return detailedBook;
      } finally {
        setLoadingBookWordsId((current) => (current === targetBookId ? "" : current));
      }
    },
    [books, loadingBookWordsId]
  );

  useEffect(() => {
    if (!supabase) {
      setMessageTone("info");
      setMessage("Supabase環境変数が未設定です。ログイン機能は設定後に有効になります。");
      return;
    }

    const client = supabase;

    async function loadUser() {
      const { data } = await client.auth.getUser();
      setUser(data.user ?? null);
      if (data.user) {
        const cachedPlan = readCachedPlan(data.user.id);
        if (cachedPlan) setPlan(cachedPlan);
      }
    }

    loadUser();

    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        const cachedPlan = readCachedPlan(session.user.id);
        if (cachedPlan) setPlan(cachedPlan);
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const authStatus = params.get("auth");
    if (!authStatus) return;

    if (authStatus === "confirmed") {
      setMessageTone("success");
      setMessage("メール認証が完了しました。ログインして利用を始められます。");
    } else if (authStatus === "deleted") {
      setMessageTone("success");
      setMessage("アカウントを削除しました。同じメールアドレスで再登録できます。");
    } else if (authStatus === "error") {
      setMessageTone("error");
      setMessage("認証リンクの確認に失敗しました。もう一度メール内のリンクを開くか、再登録を試してください。");
    }

    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete("auth");
    window.history.replaceState({}, "", nextUrl.pathname + nextUrl.search + nextUrl.hash);
  }, []);

  useEffect(() => {
    fetch("/api/stripe/config-status")
      .then((response) => response.json())
      .then((result) => {
        setConfiguredPlans({
          personal: Boolean(result.personalConfigured),
          teacher: Boolean(result.teacherConfigured),
        });
      })
      .catch(() => {
        setConfiguredPlans({ personal: false, teacher: false });
      });
  }, []);

  useEffect(() => {
    async function loadOfficialWordbooks() {
      const response = await fetch("/api/wordbooks/official");
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(result.wordbooks) || result.wordbooks.length === 0) {
        return;
      }

      const officialBooks = result.wordbooks
        .filter((book: { id?: unknown; title?: unknown }) =>
          book?.id != null &&
          typeof book?.title === "string"
        )
        .map(
          (book: {
            id: string | number;
            title: string;
            description?: string;
            coverImage?: string | null;
            requiredPlan?: Plan;
            wordCount?: number;
            words?: Array<{ no?: number; english?: string; japanese?: string }>;
          }) => ({
            id: String(book.id),
            title: book.title,
            description: book.description,
            coverImage: book.coverImage ?? undefined,
            level:
              book.requiredPlan === "teacher"
                ? "Teacher"
                : book.requiredPlan === "personal"
                  ? "Personal"
                  : "Official",
            premium: book.requiredPlan === "personal" || book.requiredPlan === "teacher",
            requiredPlan: normalizePlan(book.requiredPlan),
            creator: "Vocab Print Pro",
            wordCount: typeof book.wordCount === "number" ? book.wordCount : book.words?.length ?? 0,
            words: (book.words ?? [])
              .filter((word) => word.english && word.japanese)
              .map((word, index) => ({
                no: Number(word.no) || index + 1,
                english: word.english ?? "",
                japanese: word.japanese ?? "",
              })),
          })
        );

      if (officialBooks.length === 0) {
        setBooks(sharedInitialBooks);
        setBookId(sharedInitialBooks[0].id);
        setBooksLoaded(true);
        return;
      }

      setBooks((prev) => {
        const customBooks = prev.filter((book) => book.id.startsWith("custom-") || book.id.startsWith("wb-"));
        return [...customBooks, ...officialBooks];
      });
      setBookId((prev) => {
        if (!prev || sharedInitialBooks.some((b) => b.id === prev)) return officialBooks[0].id;
        return prev;
      });
      setBooksLoaded(true);
    }

    loadOfficialWordbooks().catch(() => {
      setBooks(sharedInitialBooks);
      setBookId(sharedInitialBooks[0].id);
      setBooksLoaded(true);
    });
  }, []);

  useEffect(() => {
    async function loadMyWordbooks() {
      if (!supabase || !user) return;
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;

      const response = await fetch("/api/me/wordbooks", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(result.wordbooks)) return;

      const myBooks = result.wordbooks.map((book: any) => ({
        id: String(book.id),
        title: book.title ?? "マイ単語帳",
        description: book.description ?? "",
        coverImage: undefined,
        level: "自作",
        premium: false,
        requiredPlan: "free" as Plan,
        creator: user.email ?? "マイ単語帳",
        wordCount: typeof book.wordCount === "number" ? book.wordCount : (book.words ?? []).length,
        words: (book.words ?? []).map((word: any, index: number) => ({
          no: Number(word.no) || index + 1,
          english: word.english ?? "",
          japanese: word.japanese ?? "",
        })),
      }));

      setBooks((prev) => {
        const nonMine = prev.filter((book) => !(isUuid(book.id) || book.id.startsWith("wb-")));
        return [...myBooks, ...nonMine];
      });
    }

    loadMyWordbooks();
  }, [supabase, user]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const requestedBookId = new URLSearchParams(window.location.search).get("book");
    if (!requestedBookId) return;
    const existing = books.find((book) => book.id === requestedBookId);
    if (existing) {
      pickBook(requestedBookId);
    }
  }, [books]);

  useEffect(() => {
    setListeningIndex(0);
    setIsListening(false);
    setShowListeningAnswer(true);
    listeningRunRef.current.stopped = true;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (listeningTimerRef.current) {
      window.clearTimeout(listeningTimerRef.current);
      listeningTimerRef.current = null;
    }
  }, [bookId, startNo, endNo, count, random, direction]);

  useEffect(() => {
    if (!books.length) return;

    setOverlapBaseBookId((prev) => (prev && books.some((book) => book.id === prev) ? prev : books[0].id));
    setOverlapCompareBookId((prev) => {
      if (prev && books.some((book) => book.id === prev)) return prev;
      return books[1]?.id ?? books[0].id;
    });
  }, [books]);

  useEffect(() => {
    if (!supabase || !user) {
      setPlan("free");
      return;
    }

    const client = supabase;
    const currentUser = user;
    let cancelled = false;

    async function syncProfile() {
      const { data } = await client.auth.getSession();
      const token = data.session?.access_token;

      const params = new URLSearchParams(window.location.search);
      const checkout = params.get("checkout");
      const sessionId = params.get("session_id");

      if (checkout === "success" && sessionId) {
        const completeResponse = await fetch("/api/stripe/complete-checkout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ sessionId }),
        });
        const completeResult = await completeResponse.json().catch(() => ({}));

        if (completeResponse.ok && completeResult.profile?.plan) {
          const nextPlan = normalizePlan(completeResult.profile.plan);
          if (!cancelled) {
            setPlan(nextPlan);
            setRole(completeResult.profile.role === "admin" ? "admin" : "user");
            setMessage("決済を確認しました。プランを更新しました。");
          }
          window.history.replaceState(null, "", window.location.pathname);
          return;
        }

        if (!cancelled) {
          setMessage(completeResult.error ?? "決済確認中です。少し待ってから再読み込みしてください。");
        }
      }

      if (token) {
        const profileResponse = await fetch("/api/me/profile", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const profileResult = await profileResponse.json().catch(() => ({}));

        if (!cancelled && profileResponse.ok && profileResult.profile?.plan) {
          const nextPlan = normalizePlan(profileResult.profile.plan);
          setPlan(nextPlan);
          setRole(profileResult.profile.role === "admin" ? "admin" : "user");
          return;
        }
      }

      const { data: profile } = await client
        .from("profiles")
        .select("plan, role")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (!cancelled && profile?.plan) {
        const nextPlan = normalizePlan(profile.plan);
        setPlan(nextPlan);
        setRole(profile.role === "admin" ? "admin" : "user");
      }
    }

    syncProfile();

    return () => {
      cancelled = true;
    };
  }, [supabase, user]);

  // Handle import from wordbook detail page (?import=1)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("import") !== "1") return;
    try {
      const stored = sessionStorage.getItem("vpp-import-words");
      if (!stored) return;
      const { title, words: importedWords } = JSON.parse(stored) as { title?: string; words: Word[] };
      sessionStorage.removeItem("vpp-import-words");
      window.history.replaceState(null, "", window.location.pathname);
      if (!importedWords || importedWords.length === 0) return;
      const newBook: WordBook = {
        id: `wb-${Date.now()}`,
        title: title ?? "インポートした単語帳",
        level: "自作",
        premium: false,
        requiredPlan: "free",
        words: importedWords,
      };
      setBooks((prev) => [newBook, ...prev]);
      setBookId(newBook.id);
      setStartNo(1);
      setEndNo(importedWords.length);
      setCount(Math.min(importedWords.length, 50));
    } catch {
      // ignore parse errors
    }
  }, []);

  const featuredBooks = useMemo(() => books.slice(0, 6), [books]);
  const searchableBooks = useMemo(() => {
    const query = bookSearch.trim().toLowerCase();
    if (!query) return books;
    return books.filter((book) =>
      [book.title, book.description ?? "", book.level, book.creator ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [bookSearch, books]);
  const selectedBook = books.find((book) => book.id === bookId) ?? books[0] ?? null;
  const overlapBaseBook = books.find((book) => book.id === overlapBaseBookId) ?? null;
  const overlapCompareBook = books.find((book) => book.id === overlapCompareBookId) ?? null;
  const locked =
    selectedBook ? selectedBook.requiredPlan === "teacher" && plan !== "teacher" : false;

  useEffect(() => {
    if (!selectedBook) return;
    if (selectedBook.words.length > 0) return;
    if (getBookWordCount(selectedBook) === 0) return;
    if (loadingBookWordsId === selectedBook.id) return;
    void ensureBookWords(selectedBook.id);
  }, [ensureBookWords, loadingBookWordsId, selectedBook]);

  useEffect(() => {
    if (!overlapBaseBookId || !overlapCompareBookId) return;
    if (overlapBaseBookId === overlapCompareBookId) return;
    void loadOverlapBooks(overlapBaseBookId, overlapCompareBookId);
  }, [overlapBaseBookId, overlapCompareBookId]);

  const outputWords = useMemo(() => {
    if (!selectedBook) return [];
    const all = selectedBook.words;
    const total = all.length;
    if (total === 0) return [];
    // 「開始／終了」はリストの位置（何番目）。範囲外・古い値でもクランプして常に有効化。
    const start = Math.min(Math.max(1, Number(startNo) || 1), total);
    const end = Math.min(Math.max(start, Number(endNo) || total), total);
    let list = all.slice(start - 1, end);

    if (random) {
      list = [...list].sort(() => Math.random() - 0.5);
    }

    const n = Math.max(1, Math.min(Number(count) || list.length, list.length));
    return list.slice(0, n);
  }, [selectedBook, startNo, endNo, count, random]);

  const currentListeningWord = outputWords[listeningIndex] ?? null;
  const currentListeningMeaning = currentListeningWord
    ? formatMeaning(currentListeningWord.japanese, listeningMeaningMode)
    : "";

  useEffect(() => {
    if (outputWords.length === 0) {
      setListeningIndex(0);
      setIsListening(false);
      return;
    }
    setListeningIndex((current) => Math.min(current, outputWords.length - 1));
  }, [outputWords.length]);

  const overlapRows = useMemo(() => {
    return buildOverlapRows(overlapBaseBook, overlapCompareBook, overlapMode);
  }, [overlapBaseBook, overlapCompareBook, overlapMode]);

  function pickBook(nextBookId: string) {
    const nextBook = books.find((book) => book.id === nextBookId);
    if (!nextBook) return;

    setBookId(nextBookId);
    setStartNo(1);
    setEndNo(getBookWordCount(nextBook));
    setCount(Math.min(getBookWordCount(nextBook), 50));
    if (nextBook.words.length === 0) {
      void ensureBookWords(nextBookId);
    }

    if (typeof window !== "undefined") {
      document.getElementById("pdf-builder")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function loadPastedWordsIntoPreview() {
    const rows = parsePastedWords(pasteText);
    if (rows.length === 0) {
      alert("番号・英語・日本語の3列データを貼り付けてください。");
      return;
    }

    const previewBook: WordBook = {
      id: "pasted-preview",
      title: "貼り付け単語帳",
      level: "貼り付け",
      premium: false,
      requiredPlan: "free",
      description: "Excel / CSV / 貼り付けデータから作成した一時プレビューです。",
      words: rows,
      wordCount: rows.length,
    };

    setBooks((prev) => {
      const filtered = prev.filter((book) => book.id !== "pasted-preview");
      return [previewBook, ...filtered];
    });
    setBookId(previewBook.id);
    setStartNo(1);
    setEndNo(rows.length);
    setCount(Math.min(rows.length, 50));
    setListeningIndex(0);
    setStudyPanelMode("listening");
    setPdfMessage("貼り付けデータを単語一覧・聞き流しプレビューに反映しました。");

    if (typeof window !== "undefined") {
      document.getElementById("pdf-preview-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  async function loadOverlapBooks(baseId: string, compareId: string) {
    const targets = [baseId, compareId].filter(Boolean);
    return Promise.all(targets.map((targetId) => ensureBookWords(targetId)));
  }

  async function handleAuth() {
    setMessage("");
    setMessageTone("info");

    if (!supabase) {
      setMessageTone("error");
      setMessage("SupabaseのURLとAnon KeyをVercelの環境変数に設定してください。");
      return;
    }

    if (!email || !password) {
      setMessageTone("error");
      setMessage("メールアドレスとパスワードを入力してください。");
      return;
    }

    if (authMode === "signup" && password.length < 6) {
      setMessageTone("error");
      setMessage("パスワードは6文字以上で入力してください。");
      return;
    }

    if (authMode === "signup") {
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://www.vocabprint.com";
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${appUrl}/auth/confirm?next=/`,
        },
      });

      if (error) {
        setMessageTone("error");
        setMessage(normalizeAuthErrorMessage(error.message));
        return;
      }

      if (data.user) {
        await supabase.from("profiles").upsert({
          id: data.user.id,
          email,
          plan: "free",
        });
        setRole("user");
      }

      setMessageTone("success");
      setMessage("確認メールを送信しました。メール内のリンクを開くと Vocab Print Pro に戻って認証が完了します。");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setMessageTone("error");
      setMessage(normalizeAuthErrorMessage(error.message));
      return;
    }

    setMessageTone("success");
    setMessage("ログインしました。");
  }

  async function logout() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setRole("user");
    setMessageTone("info");
    setMessage("ログアウトしました。");
  }

  async function addCustomBook() {
    if (!user) {
      alert("マイ単語帳の保存にはログインが必要です。");
      return;
    }
    if (plan === "free") {
      alert("マイ単語帳の保存はPersonal以上のプランでご利用いただけます。Freeプランでは貼り付けてそのまま印刷できます。");
      return;
    }

    const rows = parsePastedWords(pasteText);

    if (rows.length === 0) {
      alert("番号・英語・日本語の3列データを貼り付けてください。");
      return;
    }

    if (!supabase) {
      alert("Supabase の設定が必要です。");
      return;
    }

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      alert("ログイン状態を確認できませんでした。");
      return;
    }

    const response = await fetch("/api/me/wordbooks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: "マイ単語帳",
        words: rows,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.wordbook) {
      alert(result.error ?? "マイ単語帳の保存に失敗しました。");
      return;
    }

    const savedBook: WordBook = {
      id: String(result.wordbook.id),
      title: result.wordbook.title ?? "マイ単語帳",
      description: result.wordbook.description ?? "",
      level: "自作",
      premium: false,
      requiredPlan: "free",
      wordCount: typeof result.wordbook.wordCount === "number" ? result.wordbook.wordCount : rows.length,
      words: (result.wordbook.words ?? rows).map((word: any, index: number) => ({
        no: Number(word.no) || index + 1,
        english: word.english ?? "",
        japanese: word.japanese ?? "",
      })),
    };

    setBooks((prev) => [savedBook, ...prev.filter((book) => book.id !== savedBook.id)]);
    setBookId(savedBook.id);
    setPdfMessage("マイ単語帳として保存しました。");
  }

  function makeQuestion(word: Word) {
    if (direction === "ja-en" || direction === "spelling") {
      return { question: word.japanese, answer: word.english };
    }
    return { question: word.english, answer: word.japanese };
  }

  async function printWords(words: Word[], sourceTitle: string, sourceLabel: string) {
    const activePlan = user ? plan : "free";
    const usageUserId = user?.id ?? "guest";
    const token = supabase && user ? (await supabase.auth.getSession()).data.session?.access_token : undefined;
    let usageCheckedByServer = false;
    const limitedWordCount = activePlan === "free" ? Math.min(words.length, 50) : words.length;
    const pageCount = getPageCount(limitedWordCount);

    if (token && user) {
      const usageResponse = await fetch("/api/usage/check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ wordCount: limitedWordCount, pageCount }),
      });
      const usageResult = await usageResponse.json().catch(() => ({}));

      if (usageResponse.ok && usageResult.ok) {
        usageCheckedByServer = true;
        if (usageResult.plan) {
          const serverPlan = normalizePlan(usageResult.plan);
          setPlan(serverPlan);
          writeCachedPlan(user.id, serverPlan);
        }
      } else if (usageResponse.status !== 401) {
        const fallback = checkLocalUsage(usageUserId, activePlan, limitedWordCount, pageCount);
        if (!fallback.ok) {
          alert(usageResult.message ?? fallback.message);
          return;
        }
      }
    }

    if (!usageCheckedByServer) {
      const fallback = checkLocalUsage(usageUserId, activePlan, limitedWordCount, pageCount);
      if (!fallback.ok) {
        alert(`${fallback.message}\n\nもっと作成したい場合は、Personalプランの7日無料トライアルをご利用ください。`);
        return;
      }
    }

    const now = new Date();
    const autoTitle = `${sourceTitle} ${type === "list" ? "一覧" : type === "test" ? "問題" : "解答"}`;
    const printWordsList = activePlan === "free" ? words.slice(0, 50) : words;
    const fullTitle = pdfTitle.trim() || autoTitle;
    const html = buildPrintHtml({
      title: fullTitle,
      words: printWordsList,
      type,
      showPageNo,
      makeQuestion,
      plan: activePlan,
      printStyle,
      includeWatermark,
      showRecordFields,
      showClassField,
      showNumberField,
      showNameField,
      studentClass,
      studentNumber,
      studentName,
      includeDate,
      generatedAt: now,
      userEmail: user?.email ?? "",
      titleOffsetX: titleOffset.x,
      titleOffsetY: titleOffset.y,
      dateOffsetX: dateOffset.x,
      dateOffsetY: dateOffset.y,
      infoOffsetX: infoOffset.x,
      infoOffsetY: infoOffset.y,
      gridOffsetX: gridOffset.x,
      gridOffsetY: gridOffset.y,
      pageNoOffsetX: pageNoOffset.x,
      pageNoOffsetY: pageNoOffset.y,
    });

    const safeTitle = fullTitle.replace(/[<>"&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", '"': "&quot;", "&": "&amp;" }[c] ?? c));
    // コピー防止: テキスト選択・右クリック・コピー/切り取り・ドラッグを抑止（画面表示時）
    const copyGuardStyle = `<style>#print-root,#print-root *{ -webkit-user-select:none!important; -moz-user-select:none!important; -ms-user-select:none!important; user-select:none!important; -webkit-touch-callout:none!important; }</style>`;
    const copyGuardScript = `<script>(function(){var b=["contextmenu","copy","cut","selectstart","dragstart"];b.forEach(function(e){document.addEventListener(e,function(ev){ev.preventDefault();return false;});});document.addEventListener("keydown",function(e){if((e.ctrlKey||e.metaKey)&&["c","x","a","u"].indexOf((e.key||"").toLowerCase())>-1){e.preventDefault();return false;}});})();<\/script>`;
    const fullDoc = `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>${safeTitle}</title>${copyGuardStyle}</head><body style="margin:0">${copyGuardScript}<div id="print-root">${html}</div></body></html>`;
    const printPageHtml = `${copyGuardStyle}${copyGuardScript}<div id="print-root">${html}</div>`;
    const usePrintPage =
      typeof window !== "undefined" &&
      (window.matchMedia("(max-width: 767px)").matches ||
        /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent));

    if (usePrintPage) {
      window.sessionStorage.setItem(
        "vpp-print-job",
        JSON.stringify({
          html: printPageHtml,
          title: fullTitle,
          sourceLabel,
          createdAt: now.toISOString(),
        }),
      );
      setPdfMessage("印刷用ページを開きます。表示後に印刷ダイアログを開けます。");
    } else {
      // 隠しiframeで印刷ダイアログを直接開く（新しいタブを開かない）
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
      } else {
        iframe.remove();
      }

      setPdfMessage("印刷ダイアログが開きます。");
    }

    setHistory([
      `${formatPrintDate(now)}・${sourceLabel} / ${type} / ${printWordsList.length}語`,
      ...history,
    ]);

    recordLocalUsage(usageUserId, activePlan);
    if (user) await savePdfHistory();

    if (usePrintPage) {
      window.location.href = "/print";
    }
  }

  async function printPdf() {
    if (!selectedBook) {
      alert("単語帳が読み込まれていません。少し待ってからもう一度お試しください。");
      return;
    }
    if (selectedBook.words.length === 0 && getBookWordCount(selectedBook) > 0) {
      await ensureBookWords(selectedBook.id);
      alert("単語帳を読み込み中です。数秒待ってからもう一度お試しください。");
      return;
    }
    if (locked) {
      alert("この単語帳はTeacherプラン用です。Teacherに変更してください。");
      return;
    }
    await printWords(outputWords, selectedBook.title, selectedBook.title);
  }

  async function printPastedPdf() {
    const words = parsePastedWords(pasteText);
    if (words.length === 0) {
      alert("番号・英語・日本語の3列データを貼り付けてください。");
      return;
    }
    await printWords(words, "貼り付け単語帳", "Excel/CSV貼り付け");
  }

  async function printOverlapWords() {
    if (!overlapBaseBook || !overlapCompareBook) {
      alert("比較する単語帳を2冊選んでください。");
      return;
    }
    if (overlapBaseBook.id === overlapCompareBook.id) {
      alert("別々の単語帳を選んでください。");
      return;
    }

    const [loadedBaseBook, loadedCompareBook] = await loadOverlapBooks(
      overlapBaseBook.id,
      overlapCompareBook.id
    );

    const baseBook = loadedBaseBook ?? overlapBaseBook;
    const compareBook = loadedCompareBook ?? overlapCompareBook;
    if (baseBook.words.length === 0 || compareBook.words.length === 0) {
      alert("単語帳を読み込み中です。数秒待ってからもう一度お試しください。");
      return;
    }
    const rows = buildOverlapRows(baseBook, compareBook, overlapMode);
    if (rows.length === 0) {
      alert("この条件に合う単語はありません。");
      return;
    }

    const printableWords: Word[] = rows.map((row, index) => ({
      no: index + 1,
      english:
        overlapMode === "all"
          ? `[${row.source}] ${row.english}`
          : row.english,
      japanese: `A:${row.baseNo ?? "-"} / B:${row.compareNo ?? "-"}  ${row.japanese}`,
    }));

    await printWords(
      printableWords,
      `${baseBook.title} × ${compareBook.title} かぶり調査`,
      "かぶり調査"
    );
  }

  async function speakListeningWord(word: Word, signal = listeningRunRef.current) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const meaning = formatMeaning(word.japanese, listeningMeaningMode);
    const japanesePair = isJapaneseOnlyText(word.english);
    const speakEnglish = () =>
      speakText(word.english, {
        preferred: japanesePair ? "japanese" : "english",
        rate: rateValue(listeningSpeed, japanesePair ? 0.95 : 0.9),
        voiceHint: japanesePair ? "male" : undefined,
        signal,
      });
    const speakJapanese = () =>
      speakText(meaning, {
        preferred: "japanese",
        rate: rateValue(listeningSpeed, 0.95),
        voiceHint: japanesePair ? "female" : undefined,
        signal,
      });

    if (listeningVoiceMode === "ja-en") {
      await speakJapanese();
      for (let i = 0; i < Math.max(1, listeningRepeat); i += 1) {
        await speakEnglish();
      }
      return;
    }

    for (let i = 0; i < Math.max(1, listeningRepeat); i += 1) {
      await speakEnglish();
    }

    if (listeningVoiceMode === "en-ja") {
      await speakJapanese();
    }
  }

  function stopListening() {
    setIsListening(false);
    setShowListeningAnswer(true);
    listeningRunRef.current.stopped = true;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (listeningTimerRef.current) {
      window.clearTimeout(listeningTimerRef.current);
      listeningTimerRef.current = null;
    }
  }

  function playCurrentListeningWord() {
    if (!currentListeningWord) return;
    const run = { stopped: false, id: listeningRunRef.current.id + 1 };
    listeningRunRef.current = run;
    void speakListeningWord(currentListeningWord, run);
  }

  async function playListeningSequence(startIndex = listeningIndex) {
    if (!outputWords.length) return;
    const run = { stopped: false, id: listeningRunRef.current.id + 1 };
    listeningRunRef.current = run;
    setIsListening(true);

    if (listeningTimerRef.current) {
      window.clearTimeout(listeningTimerRef.current);
    }

    for (let index = startIndex; index < outputWords.length; index += 1) {
      if (run.stopped || listeningRunRef.current.id !== run.id) return;
      const nextWord = outputWords[index];
      setListeningIndex(index);

      if (listeningStudyMode === "test") {
        setShowListeningAnswer(false);
        const japanesePair = isJapaneseOnlyText(nextWord.english);
        await speakText(nextWord.english, {
          preferred: japanesePair ? "japanese" : "english",
          rate: rateValue(listeningSpeed, japanesePair ? 0.95 : 0.9),
          voiceHint: japanesePair ? "male" : undefined,
          signal: run,
        });
        await new Promise((resolve) => {
          listeningTimerRef.current = window.setTimeout(resolve, Math.max(700, listeningGapMs));
        });
        if (run.stopped || listeningRunRef.current.id !== run.id) return;
        setShowListeningAnswer(true);
        await speakText(nextWord.english, {
          preferred: japanesePair ? "japanese" : "english",
          rate: rateValue(listeningSpeed, japanesePair ? 0.95 : 0.9),
          voiceHint: japanesePair ? "male" : undefined,
          signal: run,
        });
        await speakText(formatMeaning(nextWord.japanese, listeningMeaningMode), {
          preferred: "japanese",
          rate: rateValue(listeningSpeed, 0.95),
          voiceHint: japanesePair ? "female" : undefined,
          signal: run,
        });
      } else {
        setShowListeningAnswer(true);
        await speakListeningWord(nextWord, run);
      }

      if (index < outputWords.length - 1) {
        await new Promise((resolve) => {
          listeningTimerRef.current = window.setTimeout(resolve, Math.max(300, listeningGapMs));
        });
      }
    }

    if (!run.stopped && listeningRunRef.current.id === run.id) stopListening();
  }

  useEffect(() => {
    return () => {
      listeningRunRef.current.stopped = true;
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      if (listeningTimerRef.current) {
        window.clearTimeout(listeningTimerRef.current);
      }
    };
  }, []);

  // CSV / TSV / TXT / Excel(.xlsx) ファイルを読み込み、貼り付け欄へ展開する。
  async function handleWordFile(file: File) {
    const name = file.name.toLowerCase();
    try {
      if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        const buffer = await file.arrayBuffer();
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, blankrows: false });
        setPasteText(
          rows
            .filter((row) => Array.isArray(row) && row.length >= 2)
            .map((row) => [row[0] ?? "", row[1] ?? "", row[2] ?? "", row[3] ?? ""].join("\t"))
            .join("\n"),
        );
      } else if (name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt")) {
        setPasteText(await file.text());
      } else {
        alert("対応形式は CSV / TSV / TXT / Excel(.xlsx) です。");
      }
    } catch {
      alert("ファイルを読み込めませんでした。形式をご確認ください。");
    }
  }

  function buildPreviewDoc(): string {
    if (!outputWords.length) return `<!DOCTYPE html><html><body style="margin:0;background:#f9fafb;font-family:sans-serif;padding:20px;color:#64748b">プレビューデータなし</body></html>`;
    const now = new Date();
    const autoTitle = `${selectedBook?.title ?? "単語帳"} ${type === "list" ? "一覧" : type === "test" ? "問題" : "解答"}`;
    const printWordsList = plan === "free" ? outputWords.slice(0, 50) : outputWords;
    const bodyHtml = buildPrintHtml({
      title: pdfTitle.trim() || autoTitle,
      words: printWordsList,
      type,
      showPageNo,
      makeQuestion,
      plan,
      printStyle,
      includeWatermark,
      showRecordFields,
      showClassField,
      showNumberField,
      showNameField,
      studentClass,
      studentNumber,
      studentName,
      includeDate,
      generatedAt: now,
      userEmail: user?.email ?? "",
      titleOffsetX: titleOffset.x,
      titleOffsetY: titleOffset.y,
      dateOffsetX: dateOffset.x,
      dateOffsetY: dateOffset.y,
      infoOffsetX: infoOffset.x,
      infoOffsetY: infoOffset.y,
      gridOffsetX: gridOffset.x,
      gridOffsetY: gridOffset.y,
      pageNoOffsetX: pageNoOffset.x,
      pageNoOffsetY: pageNoOffset.y,
    });
    const previewBody = bodyHtml.replace(/^<style>[\s\S]*?<\/style>/, `<style>${previewCss}</style>`);
    return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"></head><body style="margin:0">${previewBody}</body></html>`;
  }

  useEffect(() => {
    if (!showPreview || !previewIframeRef.current) return;
    const doc = previewIframeRef.current.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(buildPreviewDoc());
    doc.close();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPreview, titleOffset, dateOffset, infoOffset, gridOffset, pageNoOffset, outputWords, type, pdfTitle, printStyle, includeWatermark, showRecordFields, showClassField, showNumberField, showNameField, studentClass, studentNumber, studentName, includeDate]);

  useEffect(() => {
    if (!dragging) return;
    const ppMM = PREVIEW_SCALE * 3.78;
    // 中心(0)に近づいたらスナップ
    const sx = (v: number) => (Math.abs(v) <= 3 ? 0 : v);
    const sy = (v: number) => (Math.abs(v) <= 2 ? 0 : v);
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const onMove = (e: MouseEvent) => {
      const dx = (e.clientX - dragStart.cx) / ppMM;
      const dy = (e.clientY - dragStart.cy) / ppMM;
      if (dragging === "title") {
        setTitleOffset({ x: sx(clamp(dragStart.ox + dx, -80, 80)), y: sy(clamp(dragStart.oy + dy, -5, 15)) });
      } else if (dragging === "date") {
        setDateOffset({ x: sx(clamp(dragStart.ox + dx, -80, 80)), y: sy(clamp(dragStart.oy + dy, -5, 20)) });
      } else if (dragging === "info") {
        setInfoOffset({ x: sx(clamp(dragStart.ox + dx, -80, 80)), y: sy(clamp(dragStart.oy + dy, -10, 10)) });
      } else if (dragging === "grid") {
        setGridOffset({ x: sx(clamp(dragStart.ox + dx, -80, 80)), y: sy(clamp(dragStart.oy + dy, -30, 30)) });
      } else if (dragging === "pageNo") {
        setPageNoOffset({ x: sx(clamp(dragStart.ox + dx, -80, 80)), y: sy(clamp(dragStart.oy + dy, -20, 20)) });
      }
    };
    const onUp = () => setDragging(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, dragStart]);

  async function savePdfHistory() {
    if (!supabase || !user) return;

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;

      await fetch("/api/usage/record", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type,
          wordCount: outputWords.length,
          wordbookId: selectedBook && isUuid(selectedBook.id) ? selectedBook.id : null,
        }),
      });
    } catch (error) {
      console.error("Failed to save PDF history", error);
    }
  }

  async function startCheckout(targetPlan: Exclude<Plan, "free">) {
    if (plan === targetPlan) {
      alert("現在利用中のプランです。");
      return;
    }
    if (!configuredPlans[targetPlan]) {
      alert(`${targetPlan === "teacher" ? "Teacher" : "Personal"}プランのStripe設定が未完了です。`);
      return;
    }

    if (!user) {
      alert("先にログインしてください。");
      return;
    }

    if (!supabase) {
      alert("Supabaseの設定が必要です。");
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      alert("ログインセッションを確認できません。もう一度ログインしてください。");
      return;
    }

    const res = await fetch("/api/stripe/create-checkout-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ plan: targetPlan }),
    });

    const result = await res.json();
    if (result.url) {
      window.location.href = result.url;
      return;
    }

    alert(result.message ?? result.error ?? "決済ページを作成できませんでした。");
  }

  async function openBillingPortal() {
    if (!user) {
      alert("先にログインしてください。");
      return;
    }

    if (!supabase) {
      alert("Supabaseの設定が必要です。");
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      alert("ログインセッションを確認できません。もう一度ログインしてください。");
      return;
    }

    const res = await fetch("/api/stripe/create-portal-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    const result = await res.json().catch(() => ({}));
    if (result.url) {
      window.location.href = result.url;
      return;
    }

    alert(result.message ?? result.error ?? "請求管理ページを開けませんでした。");
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <style>{printCss}</style>
      <div id="print-root" className="hidden print:block" />

      <section className="mx-auto max-w-6xl px-3 py-5 sm:px-5 sm:py-8">
        <div className="rounded-3xl bg-gradient-to-br from-blue-600 to-slate-900 p-5 sm:p-8 text-white">
          <h2 className="text-2xl sm:text-4xl font-black leading-tight">
            単語帳を選ぶだけで、
            <br />
            小テストPDFを自動生成。
          </h2>
          <p className="mt-3 sm:mt-4 max-w-2xl text-sm leading-7 text-blue-50">
            単語データを貼り付けて、一覧・問題・解答の3種類のA4 PDFを即作成。英検・受験・資格試験対応。
          </p>
        </div>

        <section className="mt-5 rounded-3xl border bg-white p-4 shadow-sm sm:mt-6 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-blue-700">みんなの単語帳</p>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900">使いたい単語帳をすぐに選んで印刷</h3>
              <p className="mt-1 text-sm text-slate-500">
                スマホでは教材アプリのように小さく探して、単語帳ページから印刷・聞き流しを選べます。
              </p>
            </div>
            <Link href="/wordbooks" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">
              みんなの単語帳を見る
            </Link>
          </div>

          <div className="mt-4 grid gap-2 sm:mt-5 sm:gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {featuredBooks.map((book, index) => (
              <div
                key={book.id}
                onClick={() => {
                  window.location.href = buildWordbookPath(book.id, book.title);
                }}
                className={`flex min-h-[92px] cursor-pointer overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition sm:block sm:min-h-0 sm:rounded-3xl sm:hover:-translate-y-0.5 sm:hover:shadow-md ${
                  book.id === bookId ? "border-blue-500 ring-2 ring-blue-200" : "border-slate-200"
                }`}
              >
                <div className="relative h-auto w-20 flex-shrink-0 bg-slate-100 sm:h-40 sm:w-full">
                  <img
                    src={getBookCover(book, index)}
                    alt={book.title}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 hidden bg-gradient-to-t from-slate-950/80 to-transparent p-4 sm:block">
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-full bg-white/90 px-2.5 py-1 text-xs font-bold text-slate-800">
                        {planLabel(book.requiredPlan)}
                      </span>
                      <span className="rounded-full bg-blue-500/90 px-2.5 py-1 text-xs font-bold text-white">
                        {getBookWordCount(book)} words
                      </span>
                    </div>
                  </div>
                </div>
                <div className="min-w-0 flex-1 p-2.5 sm:p-4">
                  <div className="flex items-start justify-between gap-2 sm:block">
                    <h4 className="line-clamp-2 text-sm font-black leading-snug text-slate-900 sm:text-lg">{book.title}</h4>
                    <span className="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-[11px] font-black text-blue-700 sm:hidden">
                      {planLabel(book.requiredPlan)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <p className="text-xs font-bold text-blue-700 sm:text-sm">{book.level}</p>
                    <span className="text-[11px] font-bold text-slate-400 sm:hidden">{getBookWordCount(book)}語</span>
                  </div>
                  <p className="mt-1 truncate text-xs font-bold text-slate-400">
                    作成者: {book.creator ?? "Vocab Print Pro"}
                  </p>
                  <p className="mt-1 hidden line-clamp-2 text-xs leading-5 text-slate-500 sm:mt-2 sm:block sm:min-h-12 sm:text-sm sm:leading-6">
                    {book.description ?? "印刷用の見やすい教材として、すぐ使える単語帳です。"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        pickBook(book.id);
                      }}
                      className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-black text-white hover:bg-blue-700 sm:px-3 sm:py-2"
                    >
                      選択
                    </button>
                    <Link
                      href={buildWordbookPath(book.id, book.title)}
                      onClick={(event) => event.stopPropagation()}
                      className="rounded-lg border px-2.5 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50 sm:px-3 sm:py-2"
                    >
                      詳細
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {!user && (
          <section id="auth" className="mt-6 scroll-mt-24 rounded-3xl border bg-white p-5 shadow-sm">
            <h3 className="text-lg font-black">ログイン / 会員登録</h3>
            <p className="mt-1 text-sm text-slate-500">
              ログインすると作成履歴の保存や、有料プランの利用ができます。
            </p>
            <p className="mt-2 text-xs text-slate-400">
              新規登録後は確認メールが届きます。メール内のリンクを開くと、このサイトに戻って認証が完了します。
            </p>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setAuthMode("login")}
                className={`rounded-xl px-4 py-2 text-sm font-bold ${
                  authMode === "login" ? "bg-blue-600 text-white" : "bg-slate-100"
                }`}
              >
                ログイン
              </button>
              <button
                onClick={() => setAuthMode("signup")}
                className={`rounded-xl px-4 py-2 text-sm font-bold ${
                  authMode === "signup" ? "bg-blue-600 text-white" : "bg-slate-100"
                }`}
              >
                新規登録
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="メールアドレス"
                className="rounded-xl border px-3 py-2"
                disabled={!supabase}
              />
              <div className="flex gap-2">
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={authMode === "signup" ? "パスワード（6文字以上）" : "パスワード"}
                  type={showAuthPassword ? "text" : "password"}
                  className="flex-1 rounded-xl border px-3 py-2"
                  disabled={!supabase}
                />
                <button
                  type="button"
                  onClick={() => setShowAuthPassword((value) => !value)}
                  className="rounded-xl border px-3 py-2 text-slate-700 hover:bg-slate-50"
                  disabled={!supabase}
                  aria-label={showAuthPassword ? "パスワードを隠す" : "パスワードを表示"}
                >
                  {showAuthPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <button
              onClick={handleAuth}
              className="mt-4 rounded-2xl bg-blue-600 px-5 py-3 font-black text-white hover:bg-blue-700 disabled:bg-slate-300"
              disabled={!supabase}
            >
              {authMode === "login" ? "ログインする" : "新規登録する"}
            </button>

            {message && (
              <p
                className={`mt-3 rounded-xl p-3 text-sm font-bold ${
                  messageTone === "error"
                    ? "bg-red-50 text-red-700"
                    : messageTone === "success"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-50 text-slate-700"
                }`}
              >
                {message}
              </p>
            )}
          </section>
        )}

        {user && (
          <div className="mt-6 space-y-3">
            <p className="rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
              ログイン中：{user.email}
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/wordbooks" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">
                みんなの単語帳
              </Link>
              <Link href="/my-wordbooks" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">
                マイ単語帳
              </Link>
              <Link href="/listening" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">
                聞き流し
              </Link>
              <Link href="/pricing" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">
                料金プラン
              </Link>
              {role === "admin" && (
                <Link href="/admin" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">
                  管理者画面
                </Link>
              )}
            </div>
            {message && (
              <p
                className={`rounded-2xl p-4 text-sm font-bold ${
                  messageTone === "error"
                    ? "bg-red-50 text-red-700"
                    : messageTone === "success"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-700"
                }`}
              >
                {message}
              </p>
            )}
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[400px_1fr]">
          <section id="pdf-builder" className="rounded-3xl border bg-white p-5 shadow-sm">
            <h3 className="text-lg font-black">単語テストを作成</h3>

            <label className="mt-4 block text-sm font-bold">印刷タイトル（任意）</label>
            <input
              value={pdfTitle}
              onChange={(e) => setPdfTitle(e.target.value)}
              placeholder="空欄の場合は自動生成"
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
            />

            <label className="mt-4 block text-sm font-bold">単語帳</label>
            <input
              value={bookSearch}
              onChange={(event) => setBookSearch(event.target.value)}
              placeholder="単語帳名・説明・作成者で検索"
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
            />
            {!booksLoaded ? (
              <div className="mt-1 w-full rounded-xl border px-3 py-3 text-base text-slate-400">読み込み中...</div>
            ) : (
              <div className="mt-1 max-h-64 space-y-2 overflow-auto rounded-2xl border bg-slate-50 p-2">
                {(searchableBooks.some((book) => book.id === bookId)
                  ? searchableBooks
                  : selectedBook
                    ? [selectedBook, ...searchableBooks]
                    : searchableBooks
                ).map((book, index) => (
                  <button
                    key={book.id}
                    type="button"
                    onClick={() => pickBook(book.id)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-2 py-2 text-left transition ${
                      book.id === bookId ? "border-blue-400 bg-blue-50" : "border-transparent bg-white hover:bg-slate-50"
                    }`}
                  >
                    <img src={getBookCover(book, index)} alt="" className="h-10 w-10 flex-none rounded-lg object-cover" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black text-slate-800">
                        {book.title} {book.requiredPlan === "teacher" ? "（Teacher）" : book.requiredPlan === "personal" ? "（Pro）" : ""}
                      </span>
                      <span className="block truncate text-xs font-bold text-slate-400">{book.creator ?? "Vocab Print Pro"}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {bookSearch && (
              <p className="mt-1 text-xs font-bold text-slate-400">{searchableBooks.length}件見つかりました</p>
            )}

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <NumberInput label="開始" value={startNo} onChange={setStartNo} />
              <NumberInput label="終了" value={endNo} onChange={setEndNo} />
              <NumberInput label="問題数" value={count} onChange={setCount} />
            </div>

            <label className="mt-4 block text-sm font-bold">出力形式</label>
            <select
              value={type}
              onChange={(event) => setType(event.target.value as PdfType)}
              className="mt-1 w-full rounded-xl border px-3 py-2"
            >
              <option value="list">一覧PDF</option>
              <option value="test">問題PDF</option>
              <option value="answer">解答PDF</option>
            </select>

            <label className="mt-4 block text-sm font-bold">出題方向</label>
            <select
              value={direction}
              onChange={(event) => setDirection(event.target.value as Direction)}
              className="mt-1 w-full rounded-xl border px-3 py-2"
            >
              <option value="en-ja">英語 → 日本語</option>
              <option value="ja-en">日本語 → 英語</option>
              <option value="spelling">スペルテスト</option>
            </select>

            <label className="mt-4 flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={random} onChange={(event) => setRandom(event.target.checked)} />
              ランダム順
            </label>

            <label className="mt-2 flex items-center gap-2 text-sm font-bold">
              <input
                type="checkbox"
                checked={showPageNo}
                onChange={(event) => setShowPageNo(event.target.checked)}
              />
              ページ番号を表示
            </label>

            <details className="mt-4 rounded-2xl border bg-slate-50 p-4">
              <summary className="cursor-pointer list-none text-sm font-black text-slate-700">
                詳細設定
              </summary>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-bold">文字の見せ方</label>
                  <select
                    value={printStyle}
                    onChange={(event) => setPrintStyle(event.target.value as PrintStyle)}
                    className="mt-1 w-full rounded-xl border px-3 py-2"
                  >
                    <option value="standard">標準</option>
                    <option value="blank-english">英語を空欄にする</option>
                    <option value="blank-japanese">日本語を空欄にする</option>
                    <option value="red-english">英語を赤字にする</option>
                    <option value="red-japanese">日本語を赤字にする</option>
                  </select>
                </div>

                <label className="flex items-center gap-2 text-sm font-bold">
                  <input
                    type="checkbox"
                    checked={plan === "free" ? true : includeWatermark}
                    disabled={plan === "free"}
                    onChange={(event) => setIncludeWatermark(event.target.checked)}
                  />
                  透かしを入れる
                </label>
                {plan === "free" && (
                  <p className="text-xs text-slate-500">
                    Free版では透かしは固定です。
                  </p>
                )}

                <div>
                  <label className="block text-sm font-bold">記入欄を表示</label>
                  <label className="mt-2 flex items-center gap-2 font-bold">
                    <input
                      type="checkbox"
                      checked={showRecordFields}
                      onChange={(event) => setShowRecordFields(event.target.checked)}
                    />
                    記入欄を出す
                  </label>
                  <div className="mt-2 grid gap-2 rounded-xl border bg-white p-3 text-sm">
                    <label className="flex items-center gap-2 font-bold">
                      <input
                        type="checkbox"
                        checked={showClassField}
                        disabled={!showRecordFields}
                        onChange={(event) => setShowClassField(event.target.checked)}
                      />
                      クラス
                    </label>
                    <label className="flex items-center gap-2 font-bold">
                      <input
                        type="checkbox"
                        checked={showNumberField}
                        disabled={!showRecordFields}
                        onChange={(event) => setShowNumberField(event.target.checked)}
                      />
                      番号
                    </label>
                    <label className="flex items-center gap-2 font-bold">
                      <input
                        type="checkbox"
                        checked={showNameField}
                        disabled={!showRecordFields}
                        onChange={(event) => setShowNameField(event.target.checked)}
                      />
                      氏名
                    </label>
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-3">
                  <div>
                  <label className="block text-sm font-bold">クラスの値</label>
                  <input
                    value={studentClass}
                    onChange={(event) => setStudentClass(event.target.value)}
                    placeholder="例: 2年A組"
                    disabled={!showRecordFields || !showClassField}
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold">番号の値</label>
                  <input
                    value={studentNumber}
                    onChange={(event) => setStudentNumber(event.target.value)}
                    placeholder="例: 12"
                    disabled={!showRecordFields || !showNumberField}
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold">氏名の値</label>
                  <input
                    value={studentName}
                    onChange={(event) => setStudentName(event.target.value)}
                    placeholder="例: 山田 太郎"
                    disabled={!showRecordFields || !showNameField}
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                  />
                </div>
                </div>

                <label className="flex items-center gap-2 text-sm font-bold">
                  <input
                    type="checkbox"
                    checked={includeDate}
                    onChange={(event) => setIncludeDate(event.target.checked)}
                  />
                  日付を入れる
                </label>

                <div>
                  <label className="block text-sm font-bold">印刷の下部イメージ</label>
                  <p className="mt-1 text-xs text-slate-500">
                    クラス・番号・氏名を必要なものだけ選べます。学校のテスト用プリントに近い見た目にします。
                  </p>
                </div>
              </div>
            </details>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={printPdf}
                className="flex-1 rounded-2xl bg-blue-600 px-4 py-4 sm:py-3 text-base sm:text-sm font-black text-white hover:bg-blue-700 active:bg-blue-800"
              >
                単語テストを印刷
              </button>
              <button
                type="button"
                onClick={() => setShowPreview(true)}
                className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 sm:py-3 font-black text-blue-700 hover:bg-blue-100 active:bg-blue-200"
                title="印刷レイアウトをプレビュー・調整"
              >
                プレビュー
              </button>
            </div>
            {pdfMessage && <p className="mt-3 rounded-xl bg-blue-50 p-3 text-xs font-bold text-blue-700">{pdfMessage}</p>}

            {locked && (
              <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
                この単語帳はTeacher用です。Teacherにすると使えます。
              </p>
            )}
          </section>

          <section
            id="pdf-preview-panel"
            className="rounded-3xl border bg-white p-5 shadow-sm"
            onCopy={(event) => event.preventDefault()}
          >
            <details open className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between">
              <div>
                <h3 className="text-lg font-black">単語一覧 / 聞き流し</h3>
                <p className="text-sm text-slate-500">
                  {selectedBook?.title ?? "単語帳"} / {outputWords.length}語
                  {selectedBook && loadingBookWordsId === selectedBook.id ? " ・ 読み込み中..." : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                  {selectedBook?.level ?? ""}
                </span>
                <span className="text-slate-400 group-open:rotate-180 transition-transform text-xs">▼</span>
              </div>
            </summary>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setStudyPanelMode("list")}
                className={`rounded-full px-4 py-2 text-sm font-bold ${studyPanelMode === "list" ? "bg-blue-600 text-white" : "border bg-white text-slate-700"}`}
              >
                単語一覧
              </button>
              <button
                type="button"
                onClick={() => setStudyPanelMode("listening")}
                className={`rounded-full px-4 py-2 text-sm font-bold ${studyPanelMode === "listening" ? "bg-blue-600 text-white" : "border bg-white text-slate-700"}`}
              >
                聞き流し
              </button>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              上で選んだ単語帳、または貼り付けデータをそのまま一覧確認したり、聞き流し学習に使えます。
            </p>

            {studyPanelMode === "list" ? (
              <div className="mt-4 max-h-[420px] overflow-auto rounded-2xl border select-none">
                <table className="w-full table-fixed border-collapse text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="w-[12%] border p-2 text-center">番号</th>
                      <th className="w-[28%] border p-2 text-left">単語</th>
                      <th className="w-[60%] border p-2 text-left">意味</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outputWords.map((word) => (
                      <tr key={`${word.no}-${word.english}`}>
                        <td className="border p-2 text-center font-bold">{word.no}</td>
                        <td className="border p-2 font-bold">{word.english}</td>
                        <td className="border p-2 text-slate-600">{word.japanese}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
                  <div className="overflow-hidden rounded-2xl border bg-slate-50">
                    <div className="relative h-56 w-full overflow-hidden">
                      <img
                        src={
                          selectedBook
                            ? getBookCover(selectedBook, 0)
                            : "https://dummyimage.com/900x540/e2e8f0/64748b&text=Listening"
                        }
                        alt={selectedBook?.title ?? "listening"}
                        className="h-full w-full object-cover opacity-80"
                      />
                      <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-slate-900/50 to-transparent p-5 text-white">
                        <p className="text-xs font-black tracking-[0.18em] opacity-80">LISTENING</p>
                        <p className="mt-1 line-clamp-2 text-2xl font-black leading-tight">
                          {selectedBook?.title ?? "単語帳"}
                        </p>
                        <p className="mt-1 truncate text-xs font-bold opacity-80">
                          作成者: {selectedBook?.creator ?? "Vocab Print Pro"}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border bg-slate-50 p-4">
                    {currentListeningWord ? (
                      <>
                        <div className="flex min-h-[220px] flex-col justify-center rounded-2xl bg-white p-5 shadow-sm">
                          <p className="text-xs font-black tracking-[0.18em] text-blue-600">
                            {listeningStudyMode === "test" && !showListeningAnswer ? "QUESTION" : "ANSWER"}
                          </p>
                          <p className="mt-3 break-words text-4xl font-black leading-tight text-slate-950">
                            {currentListeningWord.english}
                          </p>
                          <div className="mt-5 min-h-[68px]">
                            {listeningStudyMode === "test" && !showListeningAnswer ? (
                              <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500">
                                意味を思い出してから、少し待つと答えが表示されます。
                              </p>
                            ) : (
                              <p className="line-clamp-3 break-words text-2xl font-black leading-relaxed text-slate-800">
                                {currentListeningMeaning}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                          <span className="rounded-full bg-white px-3 py-1 font-bold">{listeningIndex + 1} / {outputWords.length}</span>
                          <span className="rounded-full bg-white px-3 py-1 font-bold">{listeningStudyMode === "test" ? "テスト再生" : "聞き流し"}</span>
                          <span className="rounded-full bg-white px-3 py-1 font-bold">{listeningMeaningMode === "main" ? "意味: メイン" : "意味: 全部"}</span>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-slate-400">単語を選ぶと聞き流しできます。</p>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-bold">学習モード</label>
                    <div className="mt-1 grid gap-2">
                      {([
                        { id: "listen", label: "聞き流し", help: "英語と日本語を順番に確認" },
                        { id: "test", label: "テスト再生", help: "英語だけ表示してから答えを表示" },
                      ] as Array<{ id: ListeningStudyMode; label: string; help: string }>).map((mode) => (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => {
                            setListeningStudyMode(mode.id);
                            setShowListeningAnswer(mode.id === "listen");
                          }}
                          className={`rounded-xl border px-3 py-2 text-left text-sm ${
                            listeningStudyMode === mode.id ? "border-blue-400 bg-blue-50" : "bg-white hover:bg-slate-50"
                          }`}
                        >
                          <span className="block font-black text-slate-900">{mode.label}</span>
                          <span className="block text-xs text-slate-500">{mode.help}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold">意味の表示</label>
                    <div className="mt-1 grid gap-2">
                      {([
                        { id: "main", label: "メインの意味", help: "最初の重要な意味だけ短く表示" },
                        { id: "all", label: "全部表示", help: "登録された意味をそのまま表示" },
                      ] as Array<{ id: MeaningMode; label: string; help: string }>).map((mode) => (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => setListeningMeaningMode(mode.id)}
                          className={`rounded-xl border px-3 py-2 text-left text-sm ${
                            listeningMeaningMode === mode.id ? "border-blue-400 bg-blue-50" : "bg-white hover:bg-slate-50"
                          }`}
                        >
                          <span className="block font-black text-slate-900">{mode.label}</span>
                          <span className="block text-xs text-slate-500">{mode.help}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className="block text-sm font-bold">読み上げパターン</label>
                    <select
                      value={listeningVoiceMode}
                      onChange={(event) => setListeningVoiceMode(event.target.value as ListeningVoiceMode)}
                      className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                    >
                      <option value="en-ja">英語 → 日本語</option>
                      <option value="en-only">英語のみ</option>
                      <option value="ja-en">日本語 → 英語</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold">英単語の繰り返し回数</label>
                    <select
                      value={listeningRepeat}
                      onChange={(event) => setListeningRepeat(Number(event.target.value))}
                      className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                    >
                      <option value={1}>1回</option>
                      <option value={2}>2回</option>
                      <option value={3}>3回</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold">単語の間隔</label>
                    <select
                      value={listeningGapMs}
                      onChange={(event) => setListeningGapMs(Number(event.target.value))}
                      className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                    >
                      <option value={900}>短め</option>
                      <option value={1200}>標準</option>
                      <option value={1800}>ゆっくり</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold">読み上げ速度</label>
                    <select
                      value={listeningSpeed}
                      onChange={(event) => setListeningSpeed(Number(event.target.value))}
                      className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                    >
                      <option value={0.82}>ゆっくり</option>
                      <option value={1}>ふつう</option>
                      <option value={1.14}>少し速い</option>
                      <option value={1.28}>速い</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => playListeningSequence(listeningIndex)}
                    disabled={!currentListeningWord}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:bg-slate-300"
                  >
                    {isListening ? "ここから再開" : listeningStudyMode === "test" ? "テスト再生を開始" : "連続再生"}
                  </button>
                  {listeningStudyMode === "test" && currentListeningWord && (
                    <button
                      type="button"
                      onClick={() => setShowListeningAnswer((current) => !current)}
                      className="rounded-xl border bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                    >
                      {showListeningAnswer ? "答えを隠す" : "答えを表示"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={playCurrentListeningWord}
                    disabled={!currentListeningWord}
                    className="rounded-xl border bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:bg-slate-100"
                  >
                    今の単語だけ再生
                  </button>
                  <button
                    type="button"
                    onClick={stopListening}
                    className="rounded-xl border bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                  >
                    停止
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setListeningIndex((current) => Math.max(0, current - 1))}
                    disabled={listeningIndex <= 0}
                    className="rounded-xl border bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:bg-slate-100"
                  >
                    前へ
                  </button>
                  <button
                    type="button"
                    onClick={() => setListeningIndex(0)}
                    className="rounded-xl border bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                  >
                    最初へ
                  </button>
                  <button
                    type="button"
                    onClick={() => setListeningIndex((current) => Math.min(outputWords.length - 1, current + 1))}
                    disabled={listeningIndex >= outputWords.length - 1}
                    className="rounded-xl border bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:bg-slate-100"
                  >
                    次へ
                  </button>
                </div>

                <div className="max-h-[220px] overflow-auto rounded-2xl border">
                  <div className="grid gap-2 p-2">
                    {outputWords.map((word, index) => (
                      <button
                        key={`${word.no}-${word.english}-listen`}
                        type="button"
                        onClick={() => {
                          setListeningIndex(index);
                          setStudyPanelMode("listening");
                        }}
                        className={`rounded-xl border px-3 py-3 text-left ${
                          index === listeningIndex ? "border-blue-400 bg-blue-50" : "bg-white hover:bg-slate-50"
                        }`}
                      >
                        <p className="text-xs font-bold text-slate-400">{word.no}</p>
                        <p className="mt-1 font-bold text-slate-900">{word.english}</p>
                        <p className="mt-1 text-sm text-slate-600 line-clamp-2">{formatMeaning(word.japanese, listeningMeaningMode)}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6 rounded-2xl bg-slate-50 p-4">
              <h4 className="font-black">作成履歴</h4>
              {history.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">まだ履歴はありません。</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm text-slate-600">
                  {history.slice(0, 5).map((item, index) => (
                    <li key={index}>・{item}</li>
                  ))}
                </ul>
              )}
            </div>
            </details>
          </section>
        </div>

        <section className="mt-6 rounded-3xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-black">貼り付けから単語テストを作成</h3>
              <p className="mt-1 text-sm text-slate-500">
                Excel / CSVの3列データをそのまま貼り付けて、上の設定を使ってPDF化できます。
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
              単語帳として保存も可能
            </span>
          </div>
          <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center hover:border-blue-400"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleWordFile(f); }}
          >
            <span className="text-sm font-bold text-slate-700">ファイルから読み込み</span>
            <span className="text-xs text-slate-500">CSV / TSV / TXT / Excel(.xlsx) をドラッグ＆ドロップ、またはクリックして選択</span>
            <input
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,.xls"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleWordFile(f); e.target.value = ""; }}
            />
          </label>
          <textarea
            value={pasteText}
            onChange={(event) => setPasteText(event.target.value)}
            className="mt-3 h-40 w-full rounded-2xl border p-4 font-mono text-sm"
          />
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={printPastedPdf}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
              >
                このまま単語テストを印刷
              </button>
              <button
                type="button"
                onClick={addCustomBook}
                className="rounded-xl border bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
              単語帳として登録{plan === "free" ? "（Pro）" : ""}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            英語 / 日本語 / スペルテスト、空欄や赤字の設定は上の印刷設定がそのまま使えます。名前欄とクラス欄は、印刷する紙の上部に出る入力欄です。
          </p>
        </section>

        <section className="mt-6 rounded-3xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-black">かぶり調査</h3>
              <p className="mt-1 text-sm text-slate-500">
                2冊の単語帳を比べて、共通語・基準単語帳のみ・比較単語帳のみを見やすく確認して、そのまま印刷できます。
              </p>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
              ローカル試作
            </span>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-bold">基準の単語帳</label>
              <select
                value={overlapBaseBookId}
                onChange={(event) => setOverlapBaseBookId(event.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-3 text-sm"
              >
                {books.map((book) => (
                  <option key={book.id} value={book.id}>
                    {book.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold">比較する単語帳</label>
              <select
                value={overlapCompareBookId}
                onChange={(event) => setOverlapCompareBookId(event.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-3 text-sm"
              >
                {books.map((book) => (
                  <option key={book.id} value={book.id}>
                    {book.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <span className="font-black">基準単語帳</span>
              <span className="ml-2 text-amber-700">{overlapBaseBook?.title ?? "未選択"}</span>
            </div>
            <div className="rounded-2xl bg-violet-50 px-4 py-3 text-sm text-violet-800">
              <span className="font-black">比較単語帳</span>
              <span className="ml-2 text-violet-700">{overlapCompareBook?.title ?? "未選択"}</span>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {([
              ["common", "共通のみ"],
              ["base-only", "基準単語帳のみ"],
              ["compare-only", "比較単語帳のみ"],
              ["all", "全部見る"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setOverlapMode(value)}
                className={`rounded-full px-4 py-2 text-sm font-bold ${
                  overlapMode === value ? "bg-blue-600 text-white" : "border bg-white text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-600">
            <span className="font-bold text-slate-700">見方:</span>{" "}
            共通のみ = 両方の単語帳にある単語 / 基準単語帳のみ = 左で選んだ単語帳だけにある単語 /
            比較単語帳のみ = 右で選んだ単語帳だけにある単語
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <span className="rounded-full bg-slate-100 px-3 py-1 font-bold">
              表示中 {overlapRows.length}語
            </span>
            {overlapBaseBook && overlapCompareBook ? (
              <span>
                基準: {overlapBaseBook.title} / 比較: {overlapCompareBook.title}
              </span>
            ) : null}
          </div>

          <div
            className="mt-4 max-h-[360px] overflow-auto rounded-2xl border select-none"
            onCopy={(event) => event.preventDefault()}
            onCut={(event) => event.preventDefault()}
            onContextMenu={(event) => event.preventDefault()}
          >
            <table className="w-full table-fixed border-collapse text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="w-[10%] border p-2 text-center">表示</th>
                  <th className="w-[16%] border p-2 text-center">基準番号</th>
                  <th className="w-[16%] border p-2 text-center">比較番号</th>
                  <th className="w-[18%] border p-2 text-center">区分</th>
                  <th className="w-[18%] border p-2 text-left">英語</th>
                  <th className="border p-2 text-left">意味</th>
                </tr>
              </thead>
              <tbody>
                {overlapRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-400">
                      2冊選ぶと、かぶりがここに出ます。
                    </td>
                  </tr>
                ) : (
                  overlapRows.map((row) => (
                    <tr key={`${row.bucket}-${row.english}-${row.no}`}>
                      <td className="border p-2 text-center font-bold">{row.no}</td>
                      <td className="border p-2 text-center font-bold text-slate-700">{row.baseNo ?? "-"}</td>
                      <td className="border p-2 text-center font-bold text-slate-700">{row.compareNo ?? "-"}</td>
                      <td className="border p-2 text-center">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-bold ${
                            row.bucket === "common"
                              ? "bg-emerald-50 text-emerald-700"
                              : row.bucket === "base-only"
                                ? "bg-amber-50 text-amber-700"
                                : "bg-violet-50 text-violet-700"
                          }`}
                        >
                          {row.source}
                        </span>
                      </td>
                      <td className="border p-2 font-bold">{row.english}</td>
                      <td className="border p-2 text-slate-600">{row.japanese}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={printOverlapWords}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
            >
              この結果を印刷
            </button>
            <button
              type="button"
              onClick={() => {
                if (selectedBook) {
                  setOverlapBaseBookId(selectedBook.id);
                }
              }}
              className="rounded-xl border bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              今の単語帳を基準単語帳にする
            </button>
          </div>
        </section>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <PlanCard title="Free" price="¥0" text="1日2回・1ページまで。Personal単語帳も体験できる無料プラン。" />
          <PlanCard
            title="Personal"
            price="¥780/月"
            text="7日無料トライアル。履歴保存・単語帳保存対応。1回5ページ、月300回まで利用可能。"
            onClick={plan === "personal" ? undefined : () => startCheckout("personal")}
            disabled={plan !== "personal" && !configuredPlans.personal}
            current={plan === "personal"}
          />
          <PlanCard
            title="Teacher"
            price="¥2,980/月"
            text="先生・塾向け。クラス配布や一括作成。"
            onClick={plan === "teacher" ? undefined : () => startCheckout("teacher")}
            disabled={plan !== "teacher" && !configuredPlans.teacher}
            current={plan === "teacher"}
          />
        </div>
      </section>

      {showPreview && (() => {
        const ppMM = PREVIEW_SCALE * 3.78;
        const iframeW = 794;
        const iframeH = 1123;
        const overlayW = Math.round(iframeW * PREVIEW_SCALE);
        const overlayH = Math.round(iframeH * PREVIEW_SCALE);
        const hasInfoFields = showRecordFields && (showClassField || showNumberField || showNameField);

        // タイトルハンドル（青）: ページ上部、上下左右移動可
        const titleHandleTop = Math.round((9 + titleOffset.y) * ppMM);
        const titleHandleH = Math.round(13 * ppMM);
        const titleHandleStyle: React.CSSProperties = {
          position: "absolute",
          top: titleHandleTop,
          left: "12%",
          right: "12%",
          height: titleHandleH,
          transform: `translateX(${titleOffset.x * ppMM}px)`,
          background: "rgba(59,130,246,0.18)",
          border: "1.5px dashed #3b82f6",
          borderRadius: 3,
          cursor: "move",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        };

        // 日付ハンドル（黄）: 右上、上下左右移動可
        const dateHandleTop = Math.round((9 + titleOffset.y + dateOffset.y) * ppMM);
        const dateHandleRight = Math.max(2, Math.round((9 - dateOffset.x) * ppMM));
        const dateHandleStyle: React.CSSProperties = {
          position: "absolute",
          top: dateHandleTop,
          right: dateHandleRight,
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

        // ページ番号ハンドル（グレー）: フッター中央（ページ番号のみ移動、Created byは固定）
        const pageNoHandleTop = Math.round((9 + 280 - 9 - 6 + pageNoOffset.y) * ppMM);
        const pageNoHandleStyle: React.CSSProperties = {
          position: "absolute",
          top: pageNoHandleTop,
          left: "35%",
          right: "35%",
          height: Math.round(8 * ppMM),
          transform: `translateX(${pageNoOffset.x * ppMM}px)`,
          background: "rgba(100,116,139,0.2)",
          border: "1.5px dashed #64748b",
          borderRadius: 3,
          cursor: "move",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        };

        // 中心ガイド線（A4ページ中央）
        const pageCenterX = Math.round((9 + 192 / 2) * ppMM);  // 105mm from iframe left
        const pageCenterY = Math.round((9 + 280 / 2) * ppMM);  // 149mm from iframe top

        // 単語グリッドハンドル（紫）: ページ中央部、上下左右移動可
        const gridHandleTop = Math.round((9 + 10 + 85 + gridOffset.y) * ppMM);
        const gridHandleStyle: React.CSSProperties = {
          position: "absolute",
          top: gridHandleTop,
          left: "3%",
          right: "3%",
          height: Math.round(16 * ppMM),
          transform: `translateX(${gridOffset.x * ppMM}px)`,
          background: "rgba(139,92,246,0.15)",
          border: "1.5px dashed #8b5cf6",
          borderRadius: 3,
          cursor: "move",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        };

        // 記入欄ハンドル（緑）: ページ下部、上下左右移動可
        const infoBottomDefault = Math.round((8 + 5 + 6 + 9) * ppMM); // pageBottom+footerMargin+footerH+infoH = 28mm
        const infoHandleBottom = infoBottomDefault - Math.round(infoOffset.y * ppMM);
        const infoHandleStyle: React.CSSProperties = {
          position: "absolute",
          bottom: infoHandleBottom,
          left: "5%",
          right: "5%",
          height: Math.round(10 * ppMM),
          transform: `translateX(${infoOffset.x * ppMM}px)`,
          background: "rgba(16,185,129,0.18)",
          border: "1.5px dashed #10b981",
          borderRadius: 3,
          cursor: "move",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        };

        const startDrag = (type: "title" | "date" | "info" | "grid" | "pageNo", e: React.MouseEvent, ox: number, oy: number) => {
          e.preventDefault();
          setDragging(type);
          setDragStart({ cx: e.clientX, cy: e.clientY, ox, oy });
        };

        const fmt = (v: number) => `${v >= 0 ? "+" : ""}${Math.round(v * 10) / 10}`;

        return (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/60 p-2 sm:items-center sm:p-4"
            onMouseLeave={() => { if (dragging) setDragging(null); }}
          >
            <div className="flex max-h-[96dvh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl md:flex-row">
              {/* A4プレビュー */}
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="border-b px-5 py-4">
                  <h2 className="text-lg font-black">印刷プレビュー</h2>
                  <p className="mt-0.5 text-xs text-slate-400">
                    <span style={{ color: "#3b82f6" }}>■</span> タイトル &nbsp;
                    <span style={{ color: "#ca8a04" }}>■</span> 日付 &nbsp;
                    <span style={{ color: "#8b5cf6" }}>■</span> 単語リスト &nbsp;
                    {hasInfoFields && <><span style={{ color: "#10b981" }}>■</span> 記入欄 &nbsp;</>}
                    <span style={{ color: "#64748b" }}>■</span> ページ数
                  </p>
                </div>
                <div className="overflow-auto p-4" style={{ background: "#e8edf2" }}>
                  <div style={{ position: "relative", width: overlayW, height: overlayH, background: "white", boxShadow: "0 4px 20px rgba(0,0,0,0.18)" }}>
                    <iframe
                      ref={previewIframeRef}
                      style={{
                        width: iframeW,
                        height: iframeH,
                        transform: `scale(${PREVIEW_SCALE})`,
                        transformOrigin: "top left",
                        border: "none",
                        display: "block",
                        pointerEvents: "none",
                      }}
                    />
                    <div style={{ position: "absolute", inset: 0 }}>
                      {/* 中心ガイド線: ドラッグ中のみ表示、スナップ時に強調 */}
                      {dragging && (() => {
                        const activeOffset =
                          dragging === "title" ? titleOffset :
                          dragging === "grid" ? gridOffset :
                          dragging === "pageNo" ? pageNoOffset :
                          dragging === "date" ? dateOffset : infoOffset;
                        const snappedX = activeOffset.x === 0;
                        const snappedY = activeOffset.y === 0;
                        return (
                          <>
                            <div style={{ position: "absolute", top: 0, bottom: 0, left: pageCenterX, width: snappedX ? 2 : 1, background: snappedX ? "rgba(59,130,246,0.7)" : "rgba(59,130,246,0.22)", pointerEvents: "none", transition: "background 0.1s, width 0.1s" }} />
                            <div style={{ position: "absolute", left: 0, right: 0, top: pageCenterY, height: snappedY ? 2 : 1, background: snappedY ? "rgba(59,130,246,0.7)" : "rgba(59,130,246,0.22)", pointerEvents: "none", transition: "background 0.1s, height 0.1s" }} />
                          </>
                        );
                      })()}
                      {/* タイトルハンドル */}
                      <div style={titleHandleStyle} onMouseDown={(e) => startDrag("title", e, titleOffset.x, titleOffset.y)}>
                        <span style={{ fontSize: 9, color: "#3b82f6", fontWeight: 800, userSelect: "none" }}>✥ タイトル</span>
                      </div>
                      {/* 日付ハンドル */}
                      <div style={dateHandleStyle} onMouseDown={(e) => startDrag("date", e, dateOffset.x, dateOffset.y)}>
                        <span style={{ fontSize: 8, color: "#92400e", fontWeight: 800, userSelect: "none" }}>✥</span>
                      </div>
                      {/* ページ番号ハンドル */}
                      <div style={pageNoHandleStyle} onMouseDown={(e) => startDrag("pageNo", e, pageNoOffset.x, pageNoOffset.y)}>
                        <span style={{ fontSize: 8, color: "#475569", fontWeight: 800, userSelect: "none" }}>✥ ページ数</span>
                      </div>
                      {/* 単語グリッドハンドル */}
                      <div style={gridHandleStyle} onMouseDown={(e) => startDrag("grid", e, gridOffset.x, gridOffset.y)}>
                        <span style={{ fontSize: 9, color: "#8b5cf6", fontWeight: 800, userSelect: "none" }}>✥ 単語リスト</span>
                      </div>
                      {/* 記入欄ハンドル */}
                      {hasInfoFields && (
                        <div style={infoHandleStyle} onMouseDown={(e) => startDrag("info", e, infoOffset.x, infoOffset.y)}>
                          <span style={{ fontSize: 9, color: "#10b981", fontWeight: 800, userSelect: "none" }}>✥ 記入欄</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* コントロールパネル */}
              <div className="flex w-full flex-col border-t md:w-56 md:border-l md:border-t-0">
                <div className="flex-1 space-y-4 overflow-auto p-5 text-xs">
                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
                    <p className="mb-1 font-bold text-blue-700">タイトル</p>
                    <p className="text-slate-500">横 {fmt(titleOffset.x)}mm / 縦 {fmt(titleOffset.y)}mm</p>
                  </div>
                  <div className="rounded-xl border border-yellow-100 bg-yellow-50 p-3">
                    <p className="mb-1 font-bold text-yellow-700">日付</p>
                    <p className="text-slate-500">横 {fmt(dateOffset.x)}mm / 縦 {fmt(dateOffset.y)}mm</p>
                  </div>
                  <div className="rounded-xl border border-violet-100 bg-violet-50 p-3">
                    <p className="mb-1 font-bold text-violet-700">単語リスト</p>
                    <p className="text-slate-500">横 {fmt(gridOffset.x)}mm / 縦 {fmt(gridOffset.y)}mm</p>
                  </div>
                  {hasInfoFields && (
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                      <p className="mb-1 font-bold text-emerald-700">記入欄</p>
                      <p className="text-slate-500">横 {fmt(infoOffset.x)}mm / 縦 {fmt(infoOffset.y)}mm</p>
                    </div>
                  )}
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <p className="mb-1 font-bold text-slate-600">ページ数</p>
                    <p className="text-slate-500">横 {fmt(pageNoOffset.x)}mm / 縦 {fmt(pageNoOffset.y)}mm</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setTitleOffset({ x: 0, y: 0 }); setDateOffset({ x: 0, y: 0 }); setGridOffset({ x: 0, y: 0 }); setInfoOffset({ x: 0, y: 0 }); setPageNoOffset({ x: 0, y: 0 }); }}
                    className="text-xs text-slate-400 underline"
                  >
                    全てリセット
                  </button>
                </div>

                <div className="space-y-3 border-t bg-white p-5">
                  <button
                    type="button"
                    onClick={() => { setShowPreview(false); void printPdf(); }}
                    className="w-full rounded-2xl bg-blue-600 py-3 text-sm font-black text-white hover:bg-blue-700"
                  >
                    この設定で印刷
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPreview(false)}
                    className="w-full rounded-2xl border py-3 text-sm font-black text-slate-600 hover:bg-slate-50"
                  >
                    閉じる
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </main>
  );
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label className="text-sm font-bold">{label}</label>
      <input
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        type="number"
        className="mt-1 w-full rounded-xl border px-3 py-2"
      />
    </div>
  );
}

function PlanCard({
  title,
  price,
  text,
  onClick,
  disabled = false,
  current = false,
}: {
  title: string;
  price: string;
  text: string;
  onClick?: () => void;
  disabled?: boolean;
  current?: boolean;
}) {
  return (
    <div className="rounded-3xl border bg-white p-5 shadow-sm">
      <h3 className="text-xl font-black">{title}</h3>
      <p className="mt-2 text-3xl font-black text-blue-600">{price}</p>
      <p className="mt-3 text-sm text-slate-500">{text}</p>
      {current ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-center font-bold text-emerald-700">
          現在利用中
        </div>
      ) : onClick && (
        <button
          onClick={onClick}
          disabled={disabled}
          className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-2 font-bold text-white hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500"
        >
          {disabled ? "Stripe設定後に利用可能" : "このプランで始める"}
        </button>
      )}
    </div>
  );
}

function buildPrintHtml({
  title,
  words,
  type,
  showPageNo,
  makeQuestion,
  plan,
  printStyle,
  includeWatermark,
  showRecordFields,
  showClassField,
  showNumberField,
  showNameField,
  studentClass,
  studentNumber,
  studentName,
  includeDate,
  generatedAt,
  userEmail = "",
  titleOffsetX = 0,
  titleOffsetY = 0,
  dateOffsetX = 0,
  dateOffsetY = 0,
  infoOffsetX = 0,
  infoOffsetY = 0,
  gridOffsetX = 0,
  gridOffsetY = 0,
  pageNoOffsetX = 0,
  pageNoOffsetY = 0,
}: {
  title: string;
  words: Word[];
  type: PdfType;
  showPageNo: boolean;
  makeQuestion: (word: Word) => { question: string; answer: string };
  plan: Plan;
  printStyle: PrintStyle;
  includeWatermark: boolean;
  userEmail?: string;
  showRecordFields: boolean;
  showClassField: boolean;
  showNumberField: boolean;
  showNameField: boolean;
  studentClass: string;
  studentNumber: string;
  studentName: string;
  includeDate: boolean;
  generatedAt: Date;
  titleOffsetX?: number;
  titleOffsetY?: number;
  dateOffsetX?: number;
  dateOffsetY?: number;
  infoOffsetX?: number;
  infoOffsetY?: number;
  gridOffsetX?: number;
  gridOffsetY?: number;
  pageNoOffsetX?: number;
  pageNoOffsetY?: number;
}) {
  const perPage = 50;
  const visibleWords = plan === "free" ? words.slice(0, perPage) : words;
  const pages: Word[][] = [];

  for (let index = 0; index < visibleWords.length; index += perPage) {
    pages.push(visibleWords.slice(index, index + perPage));
  }

  const formatStyledText = (value: string, language: "english" | "japanese") => {
    const shouldBlank =
      (printStyle === "blank-english" && language === "english") ||
      (printStyle === "blank-japanese" && language === "japanese");
    const shouldRed =
      (printStyle === "red-english" && language === "english") ||
      (printStyle === "red-japanese" && language === "japanese");

    if (shouldBlank) {
      return `<span class="p-blank"></span>`;
    }

    if (shouldRed) {
      return `<span class="p-red">${escapeHtml(value)}</span>`;
    }

    return escapeHtml(value);
  };

  const hasInfoBox = showRecordFields && (showClassField || showNumberField || showNameField);
  const showDateHeader = includeDate;
  const dateStr = showDateHeader ? formatPrintDate(generatedAt) : "";

  // 透かし: 有料は購入者メール入り（流出・編集の抑止＝誰のものか残す）、無料はFREE表記
  const watermark = includeWatermark || plan === "free"
    ? plan === "free"
      ? "FREE ・ 1ページのみ ・ 見本"
      : userEmail
        ? userEmail
        : "Vocab Print Pro"
    : "";

  return `<style>${printCss}</style>` + pages
    .map((pageWords, pageIndex) => {
      const left = pageWords.slice(0, 25);
      const right = pageWords.slice(25, 50);

      const table = (items: Word[]) => `
        <table class="print-table">
          <thead>
            <tr>
              <th class="p-no">番号</th>
              <th class="p-word">${type === "list" ? "単語" : "問題"}</th>
              <th class="p-meaning">${type === "test" ? "解答欄" : type === "answer" ? "答え" : "意味"}</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((word) => {
              const qa = makeQuestion(word);
              const leftText = type === "list" ? formatStyledText(word.english, "english") : formatStyledText(qa.question, directionLanguage(qa.question, word));
              const rightText = type === "list"
                ? formatStyledText(word.japanese, "japanese")
                : type === "answer"
                  ? formatStyledText(qa.answer, directionLanguage(qa.answer, word))
                  : "";
              return `<tr>
                <td class="p-no"><div class="p-fit center"><span class="p-text one">${escapeHtml(String(word.no))}</span></div></td>
                <td class="p-word"><div class="p-fit"><span class="p-text two">${leftText}</span></div></td>
                <td class="p-meaning"><div class="p-fit"><span class="p-text two">${rightText}</span></div></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>`;

      const headerStyle = titleOffsetY ? `margin-top:${titleOffsetY}mm` : "";
      const h1Style = titleOffsetX ? `transform:translateX(${titleOffsetX}mm)` : "";
      const dateStyle = (dateOffsetX || dateOffsetY) ? `transform:translate(${dateOffsetX}mm,${dateOffsetY}mm)` : "";
      const infoTransform = (infoOffsetX || infoOffsetY) ? `transform:translate(${infoOffsetX}mm,${infoOffsetY}mm)` : "";
      const infoStyle = `flex:0 0 auto;margin-top:8mm;background:white${infoTransform ? `;${infoTransform}` : ""}`;
      const pageNoStyle = (pageNoOffsetX || pageNoOffsetY) ? `transform:translate(${pageNoOffsetX}mm,${pageNoOffsetY}mm);display:inline-block` : "";
      // タイル状の透かし: ページ全体に繰り返し表示（流出抑止）
      const wmTiled = watermark
        ? `<div class="print-watermark">${Array.from({ length: 16 })
            .map(
              () =>
                `<div class="wm-row">${Array.from({ length: 6 })
                  .map(() => escapeHtml(watermark))
                  .join("&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;")}</div>`
            )
            .join("")}</div>`
        : "";
      return `<section class="print-page${hasInfoBox ? " has-info" : ""}">
        ${wmTiled}
        <div class="print-page-header"${headerStyle ? ` style="${headerStyle}"` : ""}>
          <h1${h1Style ? ` style="${h1Style}"` : ""}>${escapeHtml(title)}</h1>
          ${dateStr ? `<div class="print-date"${dateStyle ? ` style="${dateStyle}"` : ""}>${escapeHtml(dateStr)}</div>` : ""}
        </div>
        ${plan === "free" ? `<p class="print-note">Free版は1ページのみです。</p>` : ""}
        <div class="print-grid"${(gridOffsetX || gridOffsetY) ? ` style="transform:translate(${gridOffsetX}mm,${gridOffsetY}mm)"` : ""}>${table(left)}${table(right)}</div>
        ${hasInfoBox ? `<div class="print-info-box" style="${infoStyle}"><div class="print-info-fields">
          ${showClassField ? `<div class="pif pif-sm"><span class="pif-label">クラス</span><span class="pif-value">${escapeHtml(studentClass)}</span></div>` : ""}
          ${showNumberField ? `<div class="pif pif-sm"><span class="pif-label">番号</span><span class="pif-value">${escapeHtml(studentNumber)}</span></div>` : ""}
          ${showNameField ? `<div class="pif pif-lg"><span class="pif-label">氏名</span><span class="pif-value">${escapeHtml(studentName)}</span></div>` : ""}
        </div></div>` : ""}
        <footer>
          <span></span>
          <span${pageNoStyle ? ` style="${pageNoStyle}"` : ""}>${showPageNo ? `${pageIndex + 1}/${pages.length}` : ""}</span>
          <span>${escapeHtml(userEmail ? userEmail + " ・ Vocab Print Pro" : "Vocab Print Pro")}</span>
        </footer>
      </section>`;
    })
    .join("");
}

function directionLanguage(value: string, word: Word): "english" | "japanese" {
  if (value === word.english) return "english";
  return "japanese";
}

function escapeHtml(value: string) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const printCss = `
@media print {
  body { margin:0!important; background:white!important; }
  body * { visibility:hidden!important; }
  #print-root, #print-root * { visibility:visible!important; }
  #print-root { display:block!important; position:absolute!important; left:0!important; top:0!important; width:100%!important; background:white!important; }

  @page { size:A4 portrait; margin:9mm 9mm 8mm 9mm; }

  .print-page {
    width:100%; height:280mm; page-break-after:always;
    box-sizing:border-box; position:relative; overflow:hidden;
    font-family:"Yu Gothic","Meiryo",sans-serif; color:#111; background:white;
    display:flex; flex-direction:column; padding-bottom:1mm;
  }

  /* ヘッダー: タイトル中央・日付右上 */
  .print-page-header { position:relative; text-align:center; margin-bottom:4mm; }
  .print-page-header h1 { margin:0; font-size:12pt; font-weight:900; letter-spacing:.04em; }
  .print-date { position:absolute; right:0; top:2mm; font-size:7.5pt; color:#333; font-weight:600; line-height:1.2; }

  .print-note { margin:-1mm 0 3mm; text-align:center; font-size:8.5pt; color:#7c2d12; }

  .print-watermark {
    position:absolute; inset:-20% -20%; z-index:0; overflow:hidden;
    display:flex; flex-direction:column; justify-content:space-around; align-items:center;
    transform:rotate(-30deg); pointer-events:none; user-select:none;
  }
  .print-watermark .wm-row {
    white-space:nowrap; font-size:13pt; font-weight:800; letter-spacing:.18em;
    color:rgba(37,99,235,.08);
  }
  .print-page-header, .print-note, .print-grid, .print-info-box, footer { position:relative; z-index:1; }

  .print-grid { display:grid; grid-template-columns:1fr 1fr; column-gap:6.5mm; align-items:start; flex:1 1 0; min-height:0; }

  /* 記入欄なし: footer margin 9mm込み → grid ~254mm。td=9.5mm×25+th=8.5mm=246mm */
  .print-table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:8.4pt; line-height:1.2; }
  .print-table th, .print-table td { border:.65pt solid #111; padding:0; height:9.5mm; max-height:9.5mm; overflow:hidden; vertical-align:middle; }
  .print-table th { height:8.5mm; text-align:center; font-weight:800; background:#fff; }

  /* 記入欄あり: footer margin 9mm込み → grid ~237mm。td=9.0mm×25+th=8.0mm=233mm */
  .has-info .print-table { font-size:7.8pt; }
  .has-info .print-table td { height:9.0mm; max-height:9.0mm; }
  .has-info .print-table th { height:8.0mm; max-height:8.0mm; }

  .p-no { width:10%; text-align:center; }
  .p-word { width:26%; }
  .p-meaning { width:64%; }

  .p-fit { box-sizing:border-box; width:100%; height:100%; padding:.8mm 1.05mm; overflow:hidden; display:flex; align-items:center; justify-content:flex-start; overflow-wrap:anywhere; word-break:break-word; }
  .p-fit.center { justify-content:center; text-align:center; }
  .p-text { display:-webkit-box; -webkit-box-orient:vertical; overflow:hidden; }
  .p-text.one { -webkit-line-clamp:1; line-clamp:1; }
  .p-text.two { -webkit-line-clamp:2; line-clamp:2; }
  .p-blank { display:inline-block; width:100%; min-width:22mm; border-bottom:1.2pt solid #111; transform:translateY(-.5mm); }
  .p-red { color:#dc2626; font-weight:800; }

  /* 記入欄: クラス(小)・番号(小)・氏名(大) */
  .print-info-box { flex:0 0 auto; margin-top:8mm; background:white; }
  .print-info-fields { display:flex; gap:3mm; align-items:flex-end; }
  .pif { display:flex; align-items:baseline; gap:1.5mm; border-bottom:.75pt solid #111; padding-bottom:1mm; padding-top:.5mm; }
  .pif-sm { flex:0 0 26mm; }
  .pif-lg { flex:1 1 auto; }
  .pif-label { flex:0 0 auto; font-size:6.8pt; font-weight:800; white-space:nowrap; color:#333; }
  .pif-value { flex:1 1 auto; font-size:8.2pt; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; min-width:0; }

  footer {
    flex:0 0 auto; margin-top:9mm; height:6mm;
    display:grid; grid-template-columns:1fr 1fr 1fr; align-items:end;
    font-size:7.5pt; color:#555; background:white;
  }
  footer span { min-width:0; }
  footer span:nth-child(2) { text-align:center; }
  footer span:nth-child(3) { text-align:right; word-break:break-word; }
}
`;

const PREVIEW_SCALE = 0.48;

const previewCss = `
body { margin:0; background:white; overflow:hidden; }
#print-root { display:block; }
.print-page {
  width:192mm; height:280mm; page-break-after:always;
  box-sizing:border-box; position:relative; overflow:hidden;
  font-family:"Yu Gothic","Meiryo",sans-serif; color:#111; background:white;
  display:flex; flex-direction:column; padding-bottom:1mm; margin:9mm 9mm 8mm;
}
.print-page-header { position:relative; text-align:center; margin-bottom:4mm; flex:0 0 auto; }
.print-page-header h1 { margin:0; font-size:12pt; font-weight:900; letter-spacing:.04em; }
.print-date { position:absolute; right:0; top:0; font-size:7.5pt; color:#333; font-weight:600; line-height:1.2; }
.print-note { margin:-1mm 0 3mm; text-align:center; font-size:8.5pt; color:#7c2d12; }
.print-watermark {
  position:absolute; inset:-20% -20%; z-index:0; overflow:hidden;
  display:flex; flex-direction:column; justify-content:space-around; align-items:center;
  transform:rotate(-30deg); pointer-events:none; user-select:none;
}
.print-watermark .wm-row {
  white-space:nowrap; font-size:13pt; font-weight:800; letter-spacing:.18em;
  color:rgba(37,99,235,.08);
}
.print-page-header, .print-note, .print-grid, .print-info-box, footer { position:relative; z-index:1; }
.print-grid { display:grid; grid-template-columns:1fr 1fr; column-gap:6.5mm; align-items:start; flex:1 1 0; min-height:0; }
.print-table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:8.4pt; line-height:1.2; }
.print-table th, .print-table td { border:.65pt solid #111; padding:0; height:9.5mm; max-height:9.5mm; overflow:hidden; vertical-align:middle; }
.print-table th { height:8.5mm; text-align:center; font-weight:800; background:#fff; }
.has-info .print-table { font-size:7.8pt; }
.has-info .print-table td { height:9.0mm; max-height:9.0mm; }
.has-info .print-table th { height:8.0mm; max-height:8.0mm; }
.p-no { width:10%; text-align:center; }
.p-word { width:26%; }
.p-meaning { width:64%; }
.p-fit { box-sizing:border-box; width:100%; height:100%; padding:.8mm 1.05mm; overflow:hidden; display:flex; align-items:center; justify-content:flex-start; overflow-wrap:anywhere; word-break:break-word; }
.p-fit.center { justify-content:center; text-align:center; }
.p-text { display:-webkit-box; -webkit-box-orient:vertical; overflow:hidden; }
.p-text.one { -webkit-line-clamp:1; line-clamp:1; }
.p-text.two { -webkit-line-clamp:2; line-clamp:2; }
.p-blank { display:inline-block; width:100%; min-width:22mm; border-bottom:1.2pt solid #111; transform:translateY(-.5mm); }
.p-red { color:#dc2626; font-weight:800; }
.print-info-box { flex:0 0 auto; margin-top:8mm; background:white; }
.print-info-fields { display:flex; gap:3mm; align-items:flex-end; }
.pif { display:flex; align-items:baseline; gap:1.5mm; border-bottom:.75pt solid #111; padding-bottom:1mm; padding-top:.5mm; }
.pif-sm { flex:0 0 26mm; }
.pif-lg { flex:1 1 auto; }
.pif-label { flex:0 0 auto; font-size:6.8pt; font-weight:800; white-space:nowrap; color:#333; }
.pif-value { flex:1 1 auto; font-size:8.2pt; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; min-width:0; }
footer {
  flex:0 0 auto; margin-top:9mm; height:6mm;
  display:grid; grid-template-columns:1fr 1fr 1fr; align-items:end;
  font-size:7.5pt; color:#555; background:white;
}
footer span { min-width:0; }
footer span:nth-child(2) { text-align:center; }
footer span:nth-child(3) { text-align:right; word-break:break-word; }
`;
