"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatMeaning } from "@/lib/meaning";
import { speakText } from "@/lib/speech";
import { buildClozePrintDocument, buildClozeQuestion, isClozeEligibleWord, isClozePilotBook } from "@/lib/cloze-quiz";
import { Field, Section, Seg, Toggle } from "./study-ui";

type QuizWord = { no: number; english: string; japanese: string };
type Mode = "card" | "choice" | "cloze";
type Direction = "en-ja" | "ja-en" | "mixed";
type QuestionCount = "10" | "20" | "50" | "all";
type QuestionOrder = "random" | "book";
type Scope = "all" | "marked" | "due";

type QuizSettings = {
  mode: Mode;
  direction: Direction;
  count: QuestionCount;
  order: QuestionOrder;
  scope: Scope;
  choiceCount: 3 | 4 | 5;
  timer: number;
  customCount: number;
  autoSpeak: boolean;
  autoNext: boolean;
};

const DEFAULTS: QuizSettings = {
  mode: "choice",
  direction: "en-ja",
  count: "10",
  order: "random",
  scope: "all",
  choiceCount: 4,
  timer: 0,
  customCount: 0,
  autoSpeak: false,
  autoNext: false,
};

// 無料会員は 4択/カードの基本設定のみ、最大20問。それ以外は Personal 限定。
const FREE_MAX_QUESTIONS = 20;
function clampForFree(s: QuizSettings): QuizSettings {
  return {
    ...DEFAULTS,
    mode: s.mode === "cloze" ? "choice" : s.mode,
    count: s.count === "10" || s.count === "20" ? s.count : "20",
    order: "random",
  };
}

