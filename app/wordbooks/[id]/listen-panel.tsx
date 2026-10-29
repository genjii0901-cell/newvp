"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatMeaning } from "@/lib/meaning";
import { primeSpeechVoices, speakText } from "@/lib/speech";
import { Field, Section, Seg, Slider, Toggle } from "./study-ui";

type ListenWord = { no: number; english: string; japanese: string; unit?: string | null };
type Order = "en-ja" | "ja-en" | "en-only";
type Show = "always" | "with-audio" | "after-prompt" | "manual" | "hidden";

type Settings = {
  order: Order;
  enShow: Show;
  jaShow: Show;
  screen: "on" | "audio-only";
  meaningMode: "main" | "all";
  speed: number;
  gapMs: number;
  innerGapMs: number;
  repeat: number;
  shuffle: boolean;
  loop: boolean;
  markedOnly: boolean;
};

const DEFAULTS: Settings = {
  order: "en-ja",
  enShow: "always",
  jaShow: "after-prompt",
  screen: "on",
  meaningMode: "main",
  speed: 1,
  gapMs: 800,
  innerGapMs: 400,
  repeat: 1,
  shuffle: false,
  loop: false,
  markedOnly: false,
};

// 無料会員が使える範囲。ここに無い項目は Personal 限定。
const FREE_WORD_LIMIT = 20;
function clampForFree(s: Settings): Settings {
  return {
    ...DEFAULTS,
    order: s.order === "en-only" ? DEFAULTS.order : s.order,
    jaShow: s.jaShow === "always" || s.jaShow === "after-prompt" ? s.jaShow : DEFAULTS.jaShow,
    speed: s.speed,
    gapMs: s.gapMs,
  };
}

const PRESETS: Array<{ id: string; label: string; help: string; locked?: boolean; apply: Partial<Settings> }> = [
  { id: "standard", label: "標準", help: "英語→日本語", apply: { ...DEFAULTS } },
  { id: "slow", label: "ゆっくり", help: "0.8倍・間長め", apply: { ...DEFAULTS, speed: 0.8, gapMs: 1600 } },
  { id: "fast", label: "速習", help: "1.25倍・間短め", locked: true, apply: { ...DEFAULTS, speed: 1.25, gapMs: 300, innerGapMs: 200, jaShow: "with-audio" } },
  { id: "ear", label: "耳だけ", help: "画面なし・2回", locked: true, apply: { ...DEFAULTS, screen: "audio-only", repeat: 2, gapMs: 1000, loop: true } },
];

const STORAGE_KEY = "vpp-listen-settings-v2";

function rateValue(speed: number, base: number) {
  return Math.max(0.5, Math.min(1.6, Math.round(base * speed * 100) / 100));
}

function isJapaneseOnlyText(value: string) {
  return /[぀-ヿ㐀-鿿]/.test(value) && !/[A-Za-z]/.test(value);
}

