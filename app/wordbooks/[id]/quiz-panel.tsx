"use client";

import { useMemo, useState } from "react";
import { formatMeaning } from "@/lib/meaning";

type QuizWord = { no: number; english: string; japanese: string };
type Mode = "card" | "choice";
type Direction = "en-ja" | "ja-en";

function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function compactMeaning(value: string) {
  const main = formatMeaning(value, "main")
    .replace(/^[\s\d.;:・\-]+/, "")
    .replace(/^[\[({（【][^\])}）】]{1,14}[\])}）】]\s*/, "")
    .split(/[;；、，・]/)[0]
    .trim();
  return main || value.trim();
}

function uniqueChoices(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export default function QuizPanel({
  words,
  markedKeys,
  onToggleMark,
}: {
  words: QuizWord[];
  markedKeys?: Set<string>;
  onToggleMark?: (word: Pick<QuizWord, "no" | "english">) => void;
}) {
  const [mode, setMode] = useState<Mode>("choice");
  const [direction, setDirection] = useState<Direction>("en-ja");
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [order, setOrder] = useState<QuizWord[]>([]);
  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongWords, setWrongWords] = useState<QuizWord[]>([]);

  const total = order.length;
  const current = order[index] ?? null;
  const canUseChoice = words.length >= 4;
  const currentKey = current ? `${current.no}-${current.english}` : "";
  const isMarked = Boolean(currentKey && markedKeys?.has(currentKey));

  const promptText = current ? (direction === "en-ja" ? current.english : compactMeaning(current.japanese)) : "";
  const answerText = current ? (direction === "en-ja" ? compactMeaning(current.japanese) : current.english) : "";

  const choices = useMemo(() => {
    if (mode !== "choice" || !current) return [];
    const distractors = shuffle(words.filter((word) => word.no !== current.no))
      .map((word) => (direction === "en-ja" ? compactMeaning(word.japanese) : word.english))
      .filter((value) => value !== answerText);
    return shuffle([answerText, ...uniqueChoices(distractors).slice(0, 3)]);
  }, [answerText, current, direction, mode, words]);

  function begin(nextMode: Mode, sourceWords = words) {
    if (sourceWords.length === 0) return;
    setMode(nextMode);
    setOrder(shuffle(sourceWords));
    setIndex(0);
    setShowAnswer(false);
    setSelected(null);
    setCorrectCount(0);
    setWrongWords([]);
    setFinished(false);
    setStarted(true);
  }

  function advance(correct: boolean) {
    if (!current) return;
    if (correct) setCorrectCount((value) => value + 1);
    else setWrongWords((list) => [...list, current]);

    setShowAnswer(false);
    setSelected(null);
    if (index + 1 >= total) setFinished(true);
    else setIndex((value) => value + 1);
  }

  if (words.length === 0) {
    return (
      <div className="rounded-3xl border bg-white p-8 text-center text-sm font-bold text-slate-400 shadow-sm">
        先に使う範囲を選ぶと、ここで単語チェックができます。
      </div>
    );
  }

  if (!started) {
    return (
      <div className="rounded-3xl border bg-white p-5 shadow-sm sm:p-7">
        <div className="rounded-3xl bg-gradient-to-br from-blue-600 to-sky-500 p-5 text-white">
          <p className="text-sm font-black text-blue-100">単語チェック</p>
          <h2 className="mt-1 text-2xl font-black">その場で解いて覚える</h2>
          <p className="mt-2 text-sm leading-6 text-blue-50">
            選択中の{words.length}語を使って、4択クイズやカードで練習できます。
            わからない単語には印を付けて、あとで復習できます。
          </p>
        </div>

        <div className="mt-5 rounded-2xl bg-slate-50 p-3">
          <p className="text-xs font-black text-slate-500">出題方向</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {([
              ["en-ja", "英語 → 日本語"],
              ["ja-en", "日本語 → 英語"],
            ] as Array<[Direction, string]>).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setDirection(value)}
                className={`rounded-2xl border px-4 py-3 text-sm font-black transition ${
                  direction === value ? "border-blue-500 bg-blue-600 text-white shadow-sm" : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => begin("choice")}
            disabled={!canUseChoice}
            className="rounded-2xl bg-blue-600 px-4 py-4 text-base font-black text-white hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400"
          >
            4択でチェック
            {!canUseChoice ? <span className="mt-1 block text-[11px] font-bold">4語以上の範囲で使えます</span> : null}
          </button>
          <button
            type="button"
            onClick={() => begin("card")}
            className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 text-base font-black text-blue-700 hover:bg-blue-100"
          >
            カードで覚える
          </button>
        </div>
      </div>
    );
  }

  if (finished) {
    const rate = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    return (
      <div className="rounded-3xl border bg-white p-6 text-center shadow-sm sm:p-8">
        <p className="text-sm font-black text-blue-700">結果</p>
        <p className="mt-3 text-5xl font-black text-slate-950">{rate}%</p>
        <p className="mt-2 text-sm font-bold text-slate-500">
          {correctCount} / {total}語クリア
          {wrongWords.length > 0 ? `・復習したい語 ${wrongWords.length}語` : ""}
        </p>

        {wrongWords.length > 0 ? (
          <div className="mx-auto mt-5 max-w-md rounded-2xl bg-slate-50 p-4 text-left">
            <p className="text-xs font-black text-slate-500">間違えた単語</p>
            <div className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-auto">
              {wrongWords.map((word) => (
                <span key={`${word.no}-${word.english}`} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-700 shadow-sm">
                  {word.english}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-5 text-sm font-bold text-emerald-600">全問クリア。かなりいい感じです。</p>
        )}

        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          {wrongWords.length > 0 ? (
            <button
              type="button"
              onClick={() => begin(mode, wrongWords)}
              className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-700"
            >
              間違えた{wrongWords.length}語だけ復習
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => begin(mode)}
            className="rounded-2xl border px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50"
          >
            もう一度やる
          </button>
          <button
            type="button"
            onClick={() => setStarted(false)}
            className="rounded-2xl border px-4 py-3 text-sm font-black text-slate-500 hover:bg-slate-50 sm:col-span-2"
          >
            モード選択へ戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border bg-white p-5 shadow-sm sm:p-7">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black text-slate-500">
          {mode === "choice" ? "4択チェック" : "フラッシュカード"} ・ {index + 1} / {total}
        </p>
        <button type="button" onClick={() => setStarted(false)} className="text-xs font-bold text-slate-400 hover:text-slate-600">
          やめる
        </button>
      </div>

      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${((index + 1) / Math.max(total, 1)) * 100}%` }} />
      </div>

      <div className="mt-5 rounded-[28px] border bg-gradient-to-br from-blue-50 to-white p-6 text-center">
        {current ? <p className="text-xs font-black text-slate-400">No.{current.no}</p> : null}
        <p className="mt-2 break-words text-[clamp(2rem,9vw,4rem)] font-black leading-tight text-slate-950">{promptText}</p>
        {current && onToggleMark ? (
          <button
            type="button"
            onClick={() => onToggleMark(current)}
            className={`mt-4 rounded-full px-4 py-2 text-xs font-black ${isMarked ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500"}`}
          >
            {isMarked ? "復習マーク済み" : "わからない単語にマーク"}
          </button>
        ) : null}

        {mode === "card" ? (
          <p className={`mt-5 min-h-[56px] text-2xl font-black text-blue-700 transition ${showAnswer ? "opacity-100" : "opacity-0"}`}>
            {answerText}
          </p>
        ) : null}
      </div>

      {mode === "card" ? (
        <div className="mt-5 grid gap-2">
          {!showAnswer ? (
            <button
              type="button"
              onClick={() => setShowAnswer(true)}
              className="rounded-2xl bg-blue-600 px-4 py-4 text-base font-black text-white hover:bg-blue-700"
            >
              答えを見る
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => advance(false)}
                className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-base font-black text-amber-700 hover:bg-amber-100"
              >
                まだ不安
              </button>
              <button
                type="button"
                onClick={() => advance(true)}
                className="rounded-2xl bg-emerald-600 px-4 py-4 text-base font-black text-white hover:bg-emerald-700"
              >
                覚えた
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-5 grid gap-2">
          {choices.map((choice) => {
            const isAnswer = choice === answerText;
            const isPicked = selected === choice;
            const answered = selected !== null;
            let tone = "border-slate-200 bg-white text-slate-800 hover:bg-slate-50";
            if (answered && isAnswer) tone = "border-emerald-500 bg-emerald-50 text-emerald-700";
            else if (answered && isPicked && !isAnswer) tone = "border-red-400 bg-red-50 text-red-600";
            else if (answered) tone = "border-slate-200 bg-white text-slate-400";
            return (
              <button
                key={choice}
                type="button"
                disabled={answered}
                onClick={() => setSelected(choice)}
                className={`rounded-2xl border px-4 py-4 text-left text-base font-bold transition ${tone}`}
              >
                {choice}
              </button>
            );
          })}
          {selected !== null ? (
            <button
              type="button"
              onClick={() => advance(selected === answerText)}
              className="mt-1 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-700"
            >
              {index + 1 >= total ? "結果を見る" : "次へ"}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
