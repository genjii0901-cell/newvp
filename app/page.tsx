"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  buildPrintHtml,
  type Direction,
  type PdfType,
  type PrintStyle,
} from "@/lib/print/builder";

type Plan = "free" | "personal" | "teacher";
type PaidPlan = "personal" | "teacher";

type Word = {
  no: number;
  english: string;
  japanese: string;
  unit?: string | null;
};

type OfficialBook = {
  id: string;
  title: string;
  description: string;
  coverImage: string | null;
  requiredPlan: Plan;
  visibility: string;
  level: string;
  words: Word[];
};

const TEACHER_PUBLIC_ENABLED = false;

function normalizePlan(value: unknown): Plan {
  return value === "personal" || value === "teacher" ? value : "free";
}

function planRank(plan: Plan) {
  if (plan === "teacher") return 2;
  if (plan === "personal") return 1;
  return 0;
}

function planLabel(plan: Plan) {
  if (plan === "teacher") return "Teacher";
  if (plan === "personal") return "Personal";
  return "Free";
}

function parseWords(text: string): Word[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line, index) => !(index === 0 && /english/i.test(line) && /japanese/i.test(line)))
    .map((line, index) => {
      const cells = line.includes("\t") ? line.split("\t") : line.split(",");
      return {
        no: Number(cells[0]) || index + 1,
        english: (cells[1] ?? "").trim(),
        japanese: (cells[2] ?? "").trim(),
        unit: (cells[3] ?? "").trim() || null,
      };
    })
    .filter((word) => word.english && word.japanese);
}

function shuffle<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5);
}

