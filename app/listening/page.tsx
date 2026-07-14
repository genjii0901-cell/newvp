"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatMeaning } from "@/lib/meaning";
import { primeSpeechVoices, speakText } from "@/lib/speech";

type SourceTab = "official" | "my" | "paste";
type ListeningVoiceMode = "en-only" | "en-ja" | "ja-en";
type MeaningMode = "all" | "main";
type StudyMode = "listen" | "test";
type Word = { no: number; english: string; japanese: string; unit?: string | null };
type Wordbook = {
  id: string;
  title: string;
  description?: string;
  coverImage?: string | null;
  requiredPlan?: "free" | "personal" | "teacher";
  wordCount?: number;
  words: Word[];
};

const PASTE_STORAGE_KEY = "vpp-pasted-words";

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
        unit: null,
      };
    })
    .filter((word) => word.english && word.japanese);
}

function getListeningPlaceholder(title: string) {
  return `https://dummyimage.com/900x540/e2e8f0/64748b&text=${encodeURIComponent(title || "Vocab Print Pro")}`;
}

function getBookCover(book: Wordbook | null | undefined) {
  return book?.coverImage || getListeningPlaceholder(book?.title ?? "Vocab Print Pro");
}

function isJapaneseOnlyText(value: string) {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(value) && !/[A-Za-z]/.test(value);
}

function rateValue(speed: number, base: number) {
  return Math.max(0.5, Math.min(1.4, Math.round(base * speed * 100) / 100));
}

function modeLabel(mode: ListeningVoiceMode) {
  if (mode === "en-only") return "英語のみ";
  if (mode === "ja-en") return "日本語 → 英語";
  return "英語 → 日本語";
}

