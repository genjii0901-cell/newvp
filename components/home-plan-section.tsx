"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  PERSONAL_ANNUAL_JPY,
  PERSONAL_ANNUAL_MONTHLY_DISPLAY_JPY,
  PERSONAL_INTRO_DAYS,
  PERSONAL_INTRO_JPY,
  PERSONAL_MONTHLY_JPY,
  PRINT_PAGE_JPY,
  TEACHER_ANNUAL_JPY,
  TEACHER_ANNUAL_MONTHLY_DISPLAY_JPY,
  TEACHER_MONTHLY_JPY,
} from "@/lib/personal-pricing";
import AutoRenewText from "@/components/auto-renew-text";

type Plan = "free" | "personal" | "teacher";

const yen = (value: number) => `¥${value.toLocaleString("ja-JP")}`;

// 機能の比較表（無料会員 / Personal / Teacher）。true=使える、false=使えない、文字列=条件つき。
const FEATURE_ROWS: Array<[string, boolean | string, boolean | string, boolean | string]> = [
  ["聞き流し・四択（全語）", true, true, true],
  ["聞き流しの詳細設定（画面なし・ランダム・ループ・回数と間隔）", false, true, true],
  ["単語チェックの詳細設定（日→英・制限時間・★だけ出題・自動発音）", false, true, true],
  ["忘却曲線に合わせた「今日の復習」", false, true, true],
  ["自作単語帳の保存・PDF生成履歴", false, true, true],
  ["単語テストの印刷", "1ページ50円", "無制限（1回20ページまで）", "無制限（ページ上限なし）"],
  ["透かしなし・クラス／番号／氏名欄", "購入分のみ", true, true],
  ["印刷タイトルの変更", false, false, true],
  ["自作単語帳のCSV出力と列名の設定", false, false, true],
];

function Cell({ value }: { value: boolean | string }) {
  if (value === true) return <span className="font-black text-blue-700" aria-label="使える">○</span>;
  if (value === false) return <span className="text-slate-300" aria-label="使えない">—</span>;
  return <span className="block text-[10px] font-bold leading-4 text-slate-700 sm:text-[11px]">{value}</span>;
}

function CurrentBadge() {
  return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-black text-emerald-700">利用中</span>;
}