const STORAGE_KEY = "vpp-quiz-settings-v2";
const TIMEOUT = "__timeout__";

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
  bookTitle,
  markedKeys,
  onToggleMark,
  isPaid = false,
  onLocked = () => {},
  languageCode,
  onAnswer,
  dueKeys,
  initialScope,
}: {
  onAnswer?: (word: QuizWord, correct: boolean) => void;
  /** 忘却曲線で今日復習すべき単語のキー（no-english）。渡すと「今日の復習」出題が選べる。 */
  dueKeys?: Set<string>;
  initialScope?: "due";
  words: QuizWord[];
  bookTitle: string;
  markedKeys?: Set<string>;
  onToggleMark?: (word: Pick<QuizWord, "no" | "english">) => void;
  isPaid?: boolean;
  onLocked?: (reason: string) => void;
  languageCode?: string;
}) {
  const [saved, setSaved] = useState<QuizSettings>(DEFAULTS);
  const settings = isPaid ? saved : clampForFree(saved);
  const update = useCallback((patch: Partial<QuizSettings>) => setSaved((current) => ({ ...current, ...patch })), []);

  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [order, setOrder] = useState<QuizWord[]>([]);
  const [dirs, setDirs] = useState<Array<"en-ja" | "ja-en">>([]);
  const [questionPool, setQuestionPool] = useState<QuizWord[]>([]);
  const [runMode, setRunMode] = useState<Mode>("choice");
  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongWords, setWrongWords] = useState<QuizWord[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [openAll, setOpenAll] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [runSettings, setRunSettings] = useState<QuizSettings>(DEFAULTS);
  const autoNextRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setSaved({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<QuizSettings>) });
    } catch {
      // 既定値のまま
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // 無視
    }
  }, [saved]);

  useEffect(() => {
    if (initialScope === "due") setSaved((current) => ({ ...current, scope: "due", count: "all", customCount: 0 }));
  }, [initialScope]);

  const dueList = useMemo(() => words.filter((word) => dueKeys?.has(`${word.no}-${word.english}`)), [words, dueKeys]);
  const markedWords = useMemo(() => words.filter((word) => markedKeys?.has(`${word.no}-${word.english}`)), [words, markedKeys]);
  const clozeWords = useMemo(() => words.filter(isClozeEligibleWord), [words]);
  const canUseCloze = clozeWords.length >= 4 && isClozePilotBook(bookTitle);
  const scopeWords = settings.scope === "due" && dueKeys ? dueList : settings.scope === "marked" && markedWords.length > 0 ? markedWords : words;

  const distinctEnJa = useMemo(() => uniqueChoices(scopeWords.map((word) => compactMeaning(word.japanese))).length, [scopeWords]);
  const distinctJaEn = useMemo(() => uniqueChoices(scopeWords.map((word) => word.english)).length, [scopeWords]);
  const distinctMin = settings.direction === "en-ja" ? distinctEnJa : settings.direction === "ja-en" ? distinctJaEn : Math.min(distinctEnJa, distinctJaEn);
  const canUseChoice = distinctMin >= settings.choiceCount;

  const total = order.length;
  const current = order[index] ?? null;
  const dir = dirs[index] ?? "en-ja";
  const currentKey = current ? `${current.no}-${current.english}` : "";
  const isMarked = Boolean(currentKey && markedKeys?.has(currentKey));
  const japanesePair = Boolean(current && !languageCode && /[぀-ヿ㐀-鿿]/.test(current.english) && !/[A-Za-z]/.test(current.english));

  const clozeQuestion = useMemo(
    () => (current && runMode === "cloze" ? buildClozeQuestion(current, questionPool.filter(isClozeEligibleWord), bookTitle) : null),
    [current, runMode, questionPool, bookTitle],
  );
  const promptText = current ? (runMode === "cloze" ? clozeQuestion?.sentence ?? "" : dir === "en-ja" ? current.english : compactMeaning(current.japanese)) : "";
  const answerText = current ? (runMode === "cloze" ? current.english : dir === "en-ja" ? compactMeaning(current.japanese) : current.english) : "";

  const choices = useMemo(() => {
    if ((runMode !== "choice" && runMode !== "cloze") || !current) return [];
    if (runMode === "cloze") return clozeQuestion?.choices ?? [];
    const distractors = shuffle(questionPool.filter((word) => word !== current))
      .map((word) => (dir === "en-ja" ? compactMeaning(word.japanese) : word.english))
      .filter((value) => value !== answerText);
    return shuffle([answerText, ...uniqueChoices(distractors).slice(0, runSettings.choiceCount - 1)]);
  }, [answerText, clozeQuestion, current, dir, runMode, questionPool, runSettings.choiceCount]);

  function printCloze() {
    const html = buildClozePrintDocument(bookTitle, words, 20);
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    if (!doc) {
      iframe.remove();
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();
    window.setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      window.setTimeout(() => iframe.remove(), 30_000);
    }, 350);
  }

  function begin(nextMode: Mode, sourceWords?: QuizWord[]) {
    const retry = Boolean(sourceWords);
    const base = sourceWords ?? (nextMode === "cloze" ? clozeWords : scopeWords);
    if (base.length === 0) return;
    const ordered = settings.order === "random" ? shuffle(base) : [...base];
    const cap = !isPaid ? FREE_MAX_QUESTIONS : Infinity;
    const wanted = settings.customCount > 0 ? settings.customCount : settings.count === "all" ? ordered.length : Number(settings.count);
    const limit = retry ? ordered.length : Math.min(wanted, ordered.length, cap);
    const picked = ordered.slice(0, limit);
    setRunSettings(settings);
    setRunMode(nextMode);
    setQuestionPool(nextMode === "cloze" ? clozeWords : scopeWords);
    setOrder(picked);
    setDirs(picked.map(() => (settings.direction === "mixed" ? (Math.random() < 0.5 ? "en-ja" : "ja-en") : settings.direction)));
    setIndex(0);
    setShowAnswer(false);
    setSelected(null);
    setCorrectCount(0);
    setWrongWords([]);
    setFinished(false);
    setStarted(true);
  }

  const advance = useCallback(
    (correct: boolean) => {
      if (!current) return;
      if (autoNextRef.current) {
        window.clearTimeout(autoNextRef.current);
        autoNextRef.current = null;
      }
      onAnswer?.(current, correct);
      if (correct) setCorrectCount((value) => value + 1);
      else setWrongWords((list) => [...list, current]);
      setShowAnswer(false);
      setSelected(null);
      if (index + 1 >= total) setFinished(true);
      else setIndex((value) => value + 1);
    },
    [current, index, total, onAnswer],
  );

  const speak = useCallback(
    (text: string, english: boolean) => {
      void speakText(text, {
        preferred: english && !japanesePair ? "english" : "japanese",
        lang: english ? languageCode : undefined,
        rate: english ? 0.9 : 0.95,
      });
    },
    [japanesePair, languageCode],
  );

  const choosing = started && !finished && (runMode === "choice" || runMode === "cloze");
  const answered = selected !== null;

  // 制限時間
  useEffect(() => {
    if (!choosing || !runSettings.timer || answered) return;
    setTimeLeft(runSettings.timer);
    const id = window.setInterval(() => {
      setTimeLeft((value) => {
        if (value <= 1) {
          window.clearInterval(id);
          setSelected(TIMEOUT);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [choosing, index, runSettings.timer, answered]);

  // 自動発音: 問題が英語なら出題時に、日本語→英語なら回答後に英語を読む
  useEffect(() => {
    if (!started || finished || !current || !runSettings.autoSpeak) return;
    if (runMode !== "cloze" && dir === "en-ja") speak(current.english, true);
  }, [started, finished, current, dir, runMode, runSettings.autoSpeak, speak]);
  useEffect(() => {
    if (!answered || !current || !runSettings.autoSpeak) return;
    if (runMode !== "cloze" && dir === "ja-en") speak(current.english, true);
  }, [answered, current, dir, runMode, runSettings.autoSpeak, speak]);

  // 正解したら少し待って自動で次へ
  useEffect(() => {
    if (!choosing || !answered || !runSettings.autoNext || selected !== answerText) return;
    autoNextRef.current = window.setTimeout(() => advance(true), 900);
    return () => {
      if (autoNextRef.current) window.clearTimeout(autoNextRef.current);
    };
  }, [choosing, answered, runSettings.autoNext, selected, answerText, advance]);

  // キーボード: 1-5 で選択、Enter/Space で次へ・答え
  useEffect(() => {
    if (!started || finished) return;
    function onKey(event: KeyboardEvent) {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (choosing) {
        const n = Number(event.key);
        if (!answered && n >= 1 && n <= choices.length) setSelected(choices[n - 1]);
        else if (answered && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          advance(selected === answerText);
        }
      } else if (runMode === "card") {
        if (!showAnswer && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          setShowAnswer(true);
        } else if (showAnswer && (event.key === "ArrowRight" || event.key === "1")) advance(true);
        else if (showAnswer && (event.key === "ArrowLeft" || event.key === "2")) advance(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, finished, choosing, answered, choices, selected, answerText, runMode, showAnswer, advance]);

  if (words.length === 0) {
    return <div className="rounded-3xl border bg-white p-8 text-center text-sm font-bold text-slate-400 shadow-sm">先に使う範囲を選ぶと、ここで単語チェックができます。</div>;
  }

  /* ───────── 設定画面 ───────── */
  if (!started) {
    const questionTotal = Math.min(
      settings.customCount > 0 ? settings.customCount : settings.count === "all" ? scopeWords.length : Number(settings.count),
      scopeWords.length,
      isPaid ? Infinity : FREE_MAX_QUESTIONS,
    );
    const startDisabled = (settings.mode === "choice" && !canUseChoice) || scopeWords.length === 0;
    return (
      <div className="space-y-3">
        <div className="rounded-3xl bg-gradient-to-br from-blue-600 to-sky-500 p-5 text-white shadow-sm">
          <p className="text-xs font-black text-blue-100">単語チェック</p>
          <p className="mt-1 text-2xl font-black">{questionTotal}問に挑戦</p>
          <p className="mt-1 text-xs font-bold text-blue-50">
            選択範囲{words.length}語から出題 ・ {settings.mode === "choice" ? `${settings.choiceCount}択` : settings.mode === "card" ? "カード" : "穴埋め"} ・ {settings.direction === "en-ja" ? "英→日" : settings.direction === "ja-en" ? "日→英" : "ミックス"}
          </p>
        </div>

        <div className="flex items-center justify-between px-1">
          <p className="text-xs font-black text-slate-500">設定（タップで開閉）</p>
          <button type="button" onClick={() => { setOpenAll((value) => !value); setEpoch((value) => value + 1); }} className="rounded-full border bg-white px-3 py-1.5 text-xs font-black text-slate-600 hover:bg-slate-50">{openAll ? "すべて閉じる" : "すべて開く"}</button>
        </div>
        <Section key={`a${epoch}`} open={openAll || epoch === 0} title="形式" summary={settings.mode === "choice" ? `${settings.choiceCount}択` : settings.mode === "card" ? "カード" : "穴埋め"}>
          <Field label="学習のしかた">
            <Seg
              value={settings.mode}
              onChange={(mode) => update({ mode })}
              onLocked={onLocked}
              columns={canUseCloze ? 3 : 2}
              options={[
                { value: "choice" as Mode, label: "選択式" },
                { value: "card" as Mode, label: "カード" },
                ...(canUseCloze ? [{ value: "cloze" as Mode, label: "英検式穴埋め", locked: !isPaid }] : []),
              ]}
            />
            {settings.mode === "choice" && !canUseChoice ? <p className="mt-2 text-xs font-bold text-red-600">答えが異なる単語が{settings.choiceCount}つ以上必要です。範囲を広げるか、選択肢の数を減らしてください。</p> : null}
            {settings.mode === "cloze" ? (
              <div className="mt-2 rounded-xl bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800">
                試験提供中。単語形式の{clozeWords.length}語を対象に、オリジナル例文で4択問題を作ります。
                <button type="button" onClick={printCloze} className="mt-2 block rounded-lg border border-amber-200 bg-white px-3 py-2 text-amber-900">問題・解答を印刷</button>
              </div>
            ) : null}
          </Field>
          <Field label="出題方向" locked={!isPaid}>
            <Seg
              value={settings.direction}
              onChange={(direction) => update({ direction })}
              onLocked={onLocked}
              options={[
                { value: "en-ja" as Direction, label: "英語→日本語" },
                { value: "ja-en" as Direction, label: "日本語→英語", locked: !isPaid },
                { value: "mixed" as Direction, label: "ミックス", locked: !isPaid },
              ]}
            />
          </Field>
        </Section>

        <Section key={`b${epoch}`} open={openAll} title="出題" summary={`${questionTotal}問・${settings.order === "random" ? "シャッフル" : "単語帳順"}${settings.scope === "marked" ? "・★のみ" : ""}`}>
          <Field label="出題数" hint={isPaid ? undefined : `無料会員は最大${FREE_MAX_QUESTIONS}問まで`}>
            <Seg
              value={settings.count}
              onChange={(count) => update({ count, customCount: 0 })}
              onLocked={onLocked}
              columns={4}
              options={[
                { value: "10" as QuestionCount, label: "10問" },
                { value: "20" as QuestionCount, label: "20問" },
                { value: "50" as QuestionCount, label: "50問", locked: !isPaid },
                { value: "all" as QuestionCount, label: `全${scopeWords.length}問`, locked: !isPaid },
              ]}
            />
          </Field>
          <Field label="出題順" locked={!isPaid}>
            <Seg
              value={settings.order}
              onChange={(next) => update({ order: next })}
              onLocked={onLocked}
              columns={2}
              options={[
                { value: "random" as QuestionOrder, label: "シャッフル" },
                { value: "book" as QuestionOrder, label: "単語帳の順", locked: !isPaid },
              ]}
            />
          </Field>
          <Field label="出題する単語" hint={settings.scope === "due" ? (dueList.length === 0 ? "今日復習する単語はありません。間隔が来ると自動で出題されます" : "記憶度が下がった単語から出題します") : markedWords.length === 0 ? "★をつけた単語がまだありません" : `★は${markedWords.length}語`} locked={!isPaid}>
            <Seg
              value={settings.scope}
              onChange={(scope) => update({ scope })}
              onLocked={onLocked}
              columns={dueKeys ? 1 : 2}
              options={[
                { value: "all" as Scope, label: "選んだ範囲すべて" },
                { value: "marked" as Scope, label: "★をつけた単語だけ", locked: !isPaid },
                ...(dueKeys ? [{ value: "due" as Scope, label: `忘却曲線の復習（${dueList.length}語）`, locked: !isPaid }] : []),
              ]}
            />
          </Field>
        </Section>

        <Section key={`c${epoch}`} open={openAll} title="詳細設定" summary={[settings.mode === "choice" ? `${settings.choiceCount}択` : "", settings.timer ? `${settings.timer}秒` : "", settings.autoSpeak ? "発音" : "", settings.autoNext ? "自動送り" : ""].filter(Boolean).join("・") || "標準"}>
          <Field label="選択肢の数" locked={!isPaid}>
            <Seg
              value={settings.choiceCount}
              onChange={(choiceCount) => update({ choiceCount })}
              onLocked={onLocked}
              options={([3, 4, 5] as const).map((n) => ({ value: n, label: `${n}択`, locked: !isPaid && n !== 4 }))}
            />
          </Field>
          <Field label="1問あたりの制限時間" hint="時間切れは不正解になります（選択式のみ）" locked={!isPaid}>
            <Seg
              value={settings.timer}
              onChange={(timer) => update({ timer })}
              onLocked={onLocked}
              columns={4}
              options={[0, 5, 10, 15].map((n) => ({ value: n, label: n === 0 ? "なし" : `${n}秒`, locked: !isPaid && n !== 0 }))}
            />
          </Field>
          <Toggle checked={settings.autoSpeak} label="英語を自動で発音" hint="出題時（英→日）または回答後（日→英）に読み上げ" locked={!isPaid} onChange={(autoSpeak) => update({ autoSpeak })} onLocked={onLocked} />
          <Toggle checked={settings.autoNext} label="正解したら自動で次へ" hint="間違えたときは止まって正解を確認できます" locked={!isPaid} onChange={(autoNext) => update({ autoNext })} onLocked={onLocked} />
        </Section>

        <button
          type="button"
          onClick={() => begin(settings.mode)}
          disabled={startDisabled}
          className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[5] w-full md:bottom-3 rounded-2xl bg-slate-900 px-4 py-4 text-base font-black text-white shadow-xl hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-500"
        >
          {settings.mode === "choice" ? "選択式チェックを始める" : settings.mode === "cloze" ? "穴埋めテストを始める" : "カード学習を始める"}
        </button>
        {!isPaid ? (
          <button type="button" onClick={() => onLocked("Personalにすると、日→英・ミックス出題、制限時間、★だけ出題、自動発音など、すべての設定を使えます。")} className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-xs font-black text-amber-800">
            🔒 無料は基本設定のみ（最大{FREE_MAX_QUESTIONS}問）。Personalで全設定を解放 ›
          </button>
        ) : null}
      </div>
    );
  }

  /* ───────── 結果画面 ───────── */
  if (finished) {
    const rate = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    const unmarkedWrong = wrongWords.filter((word) => !markedKeys?.has(`${word.no}-${word.english}`));
    return (
      <div className="rounded-3xl border bg-white p-6 text-center shadow-sm sm:p-8">
        <p className="text-sm font-black text-blue-700">結果</p>
        <p className="mt-3 text-6xl font-black text-slate-950">{rate}%</p>
        <p className="mt-2 text-sm font-bold text-slate-500">
          {correctCount} / {total}問正解
          {wrongWords.length > 0 ? `・復習したい語 ${wrongWords.length}語` : ""}
        </p>
        <div className="mx-auto mt-4 h-3 max-w-sm overflow-hidden rounded-full bg-red-100">
          <div className="h-full bg-emerald-500" style={{ width: `${rate}%` }} />
        </div>

        {wrongWords.length > 0 ? (
          <div className="mx-auto mt-5 max-w-md rounded-2xl bg-slate-50 p-4 text-left">
            <p className="text-xs font-black text-slate-500">間違えた単語</p>
            <ul className="mt-2 max-h-48 space-y-1 overflow-auto">
              {wrongWords.map((word) => (
                <li key={`${word.no}-${word.english}`} className="flex items-baseline justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm shadow-sm">
                  <span className="font-black text-slate-900">{word.english}</span>
                  <span className="truncate text-xs font-bold text-slate-500">{compactMeaning(word.japanese)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-5 text-sm font-bold text-emerald-600">全問正解。かなりいい感じです。</p>
        )}

        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          {wrongWords.length > 0 ? (
            <button type="button" onClick={() => begin(runMode, wrongWords)} className="min-h-12 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-700">
              間違えた{wrongWords.length}語だけ復習
            </button>
          ) : null}
          <button type="button" onClick={() => begin(runMode)} className="min-h-12 rounded-2xl border px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50">
            もう一度やる
          </button>
          {onToggleMark && unmarkedWrong.length > 0 ? (
            <button type="button" onClick={() => unmarkedWrong.forEach((word) => onToggleMark(word))} className="min-h-12 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-800 sm:col-span-2">
              ☆ 間違えた{unmarkedWrong.length}語に★をつける
            </button>
          ) : null}
          <button type="button" onClick={() => setStarted(false)} className="min-h-12 rounded-2xl border px-4 py-3 text-sm font-black text-slate-500 hover:bg-slate-50 sm:col-span-2">
            設定に戻る
          </button>
        </div>
      </div>
    );
  }

  /* ───────── 出題画面 ───────── */
  const timedOut = selected === TIMEOUT;
  return (
    <div className="rounded-3xl border bg-white p-4 shadow-sm sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black text-slate-500">
          {runMode === "choice" ? `${runSettings.choiceCount}択` : runMode === "cloze" ? "英検形式の穴埋め" : "カード"} ・ {index + 1} / {total}
        </p>
        <div className="flex items-center gap-3 text-xs font-black">
          <span className="text-emerald-600">○ {correctCount}</span>
          <span className="text-red-500">× {wrongWords.length}</span>
          <button type="button" onClick={() => setStarted(false)} className="text-slate-400 hover:text-slate-600">
            やめる
          </button>
        </div>
      </div>

      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${((index + 1) / Math.max(total, 1)) * 100}%` }} />
      </div>
      {choosing && runSettings.timer && !answered ? (
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-amber-100" aria-label={`残り${timeLeft}秒`}>
          <div className="h-full rounded-full bg-amber-500 transition-all duration-1000 ease-linear" style={{ width: `${(timeLeft / runSettings.timer) * 100}%` }} />
        </div>
      ) : null}

      <div className="relative mt-4 rounded-[28px] border bg-gradient-to-br from-blue-50 to-white px-4 py-8 text-center sm:py-10">
        {current && onToggleMark ? (
          <button
            type="button"
            onClick={() => onToggleMark(current)}
            className={`absolute right-3 top-3 rounded-full px-3 py-2 text-2xl leading-none transition ${isMarked ? "bg-amber-100 text-amber-500" : "bg-slate-100 text-slate-300 hover:text-amber-400"}`}
            aria-label={isMarked ? "復習マークを外す" : "復習マークを付ける"}
          >
            {isMarked ? "★" : "☆"}
          </button>
        ) : null}
        {current ? (
          <p className="text-xs font-black text-slate-400">
            No.{current.no} ・ {runMode === "cloze" ? "空所に入る語を選ぼう" : dir === "en-ja" ? "意味は？" : "英語は？"}
          </p>
        ) : null}
        <p className="mt-2 break-words text-[clamp(1.9rem,8vw,3.6rem)] font-black leading-tight text-slate-950">{promptText}</p>
        {runMode !== "cloze" && current && dir === "en-ja" ? (
          <button type="button" onClick={() => speak(current.english, true)} className="mt-3 rounded-full border bg-white px-4 py-2 text-xs font-black text-slate-600 hover:bg-slate-50">
            🔊 発音
          </button>
        ) : null}
        {runMode === "card" ? <p className={`mt-5 min-h-[56px] text-2xl font-black text-blue-700 transition ${showAnswer ? "opacity-100" : "opacity-0"}`}>{answerText}</p> : null}
      </div>

      {runMode === "card" ? (
        <div className="mt-4 grid gap-2">
          {!showAnswer ? (
            <button type="button" onClick={() => setShowAnswer(true)} className="min-h-14 rounded-2xl bg-blue-600 px-4 py-4 text-base font-black text-white hover:bg-blue-700">
              答えを見る
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => advance(false)} className="min-h-14 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-base font-black text-amber-700 hover:bg-amber-100">
                まだ不安
              </button>
              <button type="button" onClick={() => advance(true)} className="min-h-14 rounded-2xl bg-emerald-600 px-4 py-4 text-base font-black text-white hover:bg-emerald-700">
                覚えた
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 grid gap-2">
          {choices.map((choice, choiceIndex) => {
            const isAnswer = choice === answerText;
            const isPicked = selected === choice;
            let tone = "border-slate-200 bg-white text-slate-800 hover:bg-slate-50 active:bg-slate-100";
            if (answered && isAnswer) tone = "border-emerald-500 bg-emerald-50 text-emerald-700";
            else if (answered && isPicked && !isAnswer) tone = "border-red-400 bg-red-50 text-red-600";
            else if (answered) tone = "border-slate-200 bg-white text-slate-400";
            return (
              <button
                key={choice}
                type="button"
                disabled={answered}
                onClick={() => setSelected(choice)}
                className={`flex min-h-14 items-center rounded-xl border px-4 py-3 text-left text-base font-bold transition ${tone}`}
              >
                <span className="mr-3 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-500">{choiceIndex + 1}</span>
                <span className="min-w-0 break-words">{choice}</span>
              </button>
            );
          })}
          {answered ? (
            <div className="space-y-2" aria-live="polite">
              <p className={`text-sm font-black ${selected === answerText ? "text-emerald-700" : "text-red-600"}`}>
                {selected === answerText ? "正解です！" : timedOut ? `時間切れ。正解は「${answerText}」です` : `正解は「${answerText}」です`}
              </p>
              {!(runSettings.autoNext && selected === answerText) ? (
                <button type="button" onClick={() => advance(selected === answerText)} className="min-h-14 w-full rounded-xl bg-blue-600 px-4 py-3 text-base font-black text-white hover:bg-blue-700">
                  {index + 1 >= total ? "結果を見る" : "次へ"}
                </button>
              ) : null}
            </div>
          ) : null}
          <p className="hidden text-center text-[11px] font-bold text-slate-400 sm:block">数字キーで回答 ・ Enter/Spaceで次へ</p>
        </div>
      )}
    </div>
  );
}
