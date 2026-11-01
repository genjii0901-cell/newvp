"use client";

import { useId } from "react";
import { PERSONAL_INTRO_DAYS, PERSONAL_INTRO_JPY, PERSONAL_MONTHLY_JPY } from "@/lib/personal-pricing";
import { FREE_ACCOUNT_LABEL, FREE_STUDY_DESCRIPTION, type SignupPlan } from "@/lib/registration-plans";

export default function RegistrationPlanPicker({ value, onChange, introEligible, disabled = false }: {
  value: SignupPlan;
  onChange: (plan: SignupPlan) => void;
  introEligible: boolean;
  disabled?: boolean;
}) {
  const name = useId();
  return (
    <fieldset className="mt-4 space-y-2" disabled={disabled}>
      <legend className="mb-2 text-sm font-bold text-slate-900">登録するプラン</legend>
      <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${value === "personal" ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white"}`}>
        <input type="radio" name={name} value="personal" checked={value === "personal"} onChange={() => onChange("personal")} className="mt-1 accent-blue-600" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2 text-sm font-black text-slate-900">Personal <span className="rounded bg-blue-600 px-2 py-0.5 text-[11px] text-white">おすすめ</span></span>
          <span className="mt-1 block text-sm font-bold text-blue-700">{introEligible ? `初回${PERSONAL_INTRO_DAYS}日間${PERSONAL_INTRO_JPY}円` : `月額${PERSONAL_MONTHLY_JPY.toLocaleString("ja-JP")}円`}</span>
          {introEligible ? <span className="block text-xs leading-5 text-slate-600">その後は月額{PERSONAL_MONTHLY_JPY.toLocaleString("ja-JP")}円で自動更新。</span> : null}
          <span className="mt-1 block text-xs leading-5 text-slate-600">聞き流し・四択の詳細設定、透かしなし印刷。印刷回数は無制限（1回20ページまで）。</span>
        </span>
      </label>
      <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${value === "free" ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white"}`}>
        <input type="radio" name={name} value="free" checked={value === "free"} onChange={() => onChange("free")} className="mt-1 accent-blue-600" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-black text-slate-900">{FREE_ACCOUNT_LABEL}</span>
          <span className="mt-1 block text-xs leading-5 text-slate-600">{FREE_STUDY_DESCRIPTION}</span>
        </span>
      </label>
      <p className="text-xs leading-5 text-slate-500">プランを選ぶだけでは課金されません。Personalはアカウント登録後、Stripeの決済画面で料金を確認して申し込みます。</p>
    </fieldset>
  );
}
