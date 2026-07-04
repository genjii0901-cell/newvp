"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type SourceTab = "official" | "my" | "paste";
type ListeningVoiceMode = "en-only" | "en-ja" | "ja-en";
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

function getListeningPlaceholder(word: Word, title: string) {
  return `https://dummyimage.com/900x540/e2e8f0/334155&text=${encodeURIComponent(word.english || title || "Listening")}`;
}

export default function ListeningPage() {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<SourceTab>("official");
  const [officialBooks, setOfficialBooks] = useState<Wordbook[]>([]);
  const [myBooks, setMyBooks] = useState<Wordbook[]>([]);
  const [officialId, setOfficialId] = useState("");
  const [myBookId, setMyBookId] = useState("");
  const [pasteText, setPasteText] = useState("number\tenglish\tjapanese\n1\tapple\tりんご\n2\tbook\t本");
  const [listeningIndex, setListeningIndex] = useState(0);
  const [listeningRepeat, setListeningRepeat] = useState(1);
  const [listeningGapMs, setListeningGapMs] = useState(1200);
  const [listeningVoiceMode, setListeningVoiceMode] = useState<ListeningVoiceMode>("en-ja");
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
      if (!officialId && mapped[0]) setOfficialId(mapped[0].id);
    }

    loadOfficial();
  }, [officialId]);

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
      if (!myBookId && books[0]) setMyBookId(books[0].id);
    }

    loadMine();
  }, [myBookId, supabase]);

  const pastedBook = useMemo<Wordbook>(() => ({
    id: "paste",
    title: "貼り付けデータ",
    description: "Excel / CSV / 手入力からそのまま聞き流しできます。",
    wordCount: parsePastedWords(pasteText).length,
    words: parsePastedWords(pasteText),
  }), [pasteText]);

  const activeBook = useMemo(() => {
    if (tab === "my") {
      return myBooks.find((book) => book.id === myBookId) ?? null;
    }
    if (tab === "paste") return pastedBook;
    return officialBooks.find((book) => book.id === officialId) ?? null;
  }, [myBookId, myBooks, officialBooks, officialId, pastedBook, tab]);

  const words = activeBook?.words ?? [];
  const currentWord = words[listeningIndex] ?? null;

  useEffect(() => {
    setListeningIndex(0);
    setIsListening(false);
  }, [tab, officialId, myBookId, pasteText]);

  function stopListening() {
    setIsListening(false);
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
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
      setError("このブラウザでは音声読み上げが使えません。");
      return;
    }

    const synth = window.speechSynthesis;
    synth.cancel();
    const speakEnglish = () => {
      const utter = new SpeechSynthesisUtterance(word.english);
      utter.lang = "en-US";
      utter.rate = 0.9;
      synth.speak(utter);
    };
    const speakJapanese = () => {
      const utter = new SpeechSynthesisUtterance(word.japanese);
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
            みんなの単語帳、マイ単語帳、CSV貼り付けデータのどれでも聞き流しできます。
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/wordbooks" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">みんなの単語帳</Link>
          <Link href="/my-wordbooks" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">マイ単語帳</Link>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button onClick={() => setTab("official")} className={`rounded-full px-4 py-2 text-sm font-bold ${tab === "official" ? "bg-blue-600 text-white" : "border bg-white text-slate-700"}`}>みんなの単語帳</button>
        <button onClick={() => setTab("my")} className={`rounded-full px-4 py-2 text-sm font-bold ${tab === "my" ? "bg-blue-600 text-white" : "border bg-white text-slate-700"}`}>マイ単語帳</button>
        <button onClick={() => setTab("paste")} className={`rounded-full px-4 py-2 text-sm font-bold ${tab === "paste" ? "bg-blue-600 text-white" : "border bg-white text-slate-700"}`}>CSV / 貼り付け</button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
        <section className="rounded-3xl border bg-white p-5 shadow-sm">
          {tab === "official" && (
            <>
              <label className="block text-sm font-bold">みんなの単語帳を選ぶ</label>
              <select value={officialId} onChange={(e) => setOfficialId(e.target.value)} className="mt-2 w-full rounded-xl border px-3 py-3 text-sm">
                {officialBooks.map((book) => <option key={book.id} value={book.id}>{book.title}</option>)}
              </select>
            </>
          )}
          {tab === "my" && (
            <>
              <label className="block text-sm font-bold">マイ単語帳を選ぶ</label>
              <select value={myBookId} onChange={(e) => setMyBookId(e.target.value)} className="mt-2 w-full rounded-xl border px-3 py-3 text-sm">
                {myBooks.map((book) => <option key={book.id} value={book.id}>{book.title}</option>)}
              </select>
              {myBooks.length === 0 && <p className="mt-3 text-sm text-slate-500">まだマイ単語帳はありません。</p>}
            </>
          )}
          {tab === "paste" && (
            <>
              <label className="block text-sm font-bold">CSV / 貼り付けデータ</label>
              <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} className="mt-2 h-56 w-full rounded-2xl border p-4 font-mono text-sm" />
            </>
          )}

          <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            <div>
              <label className="block text-sm font-bold">読み上げパターン</label>
              <select value={listeningVoiceMode} onChange={(e) => setListeningVoiceMode(e.target.value as ListeningVoiceMode)} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm">
                <option value="en-ja">英語 → 日本語</option>
                <option value="en-only">英語のみ</option>
                <option value="ja-en">日本語 → 英語</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold">繰り返し</label>
              <select value={listeningRepeat} onChange={(e) => setListeningRepeat(Number(e.target.value))} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm">
                <option value={1}>1回</option>
                <option value={2}>2回</option>
                <option value={3}>3回</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold">単語の間隔</label>
              <select value={listeningGapMs} onChange={(e) => setListeningGapMs(Number(e.target.value))} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm">
                <option value={900}>短め</option>
                <option value={1200}>標準</option>
                <option value={1800}>ゆっくり</option>
              </select>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
            <div className="overflow-hidden rounded-2xl border bg-slate-50">
              <img
                src={currentWord ? getListeningPlaceholder(currentWord, activeBook?.title ?? "Listening") : "https://dummyimage.com/900x540/e2e8f0/334155&text=Listening"}
                alt={currentWord?.english ?? activeBook?.title ?? "listening"}
                className="h-64 w-full object-cover"
              />
            </div>
            <div className="rounded-2xl border bg-slate-50 p-4">
              <p className="text-xs font-bold text-slate-500">{activeBook?.title ?? "単語帳"}</p>
              {currentWord ? (
                <>
                  <p className="mt-2 text-2xl font-black text-slate-900">{currentWord.english}</p>
                  <p className="mt-3 text-sm text-slate-600">{currentWord.japanese}</p>
                  <p className="mt-3 text-xs text-slate-400">{listeningIndex + 1} / {words.length}</p>
                </>
              ) : (
                <p className="mt-4 text-sm text-slate-500">単語データを選ぶとここで聞き流しできます。</p>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => playSequence(listeningIndex)} disabled={!currentWord} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300">連続再生</button>
            <button onClick={() => currentWord && speakWord(currentWord)} disabled={!currentWord} className="rounded-xl border bg-white px-4 py-2 text-sm font-bold text-slate-700 disabled:bg-slate-100">今の単語だけ</button>
            <button onClick={stopListening} className="rounded-xl border bg-white px-4 py-2 text-sm font-bold text-slate-700">停止</button>
            {activeBook && (
              <Link href={tab === "my" ? `/?book=${encodeURIComponent(activeBook.id)}` : tab === "official" ? `/?book=${encodeURIComponent(activeBook.id)}` : "/"} className="rounded-xl border bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
                印刷画面で開く
              </Link>
            )}
          </div>

          {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

          <div className="mt-4 max-h-[360px] overflow-auto rounded-2xl border">
            <div className="grid gap-2 p-2">
              {words.map((word, index) => (
                <button key={`${word.no}-${word.english}`} type="button" onClick={() => setListeningIndex(index)} className={`rounded-xl border px-3 py-3 text-left ${index === listeningIndex ? "border-blue-400 bg-blue-50" : "bg-white hover:bg-slate-50"}`}>
                  <p className="text-xs font-bold text-slate-400">{word.no}</p>
                  <p className="mt-1 font-bold text-slate-900">{word.english}</p>
                  <p className="mt-1 text-sm text-slate-600 line-clamp-2">{word.japanese}</p>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