export default function HomePage() {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [plan, setPlan] = useState<Plan>("free");
  const [books, setBooks] = useState<OfficialBook[]>([]);
  const [booksLoaded, setBooksLoaded] = useState(false);
  const [selectedBookId, setSelectedBookId] = useState("");
  const [useCustomWords, setUseCustomWords] = useState(false);
  const [customTitle, setCustomTitle] = useState("自作単語帳");
  const [customPaste, setCustomPaste] = useState(
    "number,english,japanese,unit\n1,apple,りんご,Unit 1\n2,book,本,Unit 1\n3,study,勉強する,Unit 1",
  );
  const [title, setTitle] = useState("");
  const [pdfType, setPdfType] = useState<PdfType>("list");
  const [direction, setDirection] = useState<Direction>("en-ja");
  const [printStyle, setPrintStyle] = useState<PrintStyle>("standard");
  const [showPageNo, setShowPageNo] = useState(true);
  const [random, setRandom] = useState(false);
  const [showRecordFields, setShowRecordFields] = useState(true);
  const [includeDate, setIncludeDate] = useState(true);
  const [studentClass, setStudentClass] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [studentName, setStudentName] = useState("");
  const [startNo, setStartNo] = useState(1);
  const [endNo, setEndNo] = useState(50);
  const [questionCount, setQuestionCount] = useState(50);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [fileMsg, setFileMsg] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [configuredPlans, setConfiguredPlans] = useState<Record<PaidPlan, boolean>>({
    personal: false,
    teacher: false,
  });

  const selectedBook = books.find((book) => book.id === selectedBookId) ?? null;
  const customWords = useMemo(() => parseWords(customPaste), [customPaste]);
  const activeWords = useCustomWords ? customWords : selectedBook?.words ?? [];
  const activeRequiredPlan = useCustomWords ? "free" : selectedBook?.requiredPlan ?? "free";
  const locked = planRank(plan) < planRank(activeRequiredPlan);

  const filteredWords = useMemo(() => {
    const base = activeWords.filter((word) => word.no >= startNo && word.no <= endNo);
    const next = random ? shuffle(base) : base;
    const limited = plan === "free" ? next.slice(0, Math.min(questionCount, 50)) : next.slice(0, questionCount);
    return limited;
  }, [activeWords, startNo, endNo, random, questionCount, plan]);

  useEffect(() => {
    async function loadBooks() {
      const response = await fetch("/api/wordbooks/official");
      const result = await response.json().catch(() => ({}));
      const nextBooks = Array.isArray(result.wordbooks) ? result.wordbooks : [];
      setBooks(nextBooks);
      setSelectedBookId(nextBooks[0]?.id ?? "");
      setBooksLoaded(true);
    }

    loadBooks();
  }, []);

  useEffect(() => {
    fetch("/api/stripe/config-status")
      .then((response) => response.json())
      .then((result) => {
        setConfiguredPlans({
          personal: Boolean(result.personalConfigured),
          teacher: Boolean(result.teacherConfigured && result.teacherPublicEnabled),
        });
      })
      .catch(() => {
        setConfiguredPlans({ personal: false, teacher: false });
      });
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;

    async function boot() {
      const { data } = await client.auth.getUser();
      setUser(data.user ?? null);

      if (data.user) {
        const { data: sessionData } = await client.auth.getSession();
        const token = sessionData.session?.access_token;
        if (token) {
          const response = await fetch("/api/me/profile", {
            headers: { Authorization: `Bearer ${token}` },
          });
          const result = await response.json().catch(() => ({}));
          if (response.ok && result.profile?.plan) {
            setPlan(normalizePlan(result.profile.plan));
          }
        }
      }
    }

    boot();

    const { data } = client.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setPlan("free");
        return;
      }
      const token = session.access_token;
      const response = await fetch("/api/me/profile", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.profile?.plan) {
        setPlan(normalizePlan(result.profile.plan));
      }
    });

    return () => data.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    async function completeCheckout() {
      const params = new URLSearchParams(window.location.search);
      const checkout = params.get("checkout");
      const sessionId = params.get("session_id");
      if (checkout !== "success" || !sessionId || !supabase) return;

      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;

      const response = await fetch("/api/stripe/complete-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionId }),
      });

      const result = await response.json().catch(() => ({}));
      if (response.ok && result.profile?.plan) {
        setPlan(normalizePlan(result.profile.plan));
        setMessage("Personalプランへの登録が完了しました。");
      } else if (result.error) {
        setMessage(result.error);
      }

      const url = new URL(window.location.href);
      url.searchParams.delete("checkout");
      url.searchParams.delete("session_id");
      window.history.replaceState({}, "", url.toString());
    }

    completeCheckout();
  }, [supabase]);

  async function signInOrUp() {
    if (!supabase) {
      setMessage("Supabaseが未設定です。");
      return;
    }

    if (authMode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setMessage(error ? `ログイン失敗: ${error.message}` : "ログインしました。");
      return;
    }

    const { error } = await supabase.auth.signUp({ email, password });
    setMessage(error ? `登録失敗: ${error.message}` : "登録メールを確認してください。");
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setPlan("free");
    setMessage("ログアウトしました。");
  }

  // CSV / TSV / TXT / Excel(.xlsx) ファイルを読み込み、自作単語帳の入力欄へ展開する。
  async function handleWordFile(file: File) {
    setFileMsg("");
    const name = file.name.toLowerCase();
    try {
      if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        const buffer = await file.arrayBuffer();
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, blankrows: false });
        const text = rows
          .filter((row) => Array.isArray(row) && row.length >= 2)
          .map((row) => [row[0] ?? "", row[1] ?? "", row[2] ?? "", row[3] ?? ""].join("\t"))
          .join("\n");
        setCustomPaste(text);
      } else if (name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt")) {
        setCustomPaste(await file.text());
      } else {
        setFileMsg("対応形式は CSV / TSV / TXT / Excel(.xlsx) です。");
        return;
      }
      setUseCustomWords(true);
      setCustomTitle(file.name.replace(/\.[^.]+$/, "") || "自作単語帳");
      setFileMsg(`読み込みました：${file.name}`);
    } catch {
      setFileMsg("ファイルを読み込めませんでした。形式をご確認ください。");
    }
  }

  async function startCheckout(targetPlan: PaidPlan) {
    if (targetPlan === "teacher" && !TEACHER_PUBLIC_ENABLED) {
      setMessage("Teacherプランは現在準備中です。公開まではPersonalをご利用ください。");
      return;
    }

    if (!user || !supabase) {
      setMessage("先にログインしてください。");
      return;
    }

    if (!configuredPlans[targetPlan]) {
      setMessage("現在、本番課金の設定確認中です。");
      return;
    }

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setMessage("ログインセッションを確認できません。");
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

  async function openPortal() {
    if (!user || !supabase) {
      setMessage("先にログインしてください。");
      return;
    }
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;

    const response = await fetch("/api/stripe/create-portal-session", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await response.json().catch(() => ({}));
    if (result.url) {
      window.location.href = result.url;
      return;
    }
    setMessage(result.error ?? "請求管理ページを開けませんでした。");
  }

  async function openPrint() {
    if (!filteredWords.length) {
      setMessage("印刷する単語がありません。");
      return;
    }
    if (locked) {
      setMessage(`この単語帳は${planLabel(activeRequiredPlan)}以上で利用できます。`);
      return;
    }

    let serverPlan = plan;
    if (user && supabase) {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) {
        const usageResponse = await fetch("/api/usage/check", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ wordCount: filteredWords.length }),
        });
        const usageResult = await usageResponse.json().catch(() => ({}));
        if (!usageResponse.ok || usageResult.ok === false) {
          setMessage(usageResult.message ?? "利用制限を確認できませんでした。");
          return;
        }
        serverPlan = normalizePlan(usageResult.plan);
        setPlan(serverPlan);
      }
    }

    const sourceLabel = useCustomWords ? customTitle : selectedBook?.title ?? "単語帳";
    const printTitle =
      title.trim() || `${sourceLabel} ${pdfType === "list" ? "一覧" : pdfType === "test" ? "問題" : "解答"}`;
    const html = buildPrintHtml({
      title: printTitle,
      words: filteredWords.map((word) => ({
        no: word.no,
        english: word.english,
        japanese: word.japanese,
      })),
      type: pdfType,
      direction,
      showPageNo,
      plan: serverPlan,
      printStyle,
      includeWatermark: false,
      showRecordFields,
      showClassField: true,
      showNumberField: true,
      showNameField: true,
      studentClass,
      studentNumber,
      studentName,
      includeDate,
      generatedAt: new Date(),
      expiresAt: serverPlan === "free" ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : undefined,
    });

    sessionStorage.setItem(
      "vpp-print-job",
      JSON.stringify({
        html,
        title: printTitle,
        sourceLabel,
        createdAt: new Date().toISOString(),
      }),
    );
    window.open("/print", "_blank");

    if (user && supabase) {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) {
        await fetch("/api/usage/record", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            type: pdfType,
            wordCount: filteredWords.length,
            wordbookId: useCustomWords ? null : selectedBook?.id ?? null,
          }),
        }).catch(() => null);
      }
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-900">
      <section className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-blue-700">Vocab Print Pro</p>
            <h1 className="mt-1 text-3xl font-black">単語帳を選ぶだけで、小テストPDFを自動生成。</h1>
            <p className="mt-3 max-w-3xl text-sm text-slate-600">
              公式単語帳や自作の単語リストから、一覧・問題・解答のA4 PDFをすぐ作れます。
              まずは無料で試して、保存や履歴が必要になったら Personal に切り替えられます。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/wordbooks" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">
              公式単語帳
            </Link>
            <Link href="/pricing" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">
              料金
            </Link>
            <Link href="/account" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">
              アカウント
            </Link>
          </div>
        </header>

        {message && <p className="mt-5 rounded-2xl bg-white p-4 text-sm shadow-sm">{message}</p>}

        <div className="mt-6 grid gap-6 lg:grid-cols-[340px_1fr]">
          <aside className="space-y-4">
            <section className="rounded-3xl border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black">ログイン / 会員登録</h2>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                  {planLabel(plan)}
                </span>
              </div>
              {user ? (
                <div className="mt-4 space-y-3">
                  <p className="text-sm font-bold">{user.email}</p>
                  <div className="flex gap-2">
                    <button onClick={signOut} className="rounded-xl border px-4 py-2 text-sm font-bold">
                      ログアウト
                    </button>
                    {plan !== "free" && (
                      <button onClick={openPortal} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white">
                        請求管理
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setAuthMode("login")}
                      className={`rounded-xl px-4 py-2 text-sm font-bold ${authMode === "login" ? "bg-blue-600 text-white" : "border"}`}
                    >
                      ログイン
                    </button>
                    <button
                      onClick={() => setAuthMode("signup")}
                      className={`rounded-xl px-4 py-2 text-sm font-bold ${authMode === "signup" ? "bg-blue-600 text-white" : "border"}`}
                    >
                      新規登録
                    </button>
                  </div>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="メールアドレス"
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                  />
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    placeholder="パスワード"
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                  />
                  <button onClick={signInOrUp} className="w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white">
                    {authMode === "login" ? "ログインする" : "登録する"}
                  </button>
                </div>
              )}
            </section>

            <section className="rounded-3xl border bg-white p-5 shadow-sm">
              <h2 className="text-lg font-black">料金プラン</h2>
              <div className="mt-4 grid gap-3">
                <PlanCard title="Free" price="¥0" text="1日3回・1回50語まで。まず試す用。" />
                <PlanCard
                  title="Personal"
                  price="¥780/月"
                  text="30日無料トライアル。保存・履歴・Pro単語帳に対応。"
                  onClick={plan === "personal" ? undefined : () => startCheckout("personal")}
                  disabled={plan !== "personal" && !configuredPlans.personal}
                  current={plan === "personal"}
                />
                <PlanCard
                  title="Teacher"
                  price="¥2,980/月"
                  text="先生・塾向けプラン。現在は準備中です。"
                  onClick={() => undefined}
                  disabled
                  current={plan === "teacher"}
                  disabledText="Teacherは準備中"
                />
              </div>
            </section>
          </aside>

          <div className="space-y-6">
            <section className="rounded-3xl border bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-slate-500">公式単語帳ライブラリー</p>
                  <h2 className="text-xl font-black">使いたい単語帳をすぐに選んで印刷</h2>
                </div>
                <label className="flex items-center gap-2 text-sm font-bold">
                  <input
                    type="checkbox"
                    checked={useCustomWords}
                    onChange={(e) => setUseCustomWords(e.target.checked)}
                  />
                  Excel / CSVファイルや貼り付けで自作する
                </label>
              </div>

              {!useCustomWords ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {booksLoaded &&
                    books.map((book) => {
                      const disabled = planRank(plan) < planRank(book.requiredPlan);
                      return (
                        <button
                          key={book.id}
                          onClick={() => setSelectedBookId(book.id)}
                          className={`overflow-hidden rounded-2xl border text-left transition hover:border-blue-400 ${
                            selectedBookId === book.id ? "border-blue-500 ring-2 ring-blue-100" : ""
                          }`}
                        >
                          <div className="h-32 bg-slate-100">
                            {book.coverImage ? (
                              <img src={book.coverImage} alt={book.title} className="h-full w-full object-cover" />
                            ) : null}
                          </div>
                          <div className="p-4">
                            <div className="flex items-center gap-2">
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold">
                                {planLabel(book.requiredPlan)}
                              </span>
                              <span className="text-xs text-slate-400">{book.words.length} words</span>
                            </div>
                            <h3 className="mt-2 font-black">{book.title}</h3>
                            <p className="mt-1 text-sm text-slate-500">{book.description}</p>
                            {disabled && (
                              <p className="mt-2 text-xs font-bold text-amber-700">
                                この単語帳は {planLabel(book.requiredPlan)} 以上で使えます。
                              </p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                </div>
              ) : (
                <div className="mt-4 grid gap-3">
                  <input
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="単語帳タイトル"
                    className="rounded-xl border px-3 py-2 text-sm"
                  />
                  <label
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) handleWordFile(file);
                    }}
                    className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed px-4 py-6 text-center text-sm transition ${
                      dragOver ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-slate-50 hover:border-blue-400"
                    }`}
                  >
                    <span className="font-bold text-slate-700">ファイルから読み込み</span>
                    <span className="text-xs text-slate-500">
                      CSV / TSV / TXT / Excel(.xlsx) をドラッグ＆ドロップ、またはクリックして選択
                    </span>
                    <input
                      type="file"
                      accept=".csv,.tsv,.txt,.xlsx,.xls"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleWordFile(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {fileMsg && <p className="text-xs font-bold text-blue-700">{fileMsg}</p>}
                  <textarea
                    value={customPaste}
                    onChange={(e) => setCustomPaste(e.target.value)}
                    className="h-48 rounded-2xl border p-3 font-mono text-sm"
                  />
                  <p className="text-xs text-slate-500">
                    形式: number, english, japanese, unit（カンマ または タブ区切り。1行目の見出しは自動で除外）
                  </p>
                </div>
              )}
            </section>

            <section className="rounded-3xl border bg-white p-5 shadow-sm">
              <h2 className="text-xl font-black">単語テストを作成</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="text-sm font-bold">
                  PDFタイトル
                  <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="空欄の場合は自動生成" className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-normal" />
                </label>
                <label className="text-sm font-bold">
                  開始
                  <input type="number" value={startNo} onChange={(e) => setStartNo(Number(e.target.value))} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-normal" />
                </label>
                <label className="text-sm font-bold">
                  終了
                  <input type="number" value={endNo} onChange={(e) => setEndNo(Number(e.target.value))} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-normal" />
                </label>
                <label className="text-sm font-bold">
                  問題数
                  <input type="number" value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-normal" />
                </label>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <label className="text-sm font-bold">
                  出力形式
                  <select value={pdfType} onChange={(e) => setPdfType(e.target.value as PdfType)} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-normal">
                    <option value="list">一覧PDF</option>
                    <option value="test">問題PDF</option>
                    <option value="answer">解答PDF</option>
                  </select>
                </label>
                <label className="text-sm font-bold">
                  出題方向
                  <select value={direction} onChange={(e) => setDirection(e.target.value as Direction)} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-normal">
                    <option value="en-ja">英語 → 日本語</option>
                    <option value="ja-en">日本語 → 英語</option>
                    <option value="spelling">スペルテスト</option>
                  </select>
                </label>
                <label className="text-sm font-bold">
                  詳細設定
                  <select value={printStyle} onChange={(e) => setPrintStyle(e.target.value as PrintStyle)} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-normal">
                    <option value="standard">標準</option>
                    <option value="blank-english">英語を空欄にする</option>
                    <option value="blank-japanese">日本語を空欄にする</option>
                    <option value="red-english">英語を赤字にする</option>
                    <option value="red-japanese">日本語を赤字にする</option>
                  </select>
                </label>
              </div>

              <div className="mt-4 flex flex-wrap gap-4 text-sm font-bold">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={random} onChange={(e) => setRandom(e.target.checked)} />
                  ランダム順
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={showPageNo} onChange={(e) => setShowPageNo(e.target.checked)} />
                  ページ番号を表示
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={showRecordFields} onChange={(e) => setShowRecordFields(e.target.checked)} />
                  記入欄（クラス・番号・氏名）
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={includeDate} onChange={(e) => setIncludeDate(e.target.checked)} />
                  日付欄
                </label>
              </div>

              {showRecordFields && (
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <label className="text-sm font-bold">
                    クラス
                    <input value={studentClass} onChange={(e) => setStudentClass(e.target.value)} placeholder="空欄＝手書き用" className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-normal" />
                  </label>
                  <label className="text-sm font-bold">
                    番号
                    <input value={studentNumber} onChange={(e) => setStudentNumber(e.target.value)} placeholder="空欄＝手書き用" className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-normal" />
                  </label>
                  <label className="text-sm font-bold">
                    氏名
                    <input value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="空欄＝手書き用" className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-normal" />
                  </label>
                </div>
              )}

              <div className="mt-5 flex flex-wrap gap-3">
                <button onClick={openPrint} className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700">
                  単語テストを印刷
                </button>
                <Link href="/pricing" className="rounded-2xl border px-5 py-3 text-sm font-black">
                  プランを見る
                </Link>
              </div>

              {locked && !useCustomWords && (
                <p className="mt-3 text-sm font-bold text-amber-700">
                  この単語帳は {planLabel(activeRequiredPlan)} 用です。Personal以上にすると使えます。
                </p>
              )}
              {plan === "free" && (
                <p className="mt-3 text-xs text-slate-500">
                  Free は 1回50語・1日3回までです。PDFには透かしが入り、再利用しやすい Personal では保存と履歴が使えます。
                </p>
              )}
            </section>

            <section className="rounded-3xl border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-black">プレビュー</h2>
                <span className="text-sm text-slate-500">{filteredWords.length}語</span>
              </div>
              <div
                className="mt-4 select-none overflow-hidden rounded-2xl border"
                onCopy={(e) => e.preventDefault()}
                onCut={(e) => e.preventDefault()}
                onContextMenu={(e) => e.preventDefault()}
                style={{ WebkitUserSelect: "none", userSelect: "none" }}
              >
                <table className="w-full table-fixed border-collapse text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="w-16 border-b p-2 text-center">番号</th>
                      <th className="w-1/3 border-b p-2 text-left">単語</th>
                      <th className="border-b p-2 text-left">意味</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredWords.slice(0, 20).map((word) => (
                      <tr key={`${word.no}-${word.english}`} className="border-b last:border-0">
                        <td className="p-2 text-center text-slate-400">{word.no}</td>
                        <td className="p-2 font-bold">{word.english}</td>
                        <td className="p-2 text-slate-600">{word.japanese}</td>
                      </tr>
                    ))}
                    {!filteredWords.length && (
                      <tr>
                        <td colSpan={3} className="p-6 text-center text-slate-400">
                          単語がまだありません。
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-slate-400">
                ※プレビューはコピー防止のため選択できません。印刷／PDF出力でご利用ください。
              </p>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}

function PlanCard({
  title,
  price,
  text,
  onClick,
  disabled = false,
  current = false,
  disabledText = "このプランで始める",
}: {
  title: string;
  price: string;
  text: string;
  onClick?: () => void;
  disabled?: boolean;
  current?: boolean;
  disabledText?: string;
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
          {disabled ? disabledText : "このプランで始める"}
        </button>
      ) : null}
    </div>
  );
}