export default function ListeningPage() {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<SourceTab>("official");
  const [officialBooks, setOfficialBooks] = useState<Wordbook[]>([]);
  const [myBooks, setMyBooks] = useState<Wordbook[]>([]);
  const [officialId, setOfficialId] = useState("");
  const [myBookId, setMyBookId] = useState("");
  const [officialPickerOpen, setOfficialPickerOpen] = useState(false);
  const [myPickerOpen, setMyPickerOpen] = useState(false);
  const [pasteText, setPasteText] = useState(
    "number\tenglish\tjapanese\n1\tapple\tりんご\n2\tbook\t本\n3\tstudy\t勉強する",
  );
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(20);
  const [listeningIndex, setListeningIndex] = useState(0);
  const [listeningRepeat, setListeningRepeat] = useState(1);
  const [listeningGapMs, setListeningGapMs] = useState(1200);
  const [listeningSpeed, setListeningSpeed] = useState(1);
  const [listeningVoiceMode, setListeningVoiceMode] = useState<ListeningVoiceMode>("en-ja");
  const [meaningMode, setMeaningMode] = useState<MeaningMode>("main");
  const [studyMode, setStudyMode] = useState<StudyMode>("listen");
  const [showTestMeaning, setShowTestMeaning] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [markedKeys, setMarkedKeys] = useState<Set<string>>(new Set());
  const [loadingWordsId, setLoadingWordsId] = useState("");
  const [error, setError] = useState("");
  const timerRef = useRef<number | null>(null);
  const speechRunRef = useRef({ stopped: false, id: 0 });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const source = params.get("source");
    const id = params.get("id");
    if (params.get("import") === "1") {
      const stored = sessionStorage.getItem("vpp-import-words");
      if (stored) {
        try {
          const { title, words } = JSON.parse(stored) as { title?: string; words?: Word[] };
          if (Array.isArray(words) && words.length > 0) {
            const text = [
              "number\tenglish\tjapanese",
              ...words.map((word, index) => `${word.no || index + 1}\t${word.english}\t${word.japanese}`),
            ].join("\n");
            setPasteText(text);
            setTab("paste");
            setRangeStart(1);
            setRangeEnd(Math.min(words.length, 20));
            sessionStorage.removeItem("vpp-import-words");
            window.history.replaceState(null, "", "/listening");
            if (title) document.title = `${title} 聞き流し | Vocab Print Pro`;
            return;
          }
        } catch {
          // Ignore broken temporary data and fall back to normal loading.
        }
      }
    }
    if (source === "my") setTab("my");
    if (source === "paste") setTab("paste");
    if (source === "official" && id) setOfficialId(id);
    if (source === "my" && id) setMyBookId(id);
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem(PASTE_STORAGE_KEY);
    if (saved) setPasteText(saved);
    primeSpeechVoices();
  }, []);

  useEffect(() => {
    window.localStorage.setItem(PASTE_STORAGE_KEY, pasteText);
  }, [pasteText]);

  useEffect(() => {
    async function loadOfficial() {
      const response = await fetch("/api/wordbooks/official");
      const result = await response.json().catch(() => ({}));
      if (!response.ok) return;
      const books = Array.isArray(result.wordbooks) ? result.wordbooks : [];
      const mapped = books.map((book: any) => ({
        id: String(book.id),
        title: book.title ?? "単語帳",
        description: book.description ?? "",
        coverImage: book.coverImage ?? null,
        requiredPlan: book.requiredPlan ?? "free",
        wordCount: typeof book.wordCount === "number" ? book.wordCount : (book.words ?? []).length,
        words: (book.words ?? []).map((word: any, index: number) => ({
          no: Number(word.no) || index + 1,
          english: word.english ?? "",
          japanese: word.japanese ?? "",
          unit: word.unit ?? null,
        })),
      }));
      setOfficialBooks(mapped);
      setOfficialId((current) => current || mapped[0]?.id || "");
    }

    loadOfficial();
  }, []);

  useEffect(() => {
    async function loadSelectedOfficialWords() {
      if (tab !== "official" || !officialId) return;
      const current = officialBooks.find((book) => book.id === officialId);
      if (!current || current.words.length > 0 || loadingWordsId === officialId) return;

      setLoadingWordsId(officialId);
      try {
        const response = await fetch(`/api/wordbooks/official?id=${encodeURIComponent(officialId)}&includeWords=1`);
        const result = await response.json().catch(() => ({}));
        const rawBook = Array.isArray(result.wordbooks)
          ? result.wordbooks.find((book: { id?: string | number }) => String(book.id) === officialId)
          : null;
        const words = Array.isArray(rawBook?.words)
          ? rawBook.words
              .filter((word: { english?: string; japanese?: string }) => word.english && word.japanese)
              .map((word: { no?: number; english?: string; japanese?: string; unit?: string | null }, index: number) => ({
                no: Number(word.no) || index + 1,
                english: word.english ?? "",
                japanese: word.japanese ?? "",
                unit: word.unit ?? null,
              }))
          : [];
        setOfficialBooks((prev) =>
          prev.map((book) =>
            book.id === officialId
              ? { ...book, words, wordCount: typeof rawBook?.wordCount === "number" ? rawBook.wordCount : words.length }
              : book,
          ),
        );
      } finally {
        setLoadingWordsId((current) => (current === officialId ? "" : current));
      }
    }

    loadSelectedOfficialWords();
  }, [officialBooks, officialId, loadingWordsId, tab]);

  useEffect(() => {
    async function loadMine() {
      if (!supabase) return;
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return;
      const response = await fetch("/api/me/wordbooks", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) return;
      const books = Array.isArray(result.wordbooks) ? result.wordbooks : [];
      setMyBooks(books.map((book: any) => ({ ...book, coverImage: book.coverImage ?? null })));
      setMyBookId((current) => current || books[0]?.id || "");
    }

    loadMine();
  }, [supabase]);

  const pastedBook = useMemo<Wordbook>(
    () => ({
      id: "paste",
      title: "貼り付けデータ",
      description: "Excel / CSV / テキストをそのまま聞き流しに使えます。",
      wordCount: parsePastedWords(pasteText).length,
      words: parsePastedWords(pasteText),
    }),
    [pasteText],
  );

  const activeBook = useMemo(() => {
    if (tab === "my") return myBooks.find((book) => book.id === myBookId) ?? null;
    if (tab === "paste") return pastedBook;
    return officialBooks.find((book) => book.id === officialId) ?? null;
  }, [myBookId, myBooks, officialBooks, officialId, pastedBook, tab]);
  const selectedOfficialBook = officialBooks.find((book) => book.id === officialId) ?? officialBooks[0] ?? null;
  const selectedMyBook = myBooks.find((book) => book.id === myBookId) ?? myBooks[0] ?? null;

  const allWords = activeBook?.words ?? [];
  const totalWords = allWords.length;
  const safeStart = totalWords > 0 ? Math.min(Math.max(1, Number(rangeStart) || 1), totalWords) : 1;
  const safeEnd = totalWords > 0 ? Math.min(Math.max(safeStart, Number(rangeEnd) || totalWords), totalWords) : 1;
  const words = totalWords > 0 ? allWords.slice(safeStart - 1, safeEnd) : [];
  const currentWord = words[listeningIndex] ?? null;
  const currentWordKey = currentWord ? `${currentWord.no}-${currentWord.english}` : "";
  const displayCurrentMeaning = currentWord ? formatMeaning(currentWord.japanese, meaningMode) : "";
  const markStorageKey = activeBook ? `vpp-word-marks:${activeBook.id}` : "";

  useEffect(() => {
    const total = Math.max(1, allWords.length);
    setRangeStart(1);
    setRangeEnd(Math.min(total, 20));
    setListeningIndex(0);
  }, [activeBook?.id, allWords.length]);

  useEffect(() => {
    stopListening();
    setListeningIndex(0);
  }, [tab, officialId, myBookId, pasteText, safeStart, safeEnd]);

  useEffect(() => {
    if (!markStorageKey || typeof window === "undefined") return;
    const saved = window.localStorage.getItem(markStorageKey);
    if (!saved) {
      setMarkedKeys(new Set());
      return;
    }
    try {
      const parsed = JSON.parse(saved);
      setMarkedKeys(new Set(Array.isArray(parsed) ? parsed.map(String) : []));
    } catch {
      setMarkedKeys(new Set());
    }
  }, [markStorageKey]);

  useEffect(() => {
    if (!markStorageKey || typeof window === "undefined") return;
    window.localStorage.setItem(markStorageKey, JSON.stringify(Array.from(markedKeys)));
  }, [markStorageKey, markedKeys]);

  function stopListening() {
    setIsListening(false);
    setShowTestMeaning(true);
    speechRunRef.current.stopped = true;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function toggleMarked(word: Pick<Word, "no" | "english">) {
    const key = `${word.no}-${word.english}`;
    setMarkedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  useEffect(() => {
    return () => stopListening();
  }, []);

  async function speakWord(word: Word, signal = speechRunRef.current) {
    if (!("speechSynthesis" in window)) {
      setError("このブラウザでは音声読み上げを利用できません。");
      return;
    }

    setError("");
    window.speechSynthesis.cancel();
    const japanesePair = isJapaneseOnlyText(word.english);
    const speakEnglish = () =>
      speakText(word.english, {
        preferred: japanesePair ? "japanese" : "english",
        rate: rateValue(listeningSpeed, japanesePair ? 0.95 : 0.9),
        voiceHint: japanesePair ? "male" : undefined,
        signal,
      });
    const speakJapanese = () =>
      speakText(formatMeaning(word.japanese, meaningMode), {
        preferred: "japanese",
        rate: rateValue(listeningSpeed, 0.95),
        voiceHint: japanesePair ? "female" : undefined,
        signal,
      });

    if (listeningVoiceMode === "ja-en") {
      await speakJapanese();
      for (let i = 0; i < Math.max(1, listeningRepeat); i += 1) await speakEnglish();
      return;
    }

    for (let i = 0; i < Math.max(1, listeningRepeat); i += 1) await speakEnglish();
    if (listeningVoiceMode === "en-ja") await speakJapanese();
  }

  async function playSequence(startIndex = listeningIndex) {
    if (!words.length) return;
    const run = { stopped: false, id: speechRunRef.current.id + 1 };
    speechRunRef.current = run;
    setIsListening(true);
    setListeningIndex(startIndex);
    setShowTestMeaning(studyMode === "listen");

    if (timerRef.current) window.clearTimeout(timerRef.current);

    for (let index = startIndex; index < words.length; index += 1) {
      if (run.stopped || speechRunRef.current.id !== run.id) return;
      const nextWord = words[index];
      setListeningIndex(index);

      if (studyMode === "test") {
        const japanesePair = isJapaneseOnlyText(nextWord.english);
        setShowTestMeaning(false);
        await speakText(nextWord.english, {
          preferred: japanesePair ? "japanese" : "english",
          rate: rateValue(listeningSpeed, japanesePair ? 0.95 : 0.9),
          voiceHint: japanesePair ? "male" : undefined,
          signal: run,
        });
        await new Promise((resolve) => {
          timerRef.current = window.setTimeout(resolve, Math.max(700, listeningGapMs));
        });
        if (run.stopped || speechRunRef.current.id !== run.id) return;
        setShowTestMeaning(true);
        await speakText(nextWord.english, {
          preferred: japanesePair ? "japanese" : "english",
          rate: rateValue(listeningSpeed, japanesePair ? 0.95 : 0.9),
          voiceHint: japanesePair ? "male" : undefined,
          signal: run,
        });
        await speakText(formatMeaning(nextWord.japanese, meaningMode), {
          preferred: "japanese",
          rate: rateValue(listeningSpeed, 0.95),
          voiceHint: japanesePair ? "female" : undefined,
          signal: run,
        });
      } else {
        setShowTestMeaning(true);
        await speakWord(nextWord, run);
      }

      if (index < words.length - 1) {
        await new Promise((resolve) => {
          timerRef.current = window.setTimeout(resolve, Math.max(300, listeningGapMs));
        });
      }
    }

    if (!run.stopped && speechRunRef.current.id === run.id) stopListening();
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-blue-700">Vocab Print Pro</p>
          <h1 className="text-2xl font-black text-slate-900">聞き流し</h1>
          <p className="mt-1 text-sm text-slate-500">
            単語帳を選んで、範囲を決めて、そのまま音声学習に使えます。
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/wordbooks" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">
            単語帳へ
          </Link>
          <Link href="/" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">
            単語テスト作成へ
          </Link>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {[
          { id: "official", label: "みんなの単語帳" },
          { id: "my", label: "マイ単語帳" },
          { id: "paste", label: "CSV / 貼り付け" },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id as SourceTab)}
            className={`rounded-full px-4 py-2 text-sm font-bold ${
              tab === item.id ? "bg-blue-600 text-white" : "border bg-white text-slate-700"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
        <section className="rounded-3xl border bg-white p-5 shadow-sm">
          <div className="space-y-5">
            {tab === "official" && (
              <div>
                <label className="block text-sm font-bold">みんなの単語帳を選ぶ</label>
                <div className="relative mt-2">
                  <button
                    type="button"
                    onClick={() => setOfficialPickerOpen((open) => !open)}
                    className="flex w-full items-center gap-3 rounded-2xl border bg-white px-3 py-3 text-left shadow-sm hover:bg-slate-50"
                  >
                    {selectedOfficialBook ? <img src={getBookCover(selectedOfficialBook)} alt="" className="h-9 w-9 flex-none rounded-lg object-cover" /> : null}
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">{selectedOfficialBook?.title ?? "単語帳を選択"}</span>
                    <span className="text-xs font-black text-slate-400">{officialPickerOpen ? "閉じる" : "選ぶ"}</span>
                  </button>
                  {officialPickerOpen && (
                    <div className="absolute left-0 right-0 z-30 mt-2 max-h-72 space-y-2 overflow-auto rounded-2xl border bg-slate-50 p-2 shadow-xl">
                      {officialBooks.map((book) => (
                        <button
                          key={book.id}
                          type="button"
                          onClick={() => {
                            setOfficialId(book.id);
                            setOfficialPickerOpen(false);
                          }}
                          className={`flex w-full items-center gap-3 rounded-xl border px-2 py-2 text-left transition ${
                            officialId === book.id ? "border-blue-400 bg-blue-50" : "border-transparent bg-white hover:bg-slate-50"
                          }`}
                        >
                          <img src={getBookCover(book)} alt="" className="h-9 w-9 flex-none rounded-lg object-cover" />
                          <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">{book.title}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === "my" && (
              <div>
                <label className="block text-sm font-bold">マイ単語帳を選ぶ</label>
                <div className="relative mt-2">
                  <button
                    type="button"
                    onClick={() => setMyPickerOpen((open) => !open)}
                    className="flex w-full items-center gap-3 rounded-2xl border bg-white px-3 py-3 text-left shadow-sm hover:bg-slate-50"
                  >
                    {selectedMyBook ? <img src={getBookCover(selectedMyBook)} alt="" className="h-9 w-9 flex-none rounded-lg object-cover" /> : null}
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">{selectedMyBook?.title ?? "単語帳を選択"}</span>
                    <span className="text-xs font-black text-slate-400">{myPickerOpen ? "閉じる" : "選ぶ"}</span>
                  </button>
                  {myPickerOpen && (
                    <div className="absolute left-0 right-0 z-30 mt-2 max-h-72 space-y-2 overflow-auto rounded-2xl border bg-slate-50 p-2 shadow-xl">
                      {myBooks.map((book) => (
                        <button
                          key={book.id}
                          type="button"
                          onClick={() => {
                            setMyBookId(book.id);
                            setMyPickerOpen(false);
                          }}
                          className={`flex w-full items-center gap-3 rounded-xl border px-2 py-2 text-left transition ${
                            myBookId === book.id ? "border-blue-400 bg-blue-50" : "border-transparent bg-white hover:bg-slate-50"
                          }`}
                        >
                          <img src={getBookCover(book)} alt="" className="h-9 w-9 flex-none rounded-lg object-cover" />
                          <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">{book.title}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {myBooks.length === 0 && (
                  <p className="mt-3 text-sm text-slate-500">マイ単語帳がまだない場合は、単語帳ページから追加できます。</p>
                )}
              </div>
            )}

            {tab === "paste" && (
              <div>
                <label className="block text-sm font-bold">CSV / 貼り付けデータ</label>
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  className="mt-2 h-56 w-full rounded-2xl border p-4 font-mono text-sm"
                />
              </div>
            )}

            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-bold tracking-wide text-slate-500">再生範囲</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-bold">開始</label>
                  <input
                    type="number"
                    value={rangeStart}
                    min={1}
                    max={Math.max(1, totalWords)}
                    onChange={(e) => setRangeStart(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold">終了</label>
                  <input
                    type="number"
                    value={rangeEnd}
                    min={1}
                    max={Math.max(1, totalWords)}
                    onChange={(e) => setRangeEnd(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-bold tracking-wide text-slate-500">読み上げ設定</p>
              <div className="mt-3 grid gap-3">
                <div className="grid gap-2">
                  <label className="text-sm font-bold">学習モード</label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {([
                      { id: "listen", title: "聞き流し", help: "英語と日本語をテンポよく確認します。" },
                      { id: "test", title: "テスト再生", help: "英語だけ出して考える時間を作り、その後に答えを表示します。" },
                    ] as Array<{ id: StudyMode; title: string; help: string }>).map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => {
                          setStudyMode(mode.id);
                          setShowTestMeaning(mode.id === "listen");
                        }}
                        className={`rounded-2xl border px-4 py-3 text-left ${
                          studyMode === mode.id ? "border-blue-400 bg-blue-50" : "bg-white hover:bg-slate-50"
                        }`}
                      >
                        <p className="font-bold text-slate-900">{mode.title}</p>
                        <p className="mt-1 text-xs text-slate-500">{mode.help}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-bold">読み上げパターン</label>
                  <div className="grid gap-2">
                    {(["en-ja", "en-only", "ja-en"] as ListeningVoiceMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setListeningVoiceMode(mode)}
                        className={`rounded-2xl border px-4 py-3 text-left ${
                          listeningVoiceMode === mode ? "border-blue-400 bg-blue-50" : "bg-white hover:bg-slate-50"
                        }`}
                      >
                        <p className="font-bold text-slate-900">{modeLabel(mode)}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {mode === "en-ja" && "英語を読んだあとに日本語を読みます。"}
                          {mode === "en-only" && "英語だけをテンポよく確認できます。"}
                          {mode === "ja-en" && "日本語を見てから英語を確認できます。"}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-2xl border bg-white p-4">
                    <label className="flex items-center justify-between text-sm font-bold">
                      英語の反復回数
                      <span className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">{listeningRepeat}回</span>
                    </label>
                    <select
                      value={listeningRepeat}
                      onChange={(e) => setListeningRepeat(Number(e.target.value))}
                      className="mt-3 w-full rounded-xl border bg-white px-3 py-2 text-sm font-bold"
                    >
                      <option value={1}>1回</option>
                      <option value={2}>2回</option>
                      <option value={3}>3回</option>
                    </select>
                    <p className="mt-2 text-[11px] font-bold text-slate-400">英語だけを何回読むか</p>
                  </div>
                  <div className="rounded-2xl border bg-white p-4">
                    <label className="flex items-center justify-between text-sm font-bold">
                      単語ごとの間隔
                      <span className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">{(listeningGapMs / 1000).toFixed(1)}秒</span>
                    </label>
                    <input
                      type="range"
                      min={300}
                      max={2500}
                      step={100}
                      value={listeningGapMs}
                      onChange={(e) => setListeningGapMs(Number(e.target.value))}
                      className="mt-3 w-full accent-blue-600"
                    />
                    <div className="mt-1 flex justify-between text-[11px] font-bold text-slate-400">
                      <span>短い</span>
                      <span>ゆっくり</span>
                    </div>
                  </div>
                  <div className="rounded-2xl border bg-white p-4">
                    <label className="flex items-center justify-between text-sm font-bold">
                      読み上げ速度
                      <span className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">x{listeningSpeed.toFixed(2)}</span>
                    </label>
                    <input
                      type="range"
                      min={0.7}
                      max={1.35}
                      step={0.05}
                      value={listeningSpeed}
                      onChange={(e) => setListeningSpeed(Number(e.target.value))}
                      className="mt-3 w-full accent-blue-600"
                    />
                    <div className="mt-1 flex justify-between text-[11px] font-bold text-slate-400">
                      <span>ゆっくり</span>
                      <span>速い</span>
                    </div>
                  </div>
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-bold">意味の表示</label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(["main", "all"] as MeaningMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setMeaningMode(mode)}
                        className={`rounded-2xl border px-4 py-3 text-left ${
                          meaningMode === mode ? "border-blue-400 bg-blue-50" : "bg-white hover:bg-slate-50"
                        }`}
                      >
                        <p className="font-bold text-slate-900">{mode === "main" ? "メインの意味だけ" : "意味を全部表示"}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {mode === "main"
                            ? "最初に使いたい意味を優先して短く表示します。"
                            : "登録されている意味をそのまま全部表示します。"}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
            <div className="overflow-hidden rounded-2xl border bg-slate-50">
              <div className="relative h-52 w-full overflow-hidden sm:h-64">
                <img
                  src={getBookCover(activeBook)}
                  alt={activeBook?.title ?? "Listening"}
                  className="h-full w-full object-cover opacity-70"
                />
                <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-slate-900/35 to-transparent p-5 text-white">
                  <p className="text-xs font-black tracking-[0.18em] opacity-80">LISTENING</p>
                  <p className="mt-1 line-clamp-2 text-2xl font-black leading-tight">
                    {activeBook?.title ?? "単語帳を選択"}
                  </p>
                  {currentWord?.unit ? <p className="mt-1 text-xs font-bold opacity-80">{currentWord.unit}</p> : null}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-slate-50 p-4">
              <p className="text-xs font-bold text-slate-500">{activeBook?.title ?? "単語帳"}</p>
              <p className="mt-2 text-sm text-slate-500">{activeBook?.description ?? "選んだ範囲の単語を順番に読み上げます。"}</p>

              {currentWord ? (
                <>
                  <div className="relative mt-4 flex min-h-[220px] flex-col justify-center rounded-2xl bg-white p-5 shadow-sm">
                    <button
                      type="button"
                      onClick={() => toggleMarked(currentWord)}
                      className={`absolute right-4 top-4 rounded-full px-3 py-2 text-2xl leading-none transition ${
                        markedKeys.has(currentWordKey) ? "bg-amber-100 text-amber-500" : "bg-slate-100 text-slate-300 hover:text-amber-400"
                      }`}
                      aria-label={markedKeys.has(currentWordKey) ? "復習マークを外す" : "復習マークを付ける"}
                    >
                      {markedKeys.has(currentWordKey) ? "★" : "☆"}
                    </button>
                    <p className="text-xs font-black tracking-[0.18em] text-blue-600">
                      {studyMode === "test" && !showTestMeaning ? "QUESTION" : "ANSWER"}
                    </p>
                    <p className="mt-3 break-words text-4xl font-black leading-tight text-slate-950 sm:text-5xl">
                      {currentWord.english}
                    </p>
                    <div className="mt-5 min-h-[72px]">
                      {studyMode === "test" && !showTestMeaning ? (
                        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500">
                          意味を思い出してから、少し待つと答えが表示されます。
                        </p>
                      ) : (
                        <p className="line-clamp-3 break-words text-2xl font-black leading-relaxed text-slate-800">
                          {displayCurrentMeaning}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span className="rounded-full bg-white px-3 py-1 font-bold">{listeningIndex + 1} / {words.length}</span>
                    <span className="rounded-full bg-white px-3 py-1 font-bold">範囲 {safeStart} - {safeEnd}</span>
                    <span className="rounded-full bg-white px-3 py-1 font-bold">{studyMode === "test" ? "テスト再生" : "聞き流し"}</span>
                    <span className="rounded-full bg-white px-3 py-1 font-bold">{modeLabel(listeningVoiceMode)}</span>
                    <span className="rounded-full bg-white px-3 py-1 font-bold">{meaningMode === "main" ? "意味: メイン" : "意味: 全部"}</span>
                    {markedKeys.size > 0 ? <span className="rounded-full bg-amber-100 px-3 py-1 font-bold text-amber-800">復習 {markedKeys.size}語</span> : null}
                  </div>
                </>
              ) : (
                <p className="mt-4 text-sm text-slate-500">単語帳や範囲を選ぶと、ここに再生中の単語が表示されます。</p>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => playSequence(listeningIndex)}
              disabled={!currentWord}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300"
            >
              {isListening ? "この位置から再開" : studyMode === "test" ? "テスト再生を開始" : "連続再生"}
            </button>
            {studyMode === "test" && currentWord && (
              <button
                onClick={() => setShowTestMeaning((current) => !current)}
                className="rounded-xl border bg-white px-4 py-2 text-sm font-bold text-slate-700"
              >
                {showTestMeaning ? "答えを隠す" : "答えを表示"}
              </button>
            )}
            <button
              onClick={() => currentWord && speakWord(currentWord)}
              disabled={!currentWord}
              className="rounded-xl border bg-white px-4 py-2 text-sm font-bold text-slate-700 disabled:bg-slate-100"
            >
              この単語だけ再生
            </button>
            <button
              onClick={stopListening}
              className="rounded-xl border bg-white px-4 py-2 text-sm font-bold text-slate-700"
            >
              停止
            </button>
            {activeBook && (
              <Link
                href={`/?book=${encodeURIComponent(activeBook.id)}`}
                className="rounded-xl border bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                単語テスト作成で開く
              </Link>
            )}
          </div>

          {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

          <div className="mt-4 max-h-[420px] overflow-auto rounded-2xl border">
            <div className="grid gap-2 p-2">
              {words.map((word, index) => (
                <button
                  key={`${word.no}-${word.english}`}
                  type="button"
                  onClick={() => setListeningIndex(index)}
                  className={`rounded-xl border px-3 py-3 text-left ${
                    index === listeningIndex ? "border-blue-400 bg-blue-50" : "bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-slate-400">{word.no}</p>
                      <p className="mt-1 font-bold text-slate-900">{word.english}</p>
                      <p className="mt-1 text-sm text-slate-600 line-clamp-2">{formatMeaning(word.japanese, meaningMode)}</p>
                    </div>
                    {word.unit ? (
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-500">{word.unit}</span>
                    ) : null}
                  </div>
                </button>
              ))}
              {words.length === 0 && (
                <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">
                  まだ再生できる単語がありません。単語帳を選ぶか、CSV を貼り付けてください。
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
