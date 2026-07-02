"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

type Plan = "free" | "personal" | "teacher";
type PdfType = "list" | "test" | "answer";
type Direction = "en-ja" | "ja-en" | "spelling";
type PrintStyle = "standard" | "blank-english" | "blank-japanese" | "red-english" | "red-japanese";
type Role = "user" | "admin";

type Word = {
  no: number;
  english: string;
  japanese: string;
  unit?: string | null;
};

type WordBook = {
  id: string;
  title: string;
  level: string;
  requiredPlan: Plan;
  coverImage?: string | null;
  description?: string | null;
  words: Word[];
};

const planLimits: Record<
  Plan,
  { period: "day" | "month"; maxGenerations: number; maxWords: number; maxTotalGenerations?: number }
> = {
  free: { period: "day", maxGenerations: 2, maxWords: 50, maxTotalGenerations: 10 },
  personal: { period: "month", maxGenerations: 300, maxWords: 300 },
  teacher: { period: "month", maxGenerations: 5000, maxWords: 1900 },
};

const defaultCoverImages = [
  "https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1516979187457-637abb4f9353?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=900&q=80",
];

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

function parsePastedWords(text: string): Word[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const cells = (line.includes("\t") ? line.split("\t") : line.split(",")).map((cell) => cell.trim());
      return {
        no: Number(cells[0]) || index + 1,
        english: cells[1] || cells[0] || "",
        japanese: cells[2] || cells[1] || "",
      };
    })
    .filter((word, index) => index > 0 ? word.english && word.japanese : !(word.english.toLowerCase() === "english" || word.japanese.toLowerCase() === "japanese"))
    .filter((word) => word.english && word.japanese);
}

function formatPrintDate(date = new Date()) {
  return date.toLocaleDateString("ja-JP");
}

function escapeHtml(value: string) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

function planCacheKey(userId: string) {
  return `vpp-profile-plan:${userId}`;
}

function readCachedPlan(userId: string): Plan | null {
  try {
    const value = window.localStorage.getItem(planCacheKey(userId));
    return value ? normalizePlan(value) : null;
  } catch {
    return null;
  }
}

function writeCachedPlan(userId: string, plan: Plan) {
  try {
    window.localStorage.setItem(planCacheKey(userId), plan);
  } catch {
    // ignore
  }
}

function checkLocalUsage(userId: string, plan: Plan, wordCount: number) {
  const rule = planLimits[plan];
  if (wordCount > rule.maxWords) {
    return { ok: false, message: `${planLabel(plan)}プランは1回あたり${rule.maxWords}語までです。` };
  }

  try {
    const used = Number(window.localStorage.getItem(localUsageKey(userId, plan)) ?? "0");
    if (used >= rule.maxGenerations) {
      return { ok: false, message: `${planLabel(plan)}プランの利用回数上限に達しました。` };
    }
    if (typeof rule.maxTotalGenerations === "number") {
      const totalUsed = Number(window.localStorage.getItem(localUsageTotalKey(userId, plan)) ?? "0");
      if (totalUsed >= rule.maxTotalGenerations) {
        return { ok: false, message: `${planLabel(plan)}プランの累計利用上限に達しました。` };
      }
    }
  } catch {
    // ignore
  }

  return { ok: true, message: "" };
}

