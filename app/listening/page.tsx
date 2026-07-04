"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatMeaning } from "@/lib/meaning";

type SourceTab = "official" | "my" | "paste";
type ListeningVoiceMode = "en-only" | "en-ja" | "ja-en";
type MeaningMode = "all" | "main";
type Word = { no: number; english: string; japanese: string; unit?: string | null };
type Wordbook = {
  id: string;
  title: string;
  description?: string;
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

function getListeningPlaceholder(word: Word | null, title: string) {
  return `https://dummyimage.com/900x540/e2e8f0/334155&text=${encodeURIComponent(
    word?.english || title || "Listening",
  )}`;
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
  const [pasteText, setPasteText] = useState(
    "number\tenglish\tjapanese\n1\tapple\tりんご\n2\tbook\t本\n3\tstudy\t勉強する",
  );
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(20);
  const [listeningIndex, setListeningIndex] = useState(0);
  const [listeningRepeat, setListeningRepeat] = useState(1);
  const [listeningGapMs, setListeningGapMs] = useState(1200);
  const [listeningVoiceMode, setListeningVoiceMode] = useState<ListeningVoiceMode>("en-ja");
  const [meaningMode, setMeaningMode] = useState<MeaningMode>("main");
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState("");
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const source = params.get("source");
    const id = params.get("id");
    if (source === "my") setTab("my");
    if (source === "paste") setTab("paste");
    if (source === "official" && id) setOfficialId(id);
    if (source === "my" && id) setMyBookId(id);
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem(PASTE_STORAGE_KEY);
    if (saved) setPasteText(saved);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(PASTE_STORAGE_KEY, pasteText);
  }, [pasteText]);

  useEffect(() => {
    async function loadOfficial() {
      const response = await fetch("/api/wordbooks/official?includeWords=1");
      const result = await response.json().catch(() => ({}));
      if (!response.ok) return;
      const books = Array.isArray(result.wordbooks) ? result.wordbooks : [];
      const mapped = books.map((book: any) => ({
        id: String(book.id),
        title: book.title ?? "単語帳",
        description: book.description ?? "",
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
      setMyBooks(books);
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

  const allWords = activeBook?.words ?? [];
  const totalWords = allWords.length;
  const safeStart = totalWords > 0 ? Math.min(Math.max(1, Number(rangeStart) || 1), totalWords) : 1;
  const safeEnd = totalWords > 0 ? Math.min(Math.max(safeStart, Number(rangeEnd) || totalWords), totalWords) : 1;
  const words = totalWords > 0 ? allWords.slice(safeStart - 1, safeEnd) : [];
  const currentWord = words[listeningIndex] ?? null;
  const displayCurrentMeaning = currentWord ? formatMeaning(currentWord.japanese, meaningMode) : "";

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

  function stopListening() {
    setIsListening(false);
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  useEffect(() => {
    return () => stopListening();
  }, []);

  function speakWord(word: Word) {
    if (!("speechSynthesis" in window)) {
      setError("このブラウザでは音声読み上げを利用できません。");
      return;
    }

    setError("");
    const synth = window.speechSynthesis;
    synth.cancel();

    const speakEnglish = () => {
      const utter = new SpeechSynthesisUtterance(word.english);
      utter.lang = "en-US";
      utter.rate = 0.9;
      synth.speak(utter);
    };

    const speakJapanese = () => {
      const utter = new SpeechSynthesisUtterance(formatMeaning(word.japanese, meaningMode));
      utter.lang = "ja-JP";
      utter.rate = 0.95;
      synth.speak(utter);
    };

    if (listeningVoiceMode === "ja-en") {
      speakJapanese();
      for (let i = 0; i < Math.max(1, listeningRepeat); i += 1) speakEnglish();
      return;
    }

    for (let i = 0; i < Math.max(1, listeningRepeat); i += 1) speakEnglish();
    if (listeningVoiceMode === "en-ja") speakJapanese();
  }

  function playSequence(startIndex = listeningIndex) {
    if (!words.length) return;
    setIsListening(true);
    setListeningIndex(startIndex);

    const nextWord = words[startIndex];
    if (!nextWord) {
      stopListening();
      return;
    }

    speakWord(nextWord);

    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      const nextIndex = startIndex + 1;
      if (nextIndex >= words.length) {
        stopListening();
        return;
      }
      playSequence(nextIndex);
    }, Math.max(800, listeningGapMs + listeningRepeat * 1300));
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
                <select
                  value={officialId}
                  onChange={(e) => setOfficialId(e.target.value)}
                  className="mt-2 w-full rounded-xl border px-3 py-3 text-sm"
                >
                  {officialBooks.map((book) => (
                    <option key={book.id} value={book.id}>
                      {book.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {tab === "my" && (
              <div>
                <label className="block text-sm font-bold">マイ単語帳を選ぶ</label>
                <select
                  value={myBookId}
                  onChange={(e) => setMyBookId(e.target.value)}
                  className="mt-2 w-full rounded-xl border px-3 py-3 text-sm"
                >
                  {myBooks.map((book) => (
                    <option key={book.id} value={book.id}>
                      {book.title}
                    </option>
                  ))}
                </select>
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

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-bold">英語の反復回数</label>
                    <select
                      value={listeningRepeat}
                      onChange={(e) => setListeningRepeat(Number(e.target.value))}
                      className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                    >
                      <option value={1}>1回</option>
                      <option value={2}>2回</option>
                      <option value={3}>3回</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold">単語ごとの間隔</label>
                    <select
                      value={listeningGapMs}
                      onChange={(e) => setListeningGapMs(Number(e.target.value))}
                      className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                    >
                      <option value={900}>短め</option>
                      <option value={1200}>標準</option>
                      <option value={1800}>ゆっくり</option>
                    </select>
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
              <img
                src={getListeningPlaceholder(currentWord, activeBook?.title ?? "Listening")}
                alt={currentWord?.english ?? activeBook?.title ?? "Listening"}
                className="h-64 w-full object-cover"
              />
            </div>

            <div className="rounded-2xl border bg-slate-50 p-4">
              <p className="text-xs font-bold text-slate-500">{activeBook?.title ?? "単語帳"}</p>
              <p className="mt-2 text-sm text-slate-500">{activeBook?.description ?? "選んだ範囲の単語を順番に読み上げます。"}</p>

              {currentWord ? (
                <>
                  <p className="mt-4 text-2xl font-black text-slate-900">{currentWord.english}</p>
                  <p className="mt-3 text-lg font-bold text-slate-700">{displayCurrentMeaning}</p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span className="rounded-full bg-white px-3 py-1 font-bold">{listeningIndex + 1} / {words.length}</span>
                    <span className="rounded-full bg-white px-3 py-1 font-bold">範囲 {safeStart} - {safeEnd}</span>
                    <span className="rounded-full bg-white px-3 py-1 font-bold">{modeLabel(listeningVoiceMode)}</span>
                    <span className="rounded-full bg-white px-3 py-1 font-bold">{meaningMode === "main" ? "意味: メイン" : "意味: 全部"}</span>
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
              {isListening ? "この位置から再開" : "連続再生"}
            </button>
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