export default function HomePlanSection({ plan, introEligible, loggedIn = false }: { plan: Plan; introEligible: boolean; loggedIn?: boolean }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsRef = useRef<HTMLDivElement>(null);
  const openDetails = () => {
    setDetailsOpen(true);
    window.setTimeout(() => detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  return (
    <section className="mx-auto max-w-6xl px-3 pb-6 sm:px-5" aria-labelledby="home-plans-title">
      <div className="rounded-2xl border bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="home-plans-title" className="text-base font-black sm:text-xl">プランと料金</h2>
          <p className="text-xs font-bold text-slate-500">表示はすべて税込・Personal/Teacherは自動更新です</p>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <article className="order-1 rounded-xl border-2 border-blue-300 bg-blue-50/40 p-4 md:order-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-black">Personal</h3>
              {plan === "personal" ? <CurrentBadge /> : <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-black text-white">おすすめ</span>}
            </div>
            {introEligible ? (
              <>
                <p className="mt-1 text-xs font-bold text-slate-500">{PERSONAL_INTRO_DAYS}日間アクセス</p>
                <p className="text-2xl font-black text-blue-600">{yen(PERSONAL_INTRO_JPY)}</p>
                <p className="text-xs font-bold text-slate-600">以降 月{yen(PERSONAL_MONTHLY_JPY)}</p>
              </>
            ) : (
              <p className="mt-1 text-2xl font-black text-blue-600">{yen(PERSONAL_MONTHLY_JPY)}<span className="text-sm">/月</span></p>
            )}
            <p className="mt-1 text-xs font-bold text-slate-500">年間なら月{yen(PERSONAL_ANNUAL_MONTHLY_DISPLAY_JPY)}（年{yen(PERSONAL_ANNUAL_JPY)}）</p>
            <ul className="mt-2 space-y-1 text-xs font-bold text-slate-700">
              <li>・透かしなしで印刷（1回20ページまで）</li>
              <li>・聞き流し・単語チェックの全機能</li>
              <li>・忘却曲線で復習を自動管理{plan === "free" ? " 🔒" : ""}</li>
            </ul>
            <button type="button" onClick={openDetails} className="mt-2 py-1 text-xs font-black text-blue-700 underline">Personalの機能を詳しく見る</button>
          </article>

          <article className="order-2 rounded-xl border bg-white p-4 md:order-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-black">Teacher</h3>
              {plan === "teacher" ? <CurrentBadge /> : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-600">塾・学校向け</span>}
            </div>
            <p className="mt-1 text-2xl font-black">{yen(TEACHER_MONTHLY_JPY)}<span className="text-sm">/月</span></p>
            <p className="text-xs font-bold text-slate-500">年間なら月{yen(TEACHER_ANNUAL_MONTHLY_DISPLAY_JPY)}（年{yen(TEACHER_ANNUAL_JPY)}）</p>
            <ul className="mt-2 space-y-1 text-xs font-bold text-slate-700">
              <li>・Personalの全機能を含む</li>
              <li>・{plan === "teacher" ? "" : "🔒 "}印刷タイトルを自由に変更</li>
              <li>・{plan === "teacher" ? "" : "🔒 "}CSV出力と列名の設定</li>
            </ul>
          </article>

          <article className="order-3 rounded-xl border bg-white p-4 md:order-1">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-black">無料会員</h3>
              {loggedIn && plan === "free" ? <CurrentBadge /> : null}
            </div>
            <p className="mt-1 text-2xl font-black">{yen(PRINT_PAGE_JPY)}<span className="text-sm">/ページ</span></p>
            <p className="text-xs font-bold text-slate-500">印刷するとき<AutoRenewText text="都度お支払い" /></p>
            <ul className="mt-2 space-y-1 text-xs font-bold text-slate-700">
              <li>・聞き流し・四択は語数制限なし</li>
              <li>・月額料金はかかりません</li>
            </ul>
          </article>
        </div>

        <div ref={detailsRef} id="plan-features" className="mt-3 scroll-mt-20 rounded-xl border bg-slate-50">
          <button type="button" onClick={() => setDetailsOpen((open) => !open)} aria-expanded={detailsOpen} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-black text-slate-900">
            <span>機能を詳しく比べる（無料会員・Personal・Teacher）</span>
            <span className="text-blue-700">{detailsOpen ? "閉じる ▲" : "開く ▼"}</span>
          </button>
          {detailsOpen ? (
            <div className="px-2 pb-3 sm:px-4">
              <table className="w-full table-fixed border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b text-slate-500">
                    <th className="w-[40%] py-2 pr-2 font-black sm:w-[46%]">機能</th>
                    <th className="py-2 text-center font-black">無料</th>
                    <th className="py-2 text-center text-[11px] font-black text-blue-700 sm:text-xs">Personal</th>
                    <th className="py-2 text-center text-[11px] font-black sm:text-xs">Teacher</th>
                  </tr>
                </thead>
                <tbody>
                  {FEATURE_ROWS.map(([label, free, personal, teacher]) => (
                    <tr key={label} className="border-b border-slate-200 last:border-0">
                      <td className="py-2 pr-2 text-[11px] font-bold leading-4 text-slate-800 sm:text-xs sm:leading-5">{label}</td>
                      <td className="px-1 py-2 text-center"><Cell value={free} /></td>
                      <td className="bg-blue-50/60 px-1 py-2 text-center"><Cell value={personal} /></td>
                      <td className="px-1 py-2 text-center"><Cell value={teacher} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 px-2 text-[11px] font-bold text-slate-500">表示はすべて税込です。Personal・Teacherは自動更新で、更新前ならいつでも解約できます。</p>
            </div>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link href="/pricing" className="inline-block rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-black text-white">料金プランを見て選ぶ</Link>
          <Link href="/teacher" className="inline-block py-2 text-sm font-black text-blue-700 underline">Teacherの機能を見る</Link>
        </div>
      </div>
    </section>
  );
}