function recordLocalUsage(userId: string, plan: Plan) {
  try {
    const used = Number(window.localStorage.getItem(localUsageKey(userId, plan)) ?? "0");
    window.localStorage.setItem(localUsageKey(userId, plan), String(used + 1));
    const totalUsed = Number(window.localStorage.getItem(localUsageTotalKey(userId, plan)) ?? "0");
    window.localStorage.setItem(localUsageTotalKey(userId, plan), String(totalUsed + 1));
  } catch {
    // ignore
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getBookCover(book: WordBook, index: number) {
  return book.coverImage || defaultCoverImages[index % defaultCoverImages.length];
}

function directionLanguage(value: string, word: Word): "english" | "japanese" {
  return value === word.english ? "english" : "japanese";
}

const printCss = `
body { margin: 0; background: white; }
#print-root { background: white; }
.print-page {
  width: 210mm;
  min-height: 297mm;
  box-sizing: border-box;
  padding: 9mm 9mm 8mm;
  background: white;
  color: #111;
  position: relative;
  font-family: "Yu Gothic","Meiryo",sans-serif;
  page-break-after: always;
}
.print-page:last-child { page-break-after: auto; }
.print-header { text-align: center; margin-bottom: 4mm; position: relative; }
.print-header h1 { margin: 0; font-size: 14pt; font-weight: 800; }
.print-date { position: absolute; right: 0; top: 0; font-size: 8pt; color: #444; }
.print-note { margin: 0 0 4mm; text-align: center; font-size: 8.5pt; color: #92400e; }
.print-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
.print-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 8pt; line-height: 1.18; }
.print-table th, .print-table td { border: .6pt solid #111; padding: 0; vertical-align: middle; overflow: hidden; }
.print-table th { height: 8mm; font-weight: 800; text-align: center; }
.print-table td { height: 9.2mm; }
.p-no { width: 10%; text-align: center; }
.p-word { width: 26%; }
.p-meaning { width: 64%; }
.p-fit { box-sizing: border-box; width: 100%; height: 100%; padding: .8mm 1mm; display: flex; align-items: center; overflow: hidden; overflow-wrap: anywhere; word-break: break-word; }
.p-center { justify-content: center; }
.p-text { display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden; -webkit-line-clamp: 2; line-clamp: 2; }
.p-text.one { -webkit-line-clamp: 1; line-clamp: 1; }
.p-red { color: #dc2626; font-weight: 800; }
.p-blank { display: inline-block; width: 100%; border-bottom: 1.2pt solid #111; min-width: 22mm; }
.print-info { margin-top: 6mm; display: flex; gap: 4mm; align-items: flex-end; }
.print-info-item { flex: 0 0 28mm; border-bottom: .7pt solid #111; padding-bottom: 1mm; font-size: 8pt; }
.print-info-item.name { flex: 1 1 auto; }
.print-footer { margin-top: 6mm; display: grid; grid-template-columns: 1fr 1fr 1fr; font-size: 7.5pt; color: #555; }
.print-footer span:nth-child(2) { text-align: center; }
.print-footer span:nth-child(3) { text-align: right; }
.print-watermark {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: rotate(-24deg);
  font-size: 28pt;
  font-weight: 900;
  color: rgba(37,99,235,.08);
  pointer-events: none;
}
@media print {
  @page { size: A4 portrait; margin: 0; }
  body { margin: 0 !important; background: white !important; }
}
`;

function buildPrintHtml({
  title,
  words,
  type,
  showPageNo,
  direction,
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
  userEmail,
}: {
  title: string;
  words: Word[];
  type: PdfType;
  showPageNo: boolean;
  direction: Direction;
  plan: Plan;
  printStyle: PrintStyle;
  includeWatermark: boolean;
  showRecordFields: boolean;
  showClassField: boolean;
  showNumberField: boolean;
  showNameField: boolean;
  studentClass: string;
  studentNumber: string;
  studentName: string;
  includeDate: boolean;
  generatedAt: Date;
  userEmail: string;
}) {
  const pageSize = 50;
  const visibleWords = plan === "free" ? words.slice(0, pageSize) : words;
  const pages: Word[][] = [];
  for (let i = 0; i < visibleWords.length; i += pageSize) {
    pages.push(visibleWords.slice(i, i + pageSize));
  }

  const makeQuestion = (word: Word) => {
    if (direction === "ja-en" || direction === "spelling") {
      return { question: word.japanese, answer: word.english };
    }
    return { question: word.english, answer: word.japanese };
  };

  const formatStyledText = (value: string, language: "english" | "japanese") => {
    const shouldBlank =
      (printStyle === "blank-english" && language === "english") ||
      (printStyle === "blank-japanese" && language === "japanese");
    const shouldRed =
      (printStyle === "red-english" && language === "english") ||
      (printStyle === "red-japanese" && language === "japanese");

    if (shouldBlank) return `<span class="p-blank"></span>`;
    if (shouldRed) return `<span class="p-red">${escapeHtml(value)}</span>`;
    return escapeHtml(value);
  };

  const watermark = includeWatermark || plan === "free"
    ? plan === "free"
      ? "FREE"
      : userEmail || "Vocab Print Pro"
    : "";

  const infoFields = [
    showRecordFields && showClassField ? `<div class="print-info-item"><strong>クラス</strong> ${escapeHtml(studentClass)}</div>` : "",
    showRecordFields && showNumberField ? `<div class="print-info-item"><strong>番号</strong> ${escapeHtml(studentNumber)}</div>` : "",
    showRecordFields && showNameField ? `<div class="print-info-item name"><strong>氏名</strong> ${escapeHtml(studentName)}</div>` : "",
  ].filter(Boolean).join("");

  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><style>${printCss}</style></head><body><div id="print-root">${
    pages.map((pageWords, pageIndex) => {
      const left = pageWords.slice(0, 25);
      const right = pageWords.slice(25, 50);
      const renderTable = (items: Word[]) => `
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
              const leftText = type === "list"
                ? formatStyledText(word.english, "english")
                : formatStyledText(qa.question, directionLanguage(qa.question, word));
              const rightText = type === "list"
                ? formatStyledText(word.japanese, "japanese")
                : type === "answer"
                  ? formatStyledText(qa.answer, directionLanguage(qa.answer, word))
                  : "";
              return `
                <tr>
                  <td class="p-no"><div class="p-fit p-center"><span class="p-text one">${escapeHtml(String(word.no))}</span></div></td>
                  <td class="p-word"><div class="p-fit"><span class="p-text">${leftText}</span></div></td>
                  <td class="p-meaning"><div class="p-fit"><span class="p-text">${rightText}</span></div></td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      `;

      return `
        <section class="print-page">
          ${watermark ? `<div class="print-watermark">${escapeHtml(watermark)}</div>` : ""}
          <div class="print-header">
            <h1>${escapeHtml(title)}</h1>
            ${includeDate ? `<div class="print-date">${escapeHtml(formatPrintDate(generatedAt))}</div>` : ""}
          </div>
          ${plan === "free" ? `<p class="print-note">Free版は1ページまでです。</p>` : ""}
          <div class="print-grid">
            ${renderTable(left)}
            ${renderTable(right)}
          </div>
          ${infoFields ? `<div class="print-info">${infoFields}</div>` : ""}
          <div class="print-footer">
            <span></span>
            <span>${showPageNo ? `${pageIndex + 1}/${pages.length}` : ""}</span>
            <span>Created by Vocab Print Pro</span>
          </div>
        </section>
      `;
    }).join("")
  }</div></body></html>`;
}

export default function Home() {
  const supabase = useMemo(() => createClient(), []);
  const previewIframeRef = useRef<HTMLIFrameElement>(null);

  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>("user");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const [plan, setPlan] = useState<Plan>("free");
  const [books, setBooks] = useState<WordBook[]>([]);
  const [booksLoaded, setBooksLoaded] = useState(false);
  const [bookId, setBookId] = useState("");
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

  useEffect(() => {
    if (!supabase) {
      setMessage("Supabase環境変数が未設定です。ログイン機能は無効ですが、公開画面の確認はできます。");
      return;
    }

    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      setUser(data.user ?? null);
      if (data.user) {
        const cached = readCachedPlan(data.user.id);
        if (cached) setPlan(cached);
      }
    }

    loadUser();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        const cached = readCachedPlan(session.user.id);
        if (cached) setPlan(cached);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [supabase]);

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
      const response = await fetch("/api/wordbooks/official", { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      const wordbooks = Array.isArray(result.wordbooks) ? result.wordbooks : [];
      const normalized: WordBook[] = wordbooks
        .filter((book) => book && typeof book.title === "string" && Array.isArray(book.words))
        .map((book) => ({
          id: String(book.id),
          title: String(book.title),
          level:
            book.requiredPlan === "teacher"
              ? "Teacher"
              : book.requiredPlan === "personal"
                ? "Personal"
                : "Official",
          requiredPlan: normalizePlan(book.requiredPlan),
          coverImage: typeof book.coverImage === "string" ? book.coverImage : null,
          description: typeof book.description === "string" ? book.description : "",
          words: book.words.map((word: { no?: number; english?: string; japanese?: string; unit?: string | null }, index: number) => ({
            no: Number(word.no) || index + 1,
            english: word.english ?? "",
            japanese: word.japanese ?? "",
            unit: word.unit ?? null,
          })),
        }));

      if (normalized.length > 0) {
        setBooks(normalized);
        setBookId(normalized[0].id);
      }
      setBooksLoaded(true);
    }

    loadOfficialWordbooks().catch(() => {
      setBooksLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!supabase || !user) {
      setPlan("free");
      setRole("user");
      return;
    }

    let cancelled = false;

    async function syncProfile() {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (token) {
        const response = await fetch("/api/me/profile", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = await response.json().catch(() => ({}));
        if (!cancelled && response.ok && result.profile?.plan) {
          const nextPlan = normalizePlan(result.profile.plan);
          setPlan(nextPlan);
          setRole(result.profile.role === "admin" ? "admin" : "user");
          writeCachedPlan(user.id, nextPlan);
          return;
        }
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("plan, role")
        .eq("id", user.id)
        .maybeSingle();

      if (!cancelled && profile) {
        const nextPlan = normalizePlan(profile.plan);
        setPlan(nextPlan);
        setRole(profile.role === "admin" ? "admin" : "user");
        writeCachedPlan(user.id, nextPlan);
      }
    }

    syncProfile();
    return () => {
      cancelled = true;
    };
  }, [supabase, user]);

  const featuredBooks = useMemo(() => books.slice(0, 6), [books]);
  const selectedBook = useMemo(() => books.find((book) => book.id === bookId) ?? books[0] ?? null, [books, bookId]);
  const locked = selectedBook ? planRank(plan) < planRank(selectedBook.requiredPlan) : false;

  const outputWords = useMemo(() => {
    if (!selectedBook) return [];
    const total = selectedBook.words.length;
    const start = Math.min(Math.max(1, Number(startNo) || 1), total || 1);
    const end = Math.min(Math.max(start, Number(endNo) || total), total || start);
    let list = selectedBook.words.slice(start - 1, end);
    if (random) list = [...list].sort(() => Math.random() - 0.5);
    const safeCount = Math.max(1, Math.min(Number(count) || list.length, list.length || 1));
    return list.slice(0, safeCount);
  }, [selectedBook, startNo, endNo, count, random]);

  function pickBook(nextBookId: string) {
    const nextBook = books.find((book) => book.id === nextBookId);
    if (!nextBook) return;
    setBookId(nextBookId);
    setStartNo(1);
    setEndNo(nextBook.words.length);
    setCount(Math.min(nextBook.words.length, 50));
    document.getElementById("pdf-builder")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleAuth() {
    setMessage("");

    if (!supabase) {
      setMessage("Supabase環境変数が未設定です。");
      return;
    }

    if (!email || !password) {
      setMessage("メールアドレスとパスワードを入力してください。");
      return;
    }

    if (authMode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setMessage(error.message);
        return;
      }
      if (data.user) {
        await supabase.from("profiles").upsert({ id: data.user.id, email, plan: "free" });
      }
      setMessage("登録が完了しました。確認メールが届いたらログインしてください。");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("ログインしました。");
  }

  async function logout() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setRole("user");
    setPlan("free");
    setMessage("ログアウトしました。");
  }

  async function startCheckout(targetPlan: Exclude<Plan, "free">) {
    if (plan === targetPlan) {
      setMessage("現在利用中のプランです。");
      return;
    }
    if (!configuredPlans[targetPlan]) {
      setMessage(`${targetPlan === "teacher" ? "Teacher" : "Personal"}プランのStripe設定が未完了です。`);
      return;
    }
    if (!supabase || !user) {
      setMessage("先にログインしてください。");
      return;
    }

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setMessage("ログインセッションを確認できませんでした。");
      return;
    }

    const response = await fetch("/api/stripe/create-checkout-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ plan: targetPlan }),
    });
    const result = await response.json().catch(() => ({}));
    if (result.url) {
      window.location.href = result.url;
      return;
    }
    setMessage(result.error ?? "チェックアウトページを開けませんでした。");
  }

  async function openBillingPortal() {
    if (!supabase || !user) {
      setMessage("先にログインしてください。");
      return;
    }
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setMessage("ログインセッションを確認できませんでした。");
      return;
    }
    const response = await fetch("/api/stripe/create-portal-session", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await response.json().catch(() => ({}));
    if (result.url) {
      window.location.href = result.url;
      return;
    }
    setMessage(result.error ?? "請求情報ページを開けませんでした。");
  }

  async function savePdfHistory(wordCount: number) {
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
          wordCount,
          wordbookId: selectedBook && isUuid(selectedBook.id) ? selectedBook.id : null,
        }),
      });
    } catch {
      // ignore
    }
  }

  async function runPrint(words: Word[], sourceTitle: string, sourceLabel: string) {
    if (!user) {
      alert("印刷するにはログインが必要です。");
      return;
    }
    if (!supabase) {
      alert("Supabaseの設定が未完了です。");
      return;
    }

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (token) {
      const response = await fetch("/api/usage/check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ wordCount: words.length }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.plan) {
        const nextPlan = normalizePlan(result.plan);
        setPlan(nextPlan);
        writeCachedPlan(user.id, nextPlan);
      } else if (response.status !== 401) {
        const fallback = checkLocalUsage(user.id, plan, words.length);
        if (!fallback.ok) {
          alert(result.message ?? fallback.message);
          return;
        }
      }
    } else {
      const fallback = checkLocalUsage(user.id, plan, words.length);
      if (!fallback.ok) {
        alert(fallback.message);
        return;
      }
    }

    const now = new Date();
    const title = pdfTitle.trim() || `${sourceTitle} ${type === "list" ? "一覧" : type === "test" ? "問題" : "解答"}`;
    const html = buildPrintHtml({
      title,
      words,
      type,
      showPageNo,
      direction,
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
      userEmail: user.email ?? "",
    });

    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;visibility:hidden;";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!doc) {
      iframe.remove();
      alert("印刷プレビューを開けませんでした。");
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();
    iframe.contentWindow?.focus();
    setTimeout(() => {
      iframe.contentWindow?.print();
      setTimeout(() => iframe.remove(), 60000);
    }, 300);

    setPdfMessage("印刷ダイアログが開きます。");
    setHistory((prev) => [`${formatPrintDate(now)}・${sourceLabel} / ${type} / ${words.length}語`, ...prev].slice(0, 20));
    recordLocalUsage(user.id, plan);
    await savePdfHistory(words.length);
  }

  async function printPdf() {
    if (!selectedBook) {
      alert("単語帳を選択してください。");
      return;
    }
    if (locked) {
      alert("この単語帳は有料プラン用です。Personal以上に変更してください。");
      return;
    }
    const words = plan === "free" ? outputWords.slice(0, 50) : outputWords;
    await runPrint(words, selectedBook.title, selectedBook.title);
  }

  async function printPastedPdf() {
    const words = parsePastedWords(pasteText);
    if (words.length === 0) {
      alert("number / english / japanese の3列データを入力してください。");
      return;
    }
    const limited = plan === "free" ? words.slice(0, 50) : words;
    await runPrint(limited, "貼り付け単語帳", "Excel/CSV貼り付け");
  }

  async function addCustomBook() {
    if (!user) {
      alert("単語帳として保存するにはログインが必要です。");
      return;
    }
    if (plan === "free") {
      alert("単語帳の保存はPersonal以上のプランで利用できます。");
      return;
    }
    const words = parsePastedWords(pasteText);
    if (words.length === 0) {
      alert("number / english / japanese の3列データを入力してください。");
      return;
    }
    const customBook: WordBook = {
      id: `custom-${Date.now()}`,
      title: "自作単語帳",
      level: "Custom",
      requiredPlan: "free",
      description: "貼り付けデータから作成した単語帳です。",
      coverImage: defaultCoverImages[0],
      words,
    };
    setBooks((prev) => [customBook, ...prev]);
    setBookId(customBook.id);
    setStartNo(1);
    setEndNo(words.length);
    setCount(Math.min(words.length, 50));
  }

  async function handleWordFile(file: File) {
    const name = file.name.toLowerCase();
    try {
      if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        const buffer = await file.arrayBuffer();
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, blankrows: false });
        setPasteText(rows.map((row) => [row[0] ?? "", row[1] ?? "", row[2] ?? ""].join("\t")).join("\n"));
        return;
      }
      if (name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt")) {
        setPasteText(await file.text());
        return;
      }
      alert("対応形式は CSV / TSV / TXT / Excel(.xlsx) です。");
    } catch {
      alert("ファイルの読み込みに失敗しました。");
    }
  }

  useEffect(() => {
    if (!showPreview || !previewIframeRef.current) return;
    const doc = previewIframeRef.current.contentDocument;
    if (!doc) return;
    const title = pdfTitle.trim() || `${selectedBook?.title ?? "単語帳"} ${type === "list" ? "一覧" : type === "test" ? "問題" : "解答"}`;
    const words = plan === "free" ? outputWords.slice(0, 50) : outputWords;
    const html = buildPrintHtml({
      title,
      words,
      type,
      showPageNo,
      direction,
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
      generatedAt: new Date(),
      userEmail: user?.email ?? "",
    });
    doc.open();
    doc.write(html);
    doc.close();
  }, [
    showPreview,
    previewIframeRef,
    pdfTitle,
    selectedBook,
    outputWords,
    type,
    showPageNo,
    direction,
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
    user,
  ]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <section className="mx-auto max-w-6xl px-5 py-8">
        <div className="rounded-3xl bg-gradient-to-br from-blue-600 to-slate-900 p-5 text-white shadow-sm sm:p-8">
          <h1 className="text-2xl font-black leading-tight sm:text-4xl">
            単語帳を選ぶだけで、
            <br />
            小テストPDFを自動生成。
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-blue-50 sm:mt-4">
            単語データを貼り付けて、一覧・問題・解答の3種類のA4 PDFをすぐに作成。英検・受験・資格試験のプリント作成に使えます。
          </p>
        </div>

        <section className="mt-6 rounded-3xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-blue-700">みんなの単語帳</p>
              <h2 className="text-xl font-black text-slate-900 sm:text-2xl">使いたい単語帳をすぐに選んで印刷</h2>
              <p className="mt-1 text-sm text-slate-500">カードをクリックすると単語帳が選択されます。</p>
            </div>
            <Link href="/wordbooks" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">
              みんなの単語帳を見る
            </Link>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {featuredBooks.map((book, index) => (
              <button
                key={book.id}
                type="button"
                onClick={() => pickBook(book.id)}
                className={`overflow-hidden rounded-3xl border text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                  book.id === bookId ? "border-blue-500 ring-2 ring-blue-200" : "border-slate-200"
                }`}
              >
                <div className="relative h-40 w-full bg-slate-100">
                  <img src={getBookCover(book, index)} alt={book.title} className="h-full w-full object-cover" />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/80 to-transparent p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-full bg-white/90 px-2.5 py-1 text-xs font-bold text-slate-800">
                        {planLabel(book.requiredPlan)}
                      </span>
                      <span className="rounded-full bg-blue-500/90 px-2.5 py-1 text-xs font-bold text-white">
                        {book.words.length} words
                      </span>
                    </div>
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="text-lg font-black text-slate-900">{book.title}</h3>
                  <p className="mt-1 text-sm font-bold text-blue-700">{book.level}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">この単語帳で一覧・問題・解答PDFを作成できます。</p>
                </div>
              </button>
            ))}
          </div>
        </section>

        {!user && (
          <section id="auth" className="mt-6 rounded-3xl border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black">ログイン / 会員登録</h2>
            <p className="mt-1 text-sm text-slate-500">ログインすると作成履歴の保存や、有料プランの利用ができます。</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setAuthMode("login")} className={`rounded-xl px-4 py-2 text-sm font-bold ${authMode === "login" ? "bg-blue-600 text-white" : "bg-slate-100"}`}>ログイン</button>
              <button onClick={() => setAuthMode("signup")} className={`rounded-xl px-4 py-2 text-sm font-bold ${authMode === "signup" ? "bg-blue-600 text-white" : "bg-slate-100"}`}>新規登録</button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="メールアドレス" className="rounded-xl border px-3 py-2" disabled={!supabase} />
              <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="パスワード" type="password" className="rounded-xl border px-3 py-2" disabled={!supabase} />
            </div>
            <button onClick={handleAuth} className="mt-4 rounded-2xl bg-blue-600 px-5 py-3 font-black text-white hover:bg-blue-700 disabled:bg-slate-300" disabled={!supabase}>
              {authMode === "login" ? "ログインする" : "新規登録する"}
            </button>
          </section>
        )}

        {user && (
          <section className="mt-6 rounded-3xl border bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-emerald-700">ログイン中</p>
                <p className="mt-1 text-sm text-slate-600">{user.email}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href="/wordbooks" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">単語帳ライブラリ</Link>
                <Link href="/pricing" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">料金プラン</Link>
                {role === "admin" && <Link href="/admin" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">管理者画面</Link>}
                <button onClick={openBillingPortal} className="rounded-xl border bg-white px-4 py-2 text-sm font-bold" disabled={plan === "free"}>請求情報</button>
                <button onClick={logout} className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">ログアウト</button>
              </div>
            </div>
          </section>
        )}

        {(message || pdfMessage) && (
          <div className="mt-6 space-y-2">
            {message && <p className="rounded-2xl bg-slate-100 p-4 text-sm text-slate-700">{message}</p>}
            {pdfMessage && <p className="rounded-2xl bg-blue-50 p-4 text-sm font-bold text-blue-700">{pdfMessage}</p>}
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[420px_1fr]">
          <section id="pdf-builder" className="rounded-3xl border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black">単語テストを作成</h2>

            <label className="mt-4 block text-sm font-bold">PDFタイトル（任意）</label>
            <input value={pdfTitle} onChange={(event) => setPdfTitle(event.target.value)} placeholder="空欄なら自動でタイトルを付けます" className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />

            <label className="mt-4 block text-sm font-bold">単語帳</label>
            {!booksLoaded ? (
              <div className="mt-1 rounded-xl border px-3 py-3 text-slate-400">読み込み中...</div>
            ) : (
              <select value={bookId} onChange={(event) => setBookId(event.target.value)} className="mt-1 w-full rounded-xl border px-3 py-3 text-base">
                {books.map((book) => (
                  <option key={book.id} value={book.id}>
                    {book.title} {book.requiredPlan === "teacher" ? "（Teacher）" : book.requiredPlan === "personal" ? "（Pro）" : ""}
                  </option>
                ))}
              </select>
            )}

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <NumberInput label="開始" value={startNo} onChange={setStartNo} />
              <NumberInput label="終了" value={endNo} onChange={setEndNo} />
              <NumberInput label="問題数" value={count} onChange={setCount} />
            </div>

            <label className="mt-4 block text-sm font-bold">出力形式</label>
            <select value={type} onChange={(event) => setType(event.target.value as PdfType)} className="mt-1 w-full rounded-xl border px-3 py-2">
              <option value="list">一覧PDF</option>
              <option value="test">問題PDF</option>
              <option value="answer">解答PDF</option>
            </select>

            <label className="mt-4 block text-sm font-bold">出題方向</label>
            <select value={direction} onChange={(event) => setDirection(event.target.value as Direction)} className="mt-1 w-full rounded-xl border px-3 py-2">
              <option value="en-ja">英語 → 日本語</option>
              <option value="ja-en">日本語 → 英語</option>
              <option value="spelling">スペルテスト</option>
            </select>

            <label className="mt-4 flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={random} onChange={(event) => setRandom(event.target.checked)} />
              ランダム順
            </label>

            <label className="mt-2 flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={showPageNo} onChange={(event) => setShowPageNo(event.target.checked)} />
              ページ番号を表示
            </label>

            <details className="mt-4 rounded-2xl border bg-slate-50 p-4">
              <summary className="cursor-pointer list-none text-sm font-black text-slate-700">詳細設定</summary>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-bold">文字の見せ方</label>
                  <select value={printStyle} onChange={(event) => setPrintStyle(event.target.value as PrintStyle)} className="mt-1 w-full rounded-xl border px-3 py-2">
                    <option value="standard">標準</option>
                    <option value="blank-english">英語を空欄にする</option>
                    <option value="blank-japanese">日本語を空欄にする</option>
                    <option value="red-english">英語を赤字にする</option>
                    <option value="red-japanese">日本語を赤字にする</option>
                  </select>
                </div>

                <label className="flex items-center gap-2 text-sm font-bold">
                  <input type="checkbox" checked={includeWatermark} onChange={(event) => setIncludeWatermark(event.target.checked)} />
                  透かしを入れる
                </label>

                <div>
                  <label className="block text-sm font-bold">記入欄を表示</label>
                  <label className="mt-2 flex items-center gap-2 font-bold">
                    <input type="checkbox" checked={showRecordFields} onChange={(event) => setShowRecordFields(event.target.checked)} />
                    記入欄を出す
                  </label>
                  <div className="mt-2 grid gap-2 rounded-xl border bg-white p-3 text-sm">
                    <label className="flex items-center gap-2 font-bold">
                      <input type="checkbox" checked={showClassField} disabled={!showRecordFields} onChange={(event) => setShowClassField(event.target.checked)} />
                      クラス
                    </label>
                    <label className="flex items-center gap-2 font-bold">
                      <input type="checkbox" checked={showNumberField} disabled={!showRecordFields} onChange={(event) => setShowNumberField(event.target.checked)} />
                      番号
                    </label>
                    <label className="flex items-center gap-2 font-bold">
                      <input type="checkbox" checked={showNameField} disabled={!showRecordFields} onChange={(event) => setShowNameField(event.target.checked)} />
                      氏名
                    </label>
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-3">
                  <div>
                    <label className="block text-sm font-bold">クラスの値</label>
                    <input value={studentClass} onChange={(event) => setStudentClass(event.target.value)} placeholder="例: 2年A組" disabled={!showRecordFields || !showClassField} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold">番号の値</label>
                    <input value={studentNumber} onChange={(event) => setStudentNumber(event.target.value)} placeholder="例: 12" disabled={!showRecordFields || !showNumberField} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold">氏名の値</label>
                    <input value={studentName} onChange={(event) => setStudentName(event.target.value)} placeholder="例: 山田 太郎" disabled={!showRecordFields || !showNameField} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm font-bold">
                  <input type="checkbox" checked={includeDate} onChange={(event) => setIncludeDate(event.target.checked)} />
                  日付を入れる
                </label>
              </div>
            </details>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={printPdf} className="flex-1 rounded-2xl bg-blue-600 px-4 py-4 text-base font-black text-white hover:bg-blue-700 sm:py-3 sm:text-sm">
                単語テストを印刷
              </button>
              <button type="button" onClick={() => setShowPreview(true)} className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 font-black text-blue-700 hover:bg-blue-100 sm:py-3">
                プレビュー
              </button>
            </div>

            {locked && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-700">この単語帳はPro用です。Personal以上にすると使えます。</p>}
          </section>

          <section className="rounded-3xl border bg-white p-5 shadow-sm" onCopy={(event) => event.preventDefault()}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black">単語リスト</h2>
                <p className="text-sm text-slate-500">
                  {selectedBook?.title ?? "単語帳"} / {outputWords.length}語
                </p>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">{selectedBook?.level ?? ""}</span>
            </div>

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

            <div className="mt-6 rounded-2xl bg-slate-50 p-4">
              <h3 className="font-black">作成履歴</h3>
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
          </section>
        </div>

        <section className="mt-6 rounded-3xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black">貼り付けから単語テストを作成</h2>
              <p className="mt-1 text-sm text-slate-500">
                Excel / CSVの3列データをそのまま貼り付けて、上の設定を使ってPDF化できます。
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">単語帳として保存も可能</span>
          </div>

          <label
            className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center hover:border-blue-400"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files?.[0];
              if (file) void handleWordFile(file);
            }}
          >
            <span className="text-sm font-bold text-slate-700">ファイルから読み込み</span>
            <span className="text-xs text-slate-500">CSV / TSV / TXT / Excel(.xlsx) をドラッグ＆ドロップ、またはクリックして選択</span>
            <input
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,.xls"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleWordFile(file);
                event.target.value = "";
              }}
            />
          </label>

          <textarea value={pasteText} onChange={(event) => setPasteText(event.target.value)} className="mt-3 h-40 w-full rounded-2xl border p-4 font-mono text-sm" />

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button type="button" onClick={printPastedPdf} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
              このまま単語テストを印刷
            </button>
            <button type="button" onClick={addCustomBook} className="rounded-xl border bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
              単語帳として登録{plan === "free" ? "（Pro）" : ""}
            </button>
          </div>

          <p className="mt-2 text-xs text-slate-500">
            英語 / 日本語 / スペルテスト、空欄や赤字の設定は上のPDF設定がそのまま使えます。
          </p>
        </section>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <PlanCard title="Free" price="¥0" text="1日2回・1ページまで。累計10回まで使える無料プラン。" current={plan === "free"} />
          <PlanCard
            title="Personal"
            price="¥780/月"
            text="7日無料トライアル。保存・履歴対応、月300回まで使える本命プラン。"
            onClick={plan === "personal" ? undefined : () => startCheckout("personal")}
            disabled={plan !== "personal" && !configuredPlans.personal}
            current={plan === "personal"}
          />
          <PlanCard
            title="Teacher"
            price="¥2,980/月"
            text="先生・塾向け。クラス配布や一括作成に対応予定。"
            onClick={plan === "teacher" ? undefined : () => startCheckout("teacher")}
            disabled={plan !== "teacher" && !configuredPlans.teacher}
            current={plan === "teacher"}
          />
        </div>
      </section>

      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="flex max-h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <h2 className="text-lg font-black">印刷プレビュー</h2>
                <p className="text-sm text-slate-500">見た目を確認してから印刷できます。</p>
              </div>
              <button type="button" onClick={() => setShowPreview(false)} className="rounded-xl border px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">
                閉じる
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-slate-100 p-4">
              <iframe ref={previewIframeRef} title="print-preview" className="mx-auto h-[1123px] w-[794px] max-w-full rounded-2xl border bg-white shadow-sm" />
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t px-5 py-4">
              <button type="button" onClick={() => setShowPreview(false)} className="rounded-2xl border px-4 py-3 text-sm font-black text-slate-600 hover:bg-slate-50">
                閉じる
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPreview(false);
                  void printPdf();
                }}
                className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-700"
              >
                この設定で印刷
              </button>
            </div>
          </div>
        </div>
      )}
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
      ) : onClick ? (
        <button
          onClick={onClick}
          disabled={disabled}
          className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-2 font-bold text-white hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500"
        >
          {disabled ? "Stripe設定確認中" : "このプランで始める"}
        </button>
      ) : null}
    </div>
  );
}
