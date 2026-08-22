"use client";

import { useEffect, useMemo, useState } from "react";
import { buildClozePrintDocument, buildOriginalClozeSentence, isClozeEligibleWord, isClozePilotBook } from "@/lib/cloze-quiz";

type QuizWord = {
  no: number;
  english: string;
  japanese: string;
  example?: string | null;
};

type Book = {
  id: string;
  title: string;
  words: QuizWord[];
};

type Direction = "en-ja" | "ja-en";
type QuestionStyle = "meaning" | "sentence";

function shuffle<T>(items: T[]) {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function mainMeaning(value: string) {
  return value
    .replace(/^[\s\d.・、;:：\-]+/, "")
    .replace(/^[([{（【].{1,14}[)\]}）】]\s*/, "")
    .split(/[;；、，・]/)[0]
    .trim() || value.trim();
}

function getSentence(word: QuizWord, bookTitle: string) {
  const explicit = word.example?.trim();
  if (explicit) return explicit;
  const english = word.english.trim();
  if (/[.!?]/.test(english) && english.split(/\s+/).length >= 4) return english;
  return isClozePilotBook(bookTitle) && isClozeEligibleWord(word) ? buildOriginalClozeSentence(word, bookTitle) : null;
}

export default function AdminQuizPanel({ books, getHeaders }: { books: Book[]; getHeaders: () => Promise<Record<string, string>> }) {
  const [bookId, setBookId] = useState("");
  const [loadedBooks, setLoadedBooks] = useState<Record<string, Book>>({});
  const [loadingBook, setLoadingBook] = useState(false);
  const [direction, setDirection] = useState<Direction>("en-ja");
  const [style, setStyle] = useState<QuestionStyle>("meaning");
  const [order, setOrder] = useState<QuizWord[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [correct, setCorrect] = useState(0);
  const [finished, setFinished] = useState(false);

  const selectedBook = loadedBooks[bookId] ?? books.find((book) => book.id === bookId) ?? null;
  useEffect(() => {
    if (!bookId || loadedBooks[bookId]?.words.length) return;
    const listed = books.find((book) => book.id === bookId);
    if (listed?.words.length) { setLoadedBooks((current) => ({ ...current, [bookId]: listed })); return; }
    setLoadingBook(true);
    void getHeaders().then((headers) => fetch(`/api/admin/all-wordbooks?includeWords=1&includeWordStats=1&id=${encodeURIComponent(bookId)}`, { headers, cache: "no-store" }))
      .then((response) => response.json())
      .then((result) => {
        const book = Array.isArray(result?.wordbooks) ? result.wordbooks.find((item: Book) => item.id === bookId) : null;
        if (book) setLoadedBooks((current) => ({ ...current, [bookId]: book }));
      })
      .finally(() => setLoadingBook(false));
  }, [bookId, books, getHeaders, loadedBooks]);
  const sentenceWords = useMemo(
    () => (selectedBook?.words ?? []).filter((word) => Boolean(getSentence(word, selectedBook?.title ?? ""))),
    [selectedBook],
  );
  const current = order[index] ?? null;
  const answer = current
    ? direction === "en-ja"
      ? mainMeaning(current.japanese)
      : current.english
    : "";
  const prompt = current
    ? style === "sentence"
      ? getSentence(current, selectedBook?.title ?? "")?.replace(current.english, "＿＿＿＿") ?? "例文データがありません"
      : direction === "en-ja"
        ? current.english
        : mainMeaning(current.japanese)
    : "";
  const choices = useMemo(() => {
    if (!current) return [];
    const values = (style === "sentence" ? sentenceWords : selectedBook?.words ?? [])
      .filter((word) => word.no !== current.no)
      .map((word) => direction === "en-ja" ? mainMeaning(word.japanese) : word.english)
      .filter((value) => value && value !== answer);
    return shuffle([answer, ...Array.from(new Set(values)).slice(0, 3)]);
  }, [answer, current, direction, selectedBook, sentenceWords, style]);

  function start() {
    const source = style === "sentence" ? sentenceWords : selectedBook?.words ?? [];
    if (source.length < 4) return;
    setOrder(shuffle(source));
    setIndex(0);
    setSelected(null);
    setCorrect(0);
    setFinished(false);
  }

  function next() {
    if (!current || selected === null) return;
    const nextCorrect = correct + (selected === answer ? 1 : 0);
    if (index + 1 >= order.length) {
      setCorrect(nextCorrect);
      setFinished(true);
      return;
    }
    setCorrect(nextCorrect);
    setIndex((value) => value + 1);
    setSelected(null);
  }

  function printSentenceQuiz() {
    if (!selectedBook) return;
    const html = buildClozePrintDocument(selectedBook.title, selectedBook.words, 20);
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    if (!doc) { iframe.remove(); return; }
    doc.open(); doc.write(html); doc.close();
    window.setTimeout(() => { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); window.setTimeout(() => iframe.remove(), 30_000); }, 350);
  }

  return (
    <section className="mt-6 space-y-5">
      <div>
        <h2 className="text-xl font-black text-slate-900">管理者用・単語チェック作成</h2>
        <p className="mt-1 text-sm text-slate-500">
          英検の小テストのような4択形式を、登録済み単語帳の全単語から確認できます。
        </p>
      </div>

      <div className="rounded-3xl border bg-white p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-3">
          <label className="text-sm font-black text-slate-700">
            単語帳
            <select value={bookId} onChange={(event) => { setBookId(event.target.value); setOrder([]); }} className="mt-2 w-full rounded-xl border px-3 py-3 font-bold">
              <option value="">単語帳を選択</option>
              {books.map((book) => <option key={book.id} value={book.id}>{book.title}（{book.words.length}語）</option>)}
            </select>
          </label>
          <div>
            <p className="text-sm font-black text-slate-700">出題方向</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {([["en-ja", "英語 → 日本語"], ["ja-en", "日本語 → 英語"]] as const).map(([value, label]) => (
                <button key={value} type="button" onClick={() => { setDirection(value); setOrder([]); }} className={`rounded-xl border px-3 py-3 text-xs font-black ${direction === value ? "border-blue-500 bg-blue-600 text-white" : "bg-white text-slate-700"}`}>{label}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-black text-slate-700">問題形式</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {([["meaning", "意味4択"], ["sentence", "文章の空欄"]] as const).map(([value, label]) => (
                <button key={value} type="button" onClick={() => { setStyle(value); setOrder([]); }} className={`rounded-xl border px-3 py-3 text-xs font-black ${style === value ? "border-blue-500 bg-blue-600 text-white" : "bg-white text-slate-700"}`}>{label}</button>
              ))}
            </div>
          </div>
        </div>

        {style === "sentence" && (
          <div className="mt-4 rounded-2xl bg-amber-50 p-3 text-xs font-bold leading-6 text-amber-800">
            {isClozePilotBook(selectedBook?.title ?? "")
              ? `試験対応中の単語帳です。レベルに合わせた学習用オリジナル例文を使います（対象 ${sentenceWords.length}語）。`
              : `文章の空欄問題は、例文列が登録された語だけが対象です（対象 ${sentenceWords.length}語）。`}
            {isClozePilotBook(selectedBook?.title ?? "") ? <button type="button" onClick={printSentenceQuiz} className="mt-2 block rounded-xl border border-amber-200 bg-white px-3 py-2 text-amber-900">20問の問題・解答を印刷</button> : null}
          </div>
        )}

        {!current && !finished && (
          <button type="button" onClick={start} disabled={loadingBook || !selectedBook || (style === "sentence" ? sentenceWords.length < 4 : (selectedBook?.words.length ?? 0) < 4)} className="mt-5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400">
            {loadingBook ? "単語を読み込んでいます..." : "この条件でテストを開始"}
          </button>
        )}
      </div>

      {current && !finished && (
        <div className="rounded-3xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between text-xs font-black text-slate-500">
            <span>{selectedBook?.title} ・ {index + 1} / {order.length}</span>
            <span>{correct}問正解</span>
          </div>
          <div className="mt-5 rounded-3xl bg-blue-50 p-8 text-center">
            <p className="text-xs font-black text-slate-400">No.{current.no}</p>
            <p className="mt-3 whitespace-pre-wrap text-xl font-black leading-9 text-slate-950">{prompt}</p>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {choices.map((choice) => {
              const picked = selected === choice;
              const answered = selected !== null;
              const tone = answered && choice === answer ? "border-emerald-500 bg-emerald-50 text-emerald-700" : answered && picked ? "border-red-400 bg-red-50 text-red-700" : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50";
              return <button key={choice} type="button" disabled={answered} onClick={() => setSelected(choice)} className={`rounded-2xl border px-4 py-4 text-left font-bold ${tone}`}>{choice}</button>;
            })}
          </div>
          {selected !== null && <button type="button" onClick={next} className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-3 font-black text-white">{index + 1 >= order.length ? "結果を見る" : "次の問題へ"}</button>}
        </div>
      )}

      {finished && (
        <div className="rounded-3xl border bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-black text-blue-700">テスト結果</p>
          <p className="mt-2 text-5xl font-black text-slate-950">{Math.round((correct / Math.max(order.length, 1)) * 100)}%</p>
          <p className="mt-2 text-sm font-bold text-slate-500">{correct} / {order.length}問正解</p>
          <button type="button" onClick={() => { setOrder([]); setFinished(false); }} className="mt-5 rounded-xl border px-5 py-3 text-sm font-black text-slate-700">条件を変更する</button>
        </div>
      )}
    </section>
  );
}
