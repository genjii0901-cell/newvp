"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

function toText(value: number) {
  return String(Number(value.toFixed(2)));
}

// 聞き流し・単語チェックで共通に使う設定UI部品（セクション/セグメント/スライダー）。
// 有料限定の項目は locked を渡すと 🔒 表示になり、押すと onLocked が呼ばれる。

export function Section({ title, summary, open, children }: { title: string; summary?: string; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} className="group rounded-2xl border border-slate-200 bg-white">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <span className="text-sm font-black text-slate-900">{title}</span>
        <span className="flex min-w-0 items-center gap-2">
          {summary ? <span className="truncate text-xs font-bold text-slate-500">{summary}</span> : null}
          <span className="text-slate-400 transition group-open:rotate-180" aria-hidden>▾</span>
        </span>
      </summary>
      <div className="space-y-4 border-t border-slate-100 px-4 py-4">{children}</div>
    </details>
  );
}

export function Field({ label, hint, locked, children }: { label: string; hint?: string; locked?: boolean; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <p className="text-xs font-black text-slate-600">{label}</p>
        {locked ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">Personalで解放</span> : null}
      </div>
      <div className="mt-2">{children}</div>
      {hint ? <p className="mt-1.5 text-[11px] font-bold leading-4 text-slate-400">{hint}</p> : null}
    </div>
  );
}

export type SegOption<T extends string | number> = { value: T; label: string; locked?: boolean };

export function Seg<T extends string | number>({
  value,
  options,
  onChange,
  onLocked,
  columns,
}: {
  value: T;
  options: Array<SegOption<T>>;
  onChange: (value: T) => void;
  onLocked: (reason: string) => void;
  columns?: number;
}) {
  const cols = columns ?? Math.min(options.length, 3);
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} role="radiogroup">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => (option.locked ? onLocked(`「${option.label}」はPersonalプランで使えます。`) : onChange(option.value))}
            className={`min-h-11 rounded-xl border px-2 py-2 text-xs font-black leading-4 transition sm:text-sm ${
              active
                ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                : option.locked
                  ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {option.label}
            {option.locked ? " 🔒" : ""}
          </button>
        );
      })}
    </div>
  );
}

export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  left,
  right,
  locked,
  onLocked,
  unit = "",
  scale: scaleProp,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (value: number) => string; // 旧API互換（未使用）
  onChange: (value: number) => void;
  left?: string;
  right?: string;
  locked?: boolean;
  onLocked?: (reason: string) => void;
  /** 数値入力に表示する単位（例: 倍・秒）。scale は内部値÷表示値（ミリ秒→秒なら1000）。 */
  unit?: string;
  scale?: number;
}) {
  const scale = scaleProp ?? 1;
  const [text, setText] = useState(() => toText(value / scale));
  useEffect(() => setText(toText(value / scale)), [value, scale]);

  return (
    <div onClickCapture={locked ? (event) => { event.preventDefault(); event.stopPropagation(); onLocked?.("この調整はPersonalプランで使えます。"); } : undefined}>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={locked}
          onChange={(event) => onChange(Number(event.target.value))}
          className="h-8 min-w-0 flex-1 accent-blue-600 disabled:opacity-50"
        />
        <span className="w-20 flex-none rounded-full bg-blue-50 px-2 py-1 text-center text-xs font-black text-blue-700">
          {text}
          {unit}
        </span>
      </div>
      {left || right ? (
        <div className="mt-0.5 flex justify-between text-[11px] font-bold text-slate-400">
          <span>{left}</span>
          <span>{right}</span>
        </div>
      ) : null}
    </div>
  );
}

/** 整数を直接入力するボックス（問題数・制限時間など）。確定時（Enter/フォーカス外れ）に範囲内へ丸める。 */
export function NumberBox({
  value,
  min,
  max,
  unit,
  placeholder,
  locked,
  onChange,
  onLocked,
}: {
  value: number;
  min: number;
  max: number;
  unit: string;
  placeholder?: string;
  locked?: boolean;
  onChange: (value: number) => void;
  onLocked: (reason: string) => void;
}) {
  const [text, setText] = useState(value > 0 ? String(value) : "");
  useEffect(() => setText(value > 0 ? String(value) : ""), [value]);
  function commit(raw: string) {
    if (raw.trim() === "") {
      onChange(0);
      return;
    }
    const parsed = Math.round(Number(raw));
    if (!Number.isFinite(parsed)) {
      setText(value > 0 ? String(value) : "");
      return;
    }
    const clamped = Math.min(max, Math.max(min, parsed));
    onChange(clamped);
    setText(String(clamped));
  }
  return (
    <label
      onClickCapture={locked ? (event) => { event.preventDefault(); event.stopPropagation(); onLocked("数値での指定はPersonalプランで使えます。"); } : undefined}
      className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3"
    >
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={text}
        placeholder={placeholder}
        disabled={locked}
        onChange={(event) => setText(event.target.value)}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur();
        }}
        className="min-w-0 flex-1 bg-transparent text-right text-base font-black text-slate-900 outline-none disabled:opacity-50"
      />
      <span className="text-sm font-black text-slate-500">{unit}</span>
    </label>
  );
}

export function Toggle({
  checked,
  label,
  hint,
  locked,
  onChange,
  onLocked,
}: {
  checked: boolean;
  label: string;
  hint?: string;
  locked?: boolean;
  onChange: (value: boolean) => void;
  onLocked: (reason: string) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => (locked ? onLocked(`「${label}」はPersonalプランで使えます。`) : onChange(!checked))}
      className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left ${
        locked ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white hover:bg-slate-50"
      }`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-black text-slate-800">
          {label}
          {locked ? " 🔒" : ""}
        </span>
        {hint ? <span className="block text-[11px] font-bold text-slate-400">{hint}</span> : null}
      </span>
      <span className={`relative h-6 w-11 flex-none rounded-full transition ${checked && !locked ? "bg-blue-600" : "bg-slate-300"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked && !locked ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}