function shuffled<T>(items: T[]) {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export default function ListenPanel({
  words,
  isPaid,
  languageCode,
  markedKeys,
  onToggleMark,
  onLocked,
  preview = false,
}: {
  preview?: boolean;
  words: ListenWord[];
  isPaid: boolean;
  languageCode?: string;
  markedKeys: Set<string>;
  onToggleMark: (word: Pick<ListenWord, "no" | "english">) => void;
  onLocked: (reason: string) => void;
}) {
  const [saved, setSaved] = useState<Settings>(DEFAULTS);
  const settings = isPaid ? saved : clampForFree(saved);
  const update = useCallback((patch: Partial<Settings>) => setSaved((current) => ({ ...current, ...patch })), []);

  const [shuffleSeed, setShuffleSeed] = useState(0);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<0 | 1 | 2>(0);
  const [manualReveal, setManualReveal] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [openAll, setOpenAll] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const toggleAll = () => { setOpenAll((value) => !value); setEpoch((value) => value + 1); };

  const runRef = useRef({ stopped: true, id: 0 });
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    primeSpeechVoices();
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setSaved({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) });
    } catch {
      // 保存できない環境では既定値のまま使う。
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // 無視
    }
  }, [saved]);

  const playlist = useMemo(() => {
    let list = words;
    if (settings.markedOnly) {
      const marked = words.filter((word) => markedKeys.has(`${word.no}-${word.english}`));
      if (marked.length > 0) list = marked;
    }
    if (settings.shuffle) list = shuffled(list);
    if (!isPaid) list = list.slice(0, FREE_WORD_LIMIT);
    return list;
    // shuffleSeed で並べ直しを明示的に起こす
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words, settings.markedOnly, settings.shuffle, isPaid, shuffleSeed, markedKeys.size]);
  const listRef = useRef(playlist);
  listRef.current = playlist;

  const stop = useCallback(() => {
    runRef.current.stopped = true;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setPlaying(false);
  }, []);

  // 範囲や並びが変わったら先頭に戻す。画面を離れたら必ず止める。
  useEffect(() => {
    stop();
    setIndex(0);
    setPhase(0);
    setManualReveal(false);
  }, [playlist, stop]);
  useEffect(() => stop, [stop]);

  const word = playlist[index] ?? null;
  const wordKey = word ? `${word.no}-${word.english}` : "";
  const meaningText = word ? formatMeaning(word.japanese, settings.meaningMode) : "";

  async function speakPart(kind: "en" | "ja", target: ListenWord, run: { stopped: boolean }) {
    const s = settingsRef.current;
    const japanesePair = !languageCode && isJapaneseOnlyText(target.english);
    const times = kind === "en" ? s.repeat : 1;
    for (let i = 0; i < times; i += 1) {
      if (run.stopped) return false;
      const ok =
        kind === "en"
          ? await speakText(target.english, {
              preferred: japanesePair ? "japanese" : "english",
              lang: languageCode,
              rate: rateValue(s.speed, japanesePair ? 0.95 : 0.9),
              voiceHint: japanesePair ? "male" : undefined,
              signal: run,
            })
          : await speakText(formatMeaning(target.japanese, s.meaningMode), {
              preferred: "japanese",
              rate: rateValue(s.speed, 0.95),
              voiceHint: japanesePair ? "female" : undefined,
              signal: run,
            });
      if (!ok) return false;
      if (i + 1 < times) await wait(250);
    }
    return true;
  }

  async function playOne(target: ListenWord, run: { stopped: boolean }) {
    const s = settingsRef.current;
    const first: "en" | "ja" = s.order === "ja-en" ? "ja" : "en";
    const second: "en" | "ja" | null = s.order === "en-only" ? null : first === "en" ? "ja" : "en";
    setManualReveal(false);
    setPhase(1);
    if (!(await speakPart(first, target, run))) return false;
    if (second) {
      await wait(settingsRef.current.innerGapMs);
      if (run.stopped) return false;
    }
    setPhase(2);
    if (second && !(await speakPart(second, target, run))) return false;
    return true;
  }

  async function play(from = index) {
    if (!listRef.current.length) return;
    stop();
    setError("");
    const run = { stopped: false, id: runRef.current.id + 1 };
    runRef.current = run;
    setPlaying(true);
    let i = from;
    while (!run.stopped) {
      const list = listRef.current;
      if (i >= list.length) {
        if (!settingsRef.current.loop) break;
        i = 0;
      }
      setIndex(i);
      const ok = await playOne(list[i], run);
      if (run.stopped) return;
      if (!ok) {
        setError("音声を再生できませんでした。端末の音声設定を確認して、もう一度お試しください。");
        break;
      }
      await wait(settingsRef.current.gapMs);
      i += 1;
    }
    if (runRef.current.id === run.id) {
      setPlaying(false);
      setPhase(0);
    }
  }

  function go(delta: number) {
    const wasPlaying = playing;
    stop();
    setPhase(0);
    setManualReveal(false);
    const next = Math.min(Math.max(index + delta, 0), Math.max(playlist.length - 1, 0));
    setIndex(next);
    if (wasPlaying) window.setTimeout(() => void play(next), 60);
  }

  async function playOnly() {
    if (!word) return;
    stop();
    setError("");
    const run = { stopped: false, id: runRef.current.id + 1 };
    runRef.current = run;
    setPlaying(true);
    const ok = await playOne(word, run);
    if (runRef.current.id === run.id) {
      setPlaying(false);
      if (!ok && !run.stopped) setError("音声を再生できませんでした。端末の音声設定を確認して、もう一度お試しください。");
    }
  }

  // キーボード: Space=再生/停止, ←→=前後, Enter=答え
  useEffect(() => {
    if (preview) return;
    function onKey(event: KeyboardEvent) {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || tag === "BUTTON") return;
      if (event.key === " ") {
        event.preventDefault();
        if (runRef.current.stopped) void play();
        else stop();
      } else if (event.key === "ArrowRight") go(1);
      else if (event.key === "ArrowLeft") go(-1);
      else if (event.key === "Enter") setManualReveal((value) => !value);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function visible(lang: "en" | "ja") {
    const mode = lang === "en" ? settings.enShow : settings.jaShow;
    if (mode === "hidden") return manualReveal;
    if (mode === "always") return true;
    if (manualReveal) return true;
    if (mode === "manual") return false;
    if (mode === "with-audio") {
      const firstLang = settings.order === "ja-en" ? "ja" : "en";
      return phase >= (lang === firstLang ? 1 : 2);
    }
    return phase >= 2; // after-prompt
  }

  const promptLang: "en" | "ja" = settings.order === "ja-en" ? "ja" : "en";
  const lines: Array<{ lang: "en" | "ja"; text: string }> = [
    { lang: promptLang, text: promptLang === "en" ? word?.english ?? "" : meaningText },
    ...(settings.order === "en-only" ? [] : [{ lang: promptLang === "en" ? ("ja" as const) : ("en" as const), text: promptLang === "en" ? meaningText : word?.english ?? "" }]),
  ];
  if (settings.order === "en-only") lines.push({ lang: "ja", text: meaningText });

  const progress = playlist.length ? ((index + 1) / playlist.length) * 100 : 0;
  const markedInList = words.filter((item) => markedKeys.has(`${item.no}-${item.english}`)).length;
  const limited = !isPaid && words.length > FREE_WORD_LIMIT;

  function applyPreset(preset: (typeof PRESETS)[number]) {
    if (preset.locked && !isPaid) {
      onLocked(`「${preset.label}」プリセットはPersonalプランで使えます。`);
      return;
    }
    update({ ...DEFAULTS, ...preset.apply });
  }

  const summary = {
    play: settings.order === "en-ja" ? "英語→日本語" : settings.order === "ja-en" ? "日本語→英語" : "英語だけ",
    speed: `${settings.speed.toFixed(2)}倍・間${(settings.gapMs / 1000).toFixed(1)}秒`,
  };

  return (
    <section className="mt-3 grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      <div className="min-w-0 space-y-3">
        <div className="overflow-hidden rounded-3xl border bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 px-4 pt-4 text-xs font-black text-slate-500">
            <span>
              {playlist.length ? index + 1 : 0} / {playlist.length}語{word ? ` ・ No.${word.no}` : ""}
            </span>
            <span className="flex items-center gap-2">
              {markedInList > 0 ? <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-700">★ {markedInList}語</span> : null}
              <button type="button" onClick={() => setShowSettings((value) => !value)} className="rounded-full border px-3 py-1.5 text-slate-700 lg:hidden">
                ⚙ 設定
              </button>
            </span>
          </div>
          <div className="mx-4 mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
          </div>

          {word ? (
            settings.screen === "audio-only" ? (
              <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 bg-slate-900 px-4 py-8 text-center text-white">
                <p className="text-5xl" aria-hidden>🎧</p>
                <p className="text-lg font-black">{playing ? "音声だけで再生中" : "耳だけモード"}</p>
                <p className="text-xs font-bold text-slate-300">画面を見なくても学習できます。「答えを見る」で内容を確認できます。</p>
                {manualReveal ? (
                  <div className="mt-2 rounded-2xl bg-white/10 px-5 py-3">
                    <p className="text-2xl font-black">{word.english}</p>
                    <p className="mt-1 text-lg font-bold text-sky-200">{meaningText}</p>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="relative flex min-h-[260px] flex-col justify-center px-4 pb-6 pt-12 text-center sm:min-h-[300px]">
                <button
                  type="button"
                  onClick={() => onToggleMark(word)}
                  className={`absolute right-3 top-2 rounded-full px-3 py-2 text-2xl leading-none transition ${
                    markedKeys.has(wordKey) ? "bg-amber-100 text-amber-500" : "bg-slate-100 text-slate-300 hover:text-amber-400"
                  }`}
                  aria-label={markedKeys.has(wordKey) ? "復習マークを外す" : "復習マークを付ける"}
                >
                  {markedKeys.has(wordKey) ? "★" : "☆"}
                </button>
                {lines.map((line, i) => {
                  const shown = visible(line.lang);
                  const primary = i === 0;
                  return (
                    <p
                      key={`${line.lang}-${i}`}
                      className={`break-words font-black leading-tight transition-opacity duration-200 ${
                        primary ? "text-3xl text-slate-950 sm:text-5xl" : "mt-5 text-2xl text-blue-700 sm:text-3xl"
                      } ${shown ? "opacity-100" : "opacity-0"}`}
                      aria-live={primary ? undefined : "polite"}
                    >
                      {line.text || " "}
                    </p>
                  );
                })}
                {!lines.every((line) => visible(line.lang)) ? (
                  <button type="button" onClick={() => setManualReveal(true)} className="mx-auto mt-5 rounded-full border border-slate-200 px-4 py-2 text-xs font-black text-slate-500 hover:bg-slate-50">
                    タップして答えを見る
                  </button>
                ) : null}
              </div>
            )
          ) : (
            <p className="px-4 py-16 text-center text-sm font-bold text-slate-400">範囲に単語がありません。</p>
          )}

          <div className="border-t bg-slate-50/70 px-3 py-3 sm:px-4">
            <div className="grid grid-cols-[1fr_1.6fr_1fr] gap-2">
              <button type="button" onClick={() => go(-1)} disabled={!word} className="min-h-14 rounded-2xl border bg-white text-sm font-black text-slate-700 disabled:opacity-40">
                ⏮ 前へ
              </button>
              {playing ? (
                <button type="button" onClick={stop} className="min-h-14 rounded-2xl bg-slate-900 text-base font-black text-white">
                  ⏸ 停止
                </button>
              ) : (
                <button type="button" onClick={() => void play()} disabled={!word} className="min-h-14 rounded-2xl bg-blue-600 text-base font-black text-white shadow-lg shadow-blue-600/20 disabled:bg-slate-300">
                  ▶ 連続再生
                </button>
              )}
              <button type="button" onClick={() => go(1)} disabled={!word} className="min-h-14 rounded-2xl border bg-white text-sm font-black text-slate-700 disabled:opacity-40">
                次へ ⏭
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setManualReveal((value) => !value)} disabled={!word} className="min-h-11 rounded-xl border bg-white text-xs font-black text-slate-700 disabled:opacity-40 sm:text-sm">
                {manualReveal ? "答えを隠す" : "答えを見る"}
              </button>
              <button type="button" onClick={() => void playOnly()} disabled={!word} className="min-h-11 rounded-xl border bg-white text-xs font-black text-slate-700 disabled:opacity-40 sm:text-sm">
                この単語だけ再生
              </button>
            </div>
            <p className="mt-2 hidden text-center text-[11px] font-bold text-slate-400 lg:block">Space=再生/停止 ・ ←→=前後 ・ Enter=答え</p>
            {error ? <p role="alert" className="mt-2 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
          </div>
        </div>

        {limited ? (
          <button type="button" onClick={() => onLocked(`無料会員は先頭${FREE_WORD_LIMIT}語までの再生です。Personalなら選んだ範囲すべてを再生できます。`)} className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-xs font-bold text-amber-800">
            🔒 無料会員は先頭{FREE_WORD_LIMIT}語まで再生できます（選択範囲は{words.length}語）。<span className="font-black text-amber-700"> Personalで全語を解放 ›</span>
          </button>
        ) : null}

        <div className="max-h-72 overflow-auto rounded-2xl border bg-white">
          {playlist.map((item, i) => (
            <button
              key={`${item.no}-${item.english}`}
              type="button"
              onClick={() => {
                stop();
                setIndex(i);
                setPhase(0);
                setManualReveal(false);
              }}
              className={`flex w-full items-center gap-3 border-b px-3 py-2.5 text-left last:border-b-0 ${i === index ? "bg-blue-50" : "hover:bg-slate-50"}`}
            >
              <span className="w-9 flex-none text-xs font-black text-slate-400">{item.no}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-black text-slate-900">{item.english}</span>
                <span className="block truncate text-xs font-bold text-slate-500">{formatMeaning(item.japanese, settings.meaningMode)}</span>
              </span>
              {markedKeys.has(`${item.no}-${item.english}`) ? <span className="text-amber-500">★</span> : null}
            </button>
          ))}
        </div>
      </div>

      <aside className={`min-w-0 space-y-2 lg:sticky lg:top-3 ${showSettings ? "block" : "hidden"} lg:block`}>
        <div className="flex items-center justify-between px-1">
          <p className="text-xs font-black text-slate-500">設定（タップで開閉）</p>
          <button type="button" onClick={toggleAll} className="rounded-full border bg-white px-3 py-1.5 text-xs font-black text-slate-600 hover:bg-slate-50">{openAll ? "すべて閉じる" : "すべて開く"}</button>
        </div>
        <div className="rounded-2xl border bg-white p-3">
          <p className="px-1 text-xs font-black text-slate-500">かんたん設定</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {PRESETS.map((preset) => (
              <button key={preset.id} type="button" onClick={() => applyPreset(preset)} className={`rounded-xl border px-3 py-2 text-left ${preset.locked && !isPaid ? "border-amber-200 bg-amber-50" : "bg-white hover:bg-slate-50"}`}>
                <span className="block text-sm font-black text-slate-900">
                  {preset.label}
                  {preset.locked && !isPaid ? " 🔒" : ""}
                </span>
                <span className="block text-[11px] font-bold text-slate-400">{preset.help}</span>
              </button>
            ))}
          </div>
        </div>

        <Section key={`a${epoch}`} open={openAll} title="再生内容" summary={summary.play}>
          <Field label="読み上げる順番">
            <Seg
              value={settings.order}
              onChange={(order) => update({ order })}
              onLocked={onLocked}
              options={[
                { value: "en-ja", label: "英語→日本語" },
                { value: "ja-en", label: "日本語→英語" },
                { value: "en-only", label: "英語だけ", locked: !isPaid },
              ]}
            />
          </Field>
          <Field label="意味の読み上げ範囲" locked={!isPaid}>
            <Seg
              value={settings.meaningMode}
              onChange={(meaningMode) => update({ meaningMode })}
              onLocked={onLocked}
              options={[
                { value: "main" as const, label: "主な意味だけ" },
                { value: "all" as const, label: "すべての意味", locked: !isPaid },
              ]}
            />
          </Field>
          <Field label="英語の読み上げ回数" hint="同じ単語の英語を繰り返す回数" locked={!isPaid}>
            <Seg value={settings.repeat} onChange={(repeat) => update({ repeat })} onLocked={onLocked} columns={5} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: `${n}回`, locked: !isPaid && n > 1 }))} />
          </Field>
        </Section>

        <Section key={`b${epoch}`} open={openAll} title="画面の表示" summary={settings.screen === "audio-only" ? "画面なし" : `英語:${showLabel(settings.enShow)} / 日本語:${showLabel(settings.jaShow)}`}>
          <Field label="画面" locked={!isPaid}>
            <Seg
              value={settings.screen}
              onChange={(screen) => update({ screen })}
              onLocked={onLocked}
              options={[
                { value: "on", label: "文字を表示" },
                { value: "audio-only", label: "音声だけ（画面なし）", locked: !isPaid },
              ]}
            />
          </Field>
          <Field label="英語の表示" hint="「非表示」でも「答えを見る」で確認できます" locked={!isPaid}>
            <Seg value={settings.enShow} onChange={(enShow) => update({ enShow })} onLocked={onLocked} columns={2} options={showOptions(isPaid, true)} />
          </Field>
          <Field label="日本語の表示" hint="消す・出すのタイミングを選べます" locked={!isPaid}>
            <Seg value={settings.jaShow} onChange={(jaShow) => update({ jaShow })} onLocked={onLocked} columns={2} options={showOptions(isPaid, false)} />
          </Field>
        </Section>

        <Section key={`c${epoch}`} open={openAll} title="速さ・間隔" summary={summary.speed}>
          <Field label="読み上げ速度">
            <Slider value={settings.speed} min={0.5} max={2} step={0.05} unit="倍" onChange={(speed) => update({ speed })} left="0.5倍 ゆっくり" right="2倍 はやい" />
          </Field>
          <Field label="単語と単語の間">
            <Slider value={settings.gapMs} min={0} max={10000} step={100} scale={1000} unit="秒" onChange={(gapMs) => update({ gapMs })} left="間なし" right="10秒" />
          </Field>
          <Field label="問題と答えの間" hint="考える時間。長くすると暗記チェックに使えます" locked={!isPaid}>
            <Slider value={settings.innerGapMs} min={0} max={15000} step={100} scale={1000} unit="秒" onChange={(innerGapMs) => update({ innerGapMs })} left="すぐ" right="15秒" locked={!isPaid} onLocked={onLocked} />
          </Field>
        </Section>

        <Section key={`d${epoch}`} open={openAll} title="順番・範囲" summary={[settings.shuffle ? "ランダム" : "順番どおり", settings.loop ? "ループ" : "", settings.markedOnly ? "★のみ" : ""].filter(Boolean).join("・")}>
          <Toggle checked={settings.shuffle} label="ランダム順" hint="毎回並びを変える" locked={!isPaid} onChange={(shuffle) => { update({ shuffle }); setShuffleSeed((v) => v + 1); }} onLocked={onLocked} />
          <Toggle checked={settings.loop} label="最後まで行ったら最初から繰り返す" locked={!isPaid} onChange={(loop) => update({ loop })} onLocked={onLocked} />
          <Toggle checked={settings.markedOnly} label="★をつけた単語だけ再生" hint={markedInList === 0 ? "★をつけた単語がまだありません" : `${markedInList}語が対象`} locked={!isPaid} onChange={(markedOnly) => update({ markedOnly })} onLocked={onLocked} />
          {settings.shuffle ? (
            <button type="button" onClick={() => setShuffleSeed((v) => v + 1)} className="min-h-11 w-full rounded-xl border bg-white text-sm font-black text-slate-700">
              🔀 もう一度シャッフル
            </button>
          ) : null}
        </Section>
      </aside>
    </section>
  );
}

function showLabel(show: Show) {
  return { always: "常に", "with-audio": "音と同時", "after-prompt": "後から", manual: "タップ", hidden: "非表示" }[show];
}

function showOptions(isPaid: boolean, english: boolean): Array<{ value: Show; label: string; locked?: boolean }> {
  return [
    { value: "always", label: "ずっと表示" },
    { value: "with-audio", label: "読み上げと同時に", locked: !isPaid },
    { value: "after-prompt", label: "読み上げ後に表示", locked: !isPaid && english },
    { value: "manual", label: "タップで表示", locked: !isPaid },
    { value: "hidden", label: "表示しない", locked: !isPaid },
  ];
}
