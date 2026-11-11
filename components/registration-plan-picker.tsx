"use client";

import Link from "next/link";
import { PERSONAL_INTRO_DAYS, PERSONAL_INTRO_JPY, PERSONAL_MONTHLY_JPY, TEACHER_ANNUAL_JPY, TEACHER_ANNUAL_MONTHLY_DISPLAY_JPY, TEACHER_MONTHLY_JPY } from "@/lib/personal-pricing";
import AutoRenewText from "@/components/auto-renew-text";
import { FREE_ACCOUNT_LABEL, type SignupPlan } from "@/lib/registration-plans";

const yen = (value: number) => `${value.toLocaleString("ja-JP")}円`;

// 登録画面のプラン表示。
// 普通の登録ではプランを選ばせない（アカウント作成だけ）。料金ページなどで申し込みを押して来た人には「選択中のプラン」だけを見せる。
export default function RegistrationPlanPicker({ value, onChange, introEligible, disabled = false, teacherSelected = false }: {
  value: SignupPlan;
  onChange: (plan: SignupPlan) => void;
  introEligible: boolean;
  disabled?: boolean;
  teacherSelected?: boolean;
}) {
  if (teacherSelected || value === "personal") {
    return (
      <div className="mt-4 rounded-lg border border-blue-300 bg-blue-50 p-3">
        <p className="text-xs font-black text-blue-700">選択中のプラン</p>
        {teacherSelected ? (
          <>
            <p className="mt-1 text-sm font-black text-slate-900">Teacher（塾・学校向け）</p>
            <p className="mt-0.5 text-xs leading-5 text-slate-600">月{yen(TEACHER_MONTHLY_JPY)}（税込）／年間は月換算{yen(TEACHER_ANNUAL_MONTHLY_DISPLAY_JPY)}（年{yen(TEACHER_ANNUAL_JPY)}）・自動更新</p>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm font-black text-slate-900">Personal</p>
            <p className="mt-0.5 text-xs leading-5 text-slate-600">
              {introEligible ? `${PERSONAL_INTRO_DAYS}日間アクセス ${yen(PERSONAL_INTRO_JPY)}、以降は月${yen(PERSONAL_MONTHLY_JPY)}（税込・自動更新）` : `月${yen(PERSONAL_MONTHLY_JPY)}（税込・自動更新）`}
            </p>
          </>
        )}
        <p className="mt-2 text-xs leading-5 text-slate-500">アカウント登録後、Stripeの決済画面で料金と更新条件を確認してから申し込みます。登録だけでは課金されません。</p>
        <button type="button" disabled={disabled} onClick={() => onChange("free")} className="mt-2 py-1 text-xs font-black text-blue-700 underline disabled:opacity-50">
          プランはあとで選ぶ（無料会員として登録）
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm font-black text-slate-900"><AutoRenewText text={FREE_ACCOUNT_LABEL} /></p>
      <p className="mt-1 text-xs leading-5 text-slate-600">
        登録は無料です。聞き流し・四択はすぐ使えます。有料プランは、あとで料金ページや印刷のときに選べます。
      </p>
      <Link href="/pricing" className="mt-1 inline-block py-1 text-xs font-black text-blue-700 underline">料金プランを見る</Link>
    </div>
  );
}
