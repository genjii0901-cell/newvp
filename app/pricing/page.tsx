"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import AuthDialog from "@/components/auth-dialog";
import {
  PERSONAL_ANNUAL_JPY,
  PERSONAL_ANNUAL_MONTHLY_DISPLAY_JPY,
  PERSONAL_FEATURES,
  PERSONAL_INTRO_DAYS,
  PERSONAL_INTRO_JPY,
  PERSONAL_MONTHLY_JPY,
  PRINT_PAGE_JPY,
  TEACHER_ANNUAL_JPY,
  TEACHER_ANNUAL_MONTHLY_DISPLAY_JPY,
  TEACHER_FEATURES,
  TEACHER_MONTHLY_JPY,
  type BillingInterval,
} from "@/lib/personal-pricing";
import { getPricingVariant, trackPricingEvent } from "@/lib/pricing-experiment";
import { FREE_ACCOUNT_LABEL, FREE_STUDY_DESCRIPTION } from "@/lib/registration-plans";
import AutoRenewText from "@/components/auto-renew-text";

type Plan = "free" | "personal" | "teacher";
type PaidPlan = "personal" | "teacher";
type TrialOffer = "first" | "winback" | null;
type Selection = { plan: PaidPlan; interval: BillingInterval };

const RESUME_KEY = "vpp-pricing-resume-v1";
const yen = (value: number) => `¥${value.toLocaleString("ja-JP")}`;

function normalizePlan(value: unknown): Plan {
  return value === "personal" || value === "teacher" ? value : "free";
}

// 申込内容の説明（確認ポップアップで使う）。税込。
function describeSelection(selection: Selection, introEligible: boolean) {
  const { plan, interval } = selection;
  if (plan === "personal" && interval === "month" && introEligible) {
    return {
      title: `Personal ${PERSONAL_INTRO_DAYS}日間アクセス`,
      today: yen(PERSONAL_INTRO_JPY),
      lines: [
        `今日のお支払い: ${yen(PERSONAL_INTRO_JPY)}（${PERSONAL_INTRO_DAYS}日間アクセス）`,
        `${PERSONAL_INTRO_DAYS + 1}日目から自動で月${yen(PERSONAL_MONTHLY_JPY)}（毎月自動更新）`,
        "更新前ならいつでも解約できます",
      ],
    };
  }
  if (plan === "personal") {
    const year = interval === "year";
    return {
      title: year ? "Personal 年間アクセス" : "Personal 月額",
      today: yen(year ? PERSONAL_ANNUAL_JPY : PERSONAL_MONTHLY_JPY),
      lines: year
        ? [`今日のお支払い: 年額${yen(PERSONAL_ANNUAL_JPY)}（一括払い・月換算 約${yen(PERSONAL_ANNUAL_MONTHLY_DISPLAY_JPY)}）`, "1年ごとに自動更新", "更新前ならいつでも解約できます"]
        : [`今日のお支払い: ${yen(PERSONAL_MONTHLY_JPY)}`, "毎月自動更新", "更新前ならいつでも解約できます"],
    };
  }
  const year = interval === "year";
  return {
    title: year ? "Teacher（塾プラン）年間" : "Teacher（塾プラン）月間",
    today: yen(year ? TEACHER_ANNUAL_JPY : TEACHER_MONTHLY_JPY),
    lines: year
      ? [`今日のお支払い: 年額${yen(TEACHER_ANNUAL_JPY)}（一括払い・月換算 ${yen(TEACHER_ANNUAL_MONTHLY_DISPLAY_JPY)}）`, "1年ごとに自動更新", "更新前ならいつでも解約できます"]
      : [`今日のお支払い: ${yen(TEACHER_MONTHLY_JPY)}`, "毎月自動更新", "更新前ならいつでも解約できます"],
  };
}

export default function PricingPage() {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [currentPlan, setCurrentPlan] = useState<Plan>("free");
  const [trialOffer, setTrialOffer] = useState<TrialOffer>("first");
  const pricingVariant = getPricingVariant();
  const [message, setMessage] = useState("");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [configuredPlans, setConfiguredPlans] = useState<Record<PaidPlan, boolean>>({ personal: false, teacher: false });
  const [stripeLiveMode, setStripeLiveMode] = useState(false);
  const [configState, setConfigState] = useState<"loading" | "ready" | "error">("loading");
  const [configAttempt, setConfigAttempt] = useState(0);
  // 登録ポップアップ→内容確認ポップアップ→Stripe の順に、ページ移動なしで進める。
  const [selection, setSelection] = useState<Selection | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [userReady, setUserReady] = useState(false);

  const introEligible = trialOffer === "first";

  useEffect(() => {
    trackPricingEvent("view", pricingVariant);
  }, [pricingVariant]);

  const loadUserAndPlan = useCallback(async () => {
    if (!supabase) {
      setUserReady(true);
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    const nextUser = userData.user ?? null;
    setUser(nextUser);

    if (!nextUser) {
      setCurrentPlan("free");
      setTrialOffer("first");
      setUserReady(true);
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (token) {
      const response = await fetch("/api/me/profile", { headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.profile?.plan) {
        setCurrentPlan(normalizePlan(result.profile.plan));
        setTrialOffer(
          result.profile.trialOffer === "first" || result.profile.trialOffer === "winback" ? result.profile.trialOffer : null,
        );
      }
    }
    setUserReady(true);
  }, [supabase]);

  useEffect(() => {
    void loadUserAndPlan();
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange(() => {
      void loadUserAndPlan();
    });
    return () => data.subscription.unsubscribe();
  }, [supabase, loadUserAndPlan]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    fetch("/api/stripe/config-status", { cache: "no-store", signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Configuration unavailable");
        return response.json();
      })
      .then((result) => {
        if (!active) return;
        if (!result.ok) throw new Error("Configuration unavailable");
        setStripeLiveMode(Boolean(result.liveMode));
        setConfiguredPlans({
          personal: Boolean(result.personalConfigured),
          teacher: Boolean(result.teacherConfigured && result.teacherPublicEnabled),
        });
        setConfigState("ready");
      })
      .catch(() => {
        if (!active) return;
        setStripeLiveMode(false);
        setConfiguredPlans({ personal: false, teacher: false });
        setConfigState("error");
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [configAttempt]);

  // Google/LINEやメール認証で一度ページを離れた人が戻ってきたら、選んでいたプランの確認画面から再開する。
  useEffect(() => {
    if (!userReady || !user) return;
    try {
      const raw = window.localStorage.getItem(RESUME_KEY);
      if (!raw) return;
      window.localStorage.removeItem(RESUME_KEY);
      const saved = JSON.parse(raw) as { plan?: unknown; interval?: unknown; at?: unknown };
      const fresh = typeof saved.at === "number" && Date.now() - saved.at < 60 * 60 * 1000;
      if (fresh && (saved.plan === "personal" || saved.plan === "teacher")) {
        setSelection({ plan: saved.plan, interval: saved.interval === "year" ? "year" : "month" });
        setConfirmOpen(true);
      }
    } catch {
      // 再開できなくても、ボタンからやり直せる
    }
  }, [userReady, user]);

  function chooseSelection(next: Selection) {
    if (checkoutBusy) return;
    if (currentPlan === next.plan) {
      setMessage("現在利用中のプランです。");
      return;
    }
    if (!configuredPlans[next.plan]) {
      setMessage(
        next.plan === "personal" && !stripeLiveMode
          ? "現在は本番Stripeの設定確認中です。"
          : "現在、決済の設定を確認しています。しばらくしてから再度お試しください。",
      );
      return;
    }
    setMessage("");
    setSelection(next);
    if (!user) setAuthOpen(true);
    else setConfirmOpen(true);
  }

  function rememberSelection() {
    if (!selection) return;
    try {
      window.localStorage.setItem(RESUME_KEY, JSON.stringify({ ...selection, at: Date.now() }));
    } catch {
      // 保存できなくても、戻ってからもう一度選べる
    }
  }

  async function startCheckout() {
    if (checkoutBusy || !selection) return;
    if (!supabase) {
      setMessage("Supabaseの設定が未完了です。");
      return;
    }
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setConfirmOpen(false);
      setAuthOpen(true);
      return;
    }
    setCheckoutBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan: selection.plan, interval: selection.interval, pricingVariant }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.url) {
        if (selection.plan === "personal") trackPricingEvent("checkout", pricingVariant);
        window.location.assign(result.url);
        return;
      }
      setConfirmOpen(false);
      setMessage(result.error ?? "チェックアウトページを開けませんでした。");
    } catch {
      setConfirmOpen(false);
      setMessage("通信に失敗しました。接続を確認してもう一度お試しください。");
    } finally {
      setCheckoutBusy(false);
    }
  }

  async function openPortal() {
    if (!supabase || !user) {
      setMessage("先にログインしてください。");
      return;
    }
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setMessage("ログインセッションを確認できませんでした。");
      return;
    }
    const response = await fetch("/api/stripe/create-portal-session", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    const result = await response.json().catch(() => ({}));
    if (result.url) {
      window.location.href = result.url;
      return;
    }
    setMessage(result.error ?? "請求情報ページを開けませんでした。");
  }

  const summary = selection ? describeSelection(selection, introEligible) : null;
  const personalReady = configuredPlans.personal;
  const teacherReady = configuredPlans.teacher;

  return (
    <main className="min-h-screen bg-slate-50 px-3 pb-24 pt-4 text-slate-900 sm:px-5 sm:py-8">
      <section className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-blue-700">Vocab Print Pro</p>
            <h1 className="mt-0.5 text-xl font-black sm:mt-1 sm:text-3xl">料金プラン</h1>
            <p className="mt-1 text-xs text-slate-500 sm:mt-2 sm:text-sm">
              <>印刷は1ページ{PRINT_PAGE_JPY}円の<AutoRenewText text="都度購入" />、または印刷無制限＋聞き流し・単語チェック全機能のPersonal。表示はすべて税込です。</>
            </p>
          </div>
          <Link href="/" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">
            トップへ戻る
          </Link>
        </div>

        {configState === "loading" ? (
          <p className="mt-5 text-sm text-slate-500" role="status">お申し込みの準備状況を確認しています…</p>
        ) : configState === "error" ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 sm:mt-5 sm:p-4 sm:text-sm" role="status">
            <p>決済情報を読み込めませんでした。接続を確認して再度お試しください。</p>
            <button type="button" onClick={() => { setConfigState("loading"); setConfigAttempt((value) => value + 1); }} className="rounded-lg border border-amber-300 bg-white px-3 py-2 font-bold">再確認</button>
          </div>
        ) : (!stripeLiveMode || !personalReady) && (
          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 sm:mt-5 sm:p-4 sm:text-sm">
            <p className="font-bold">本番Stripeの確認中です。</p>
            <p className="mt-1">本番 Stripe の設定が整い次第、このページから正式に課金できます。</p>
          </div>
        )}

        {message && <p role="status" className="mt-5 rounded-2xl bg-white p-4 text-sm shadow-sm">{message}</p>}

        <div className="mt-4 grid gap-3 sm:mt-6 sm:gap-4 md:grid-cols-3">
          <div className="order-3 rounded-lg border bg-white p-4 shadow-sm sm:p-5 md:order-1">
            <h2 className="text-base font-black sm:text-xl">{FREE_ACCOUNT_LABEL}</h2>
            <p className="mt-1 text-2xl font-black text-slate-900 sm:mt-2 sm:text-3xl">1ページ ¥{PRINT_PAGE_JPY}</p>
            <p className="mt-2 text-[13px] text-slate-600 sm:mt-3 sm:text-sm">{FREE_STUDY_DESCRIPTION}</p>
            <ul className="mt-3 space-y-1.5 text-[13px] text-slate-700 sm:mt-4 sm:space-y-2 sm:text-sm">
              <li>・印刷するたびに決済が必要</li>
              <li>・まとめて印刷するとPersonalより高くなる場合があります</li>
              <li>・印刷回数の無料枠はありません</li>
            </ul>
            <Link href="/?print_auth=free" className="mt-5 block rounded-lg bg-slate-100 px-4 py-2 text-center text-sm font-bold">無料会員で始める（印刷は<AutoRenewText text="都度課金" />）</Link>
          </div>

          <div className="order-1 rounded-lg border border-blue-400 bg-white p-4 shadow-sm ring-2 ring-blue-100 sm:p-5 md:order-2">
            <h2 className="text-base font-black sm:text-xl">Personal</h2>
            {introEligible ? (
              <>
                <p className="mt-2 text-sm font-bold text-slate-500">{PERSONAL_INTRO_DAYS}日間アクセス</p>
                <p className="text-3xl font-black text-blue-600 sm:text-4xl">{yen(PERSONAL_INTRO_JPY)}</p>
                <p className="mt-1 text-xs font-bold text-slate-600">以降 月{yen(PERSONAL_MONTHLY_JPY)}（自動更新・税込）</p>
              </>
            ) : (
              <>
                <p className="mt-2 text-3xl font-black text-blue-600 sm:text-4xl">{yen(PERSONAL_MONTHLY_JPY)}<span className="text-base">/月</span></p>
                <p className="mt-1 text-xs font-bold text-slate-600">毎月自動更新・税込（初回特典は利用済み）</p>
              </>
            )}
            <ul className="mt-3 space-y-1.5 text-[13px] text-slate-700 sm:mt-4 sm:space-y-2 sm:text-sm">
              {PERSONAL_FEATURES.map((feature) => <li key={feature}>・{feature}</li>)}
            </ul>
            {currentPlan === "personal" ? (
              <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-center text-sm font-bold text-emerald-700">現在利用中</div>
            ) : (
              <>
                <button type="button" onClick={() => chooseSelection({ plan: "personal", interval: "month" })} disabled={checkoutBusy || configState === "loading"} className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500">
                  {introEligible ? `${PERSONAL_INTRO_DAYS}日間${yen(PERSONAL_INTRO_JPY)}で始める` : "Personalに申し込む"}
                </button>
                <div className="mt-4 border-t pt-3">
                  <p className="text-xs font-bold text-slate-500">年間アクセス（一括払い）</p>
                  <p className="mt-1 text-sm font-black text-slate-900">{yen(PERSONAL_ANNUAL_MONTHLY_DISPLAY_JPY)}<span className="text-xs font-bold text-slate-500">/月</span></p>
                  <p className="text-[11px] font-bold text-slate-500">年額{yen(PERSONAL_ANNUAL_JPY)}を一括でお支払い・1年ごとに自動更新（税込）</p>
                  <button type="button" onClick={() => chooseSelection({ plan: "personal", interval: "year" })} disabled={checkoutBusy || configState === "loading"} className="mt-2 w-full rounded-lg border px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:text-slate-400">
                    年間アクセスで申し込む
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="order-2 rounded-lg border bg-white p-4 shadow-sm sm:p-5 md:order-3">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-base font-black sm:text-xl">Teacher</h2>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">塾・先生向け</span>
            </div>
            <p className="mt-1 text-3xl font-black text-slate-900 sm:mt-2 sm:text-4xl">{yen(TEACHER_MONTHLY_JPY)}<span className="text-base">/月</span></p>
            <p className="mt-1 text-xs font-bold text-slate-600">毎月自動更新・税込</p>
            <ul className="mt-3 space-y-1.5 text-[13px] text-slate-700 sm:mt-4 sm:space-y-2 sm:text-sm">
              {TEACHER_FEATURES.map((feature) => <li key={feature}>・{feature}</li>)}
            </ul>
            {currentPlan === "teacher" ? (
              <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-center text-sm font-bold text-emerald-700">現在利用中</div>
            ) : (
              <>
                <button type="button" onClick={() => chooseSelection({ plan: "teacher", interval: "month" })} disabled={checkoutBusy || configState === "loading"} className="mt-5 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-700 disabled:bg-slate-300 disabled:text-slate-500">
                  月間で申し込む
                </button>
                <div className="mt-4 border-t pt-3">
                  <p className="text-xs font-bold text-slate-500">年間（一括払い）</p>
                  <p className="mt-1 text-sm font-black text-slate-900">{yen(TEACHER_ANNUAL_MONTHLY_DISPLAY_JPY)}<span className="text-xs font-bold text-slate-500">/月換算</span></p>
                  <p className="text-[11px] font-bold text-slate-500">年額{yen(TEACHER_ANNUAL_JPY)}を一括でお支払い・1年ごとに自動更新（税込）</p>
                  <button type="button" onClick={() => chooseSelection({ plan: "teacher", interval: "year" })} disabled={checkoutBusy || configState === "loading"} className="mt-2 w-full rounded-lg border px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:text-slate-400">
                    年間で申し込む
                  </button>
                </div>
              </>
            )}
            {!teacherReady && configState === "ready" ? <p className="mt-2 text-[11px] font-bold text-amber-700">現在、お申し込みの準備中です。</p> : null}
            <Link href="/teacher" className="mt-3 block text-center text-xs font-black text-blue-700 hover:underline">Teacherの機能を詳しく見る</Link>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button onClick={openPortal} className="rounded-xl border bg-white px-4 py-2 text-sm font-bold shadow-sm disabled:bg-slate-100 disabled:text-slate-400" disabled={currentPlan === "free"}>
            請求情報を確認
          </button>
          <p className="text-xs text-slate-500">
            {introEligible
              ? `${PERSONAL_INTRO_DAYS}日間アクセス${yen(PERSONAL_INTRO_JPY)}は申込時に決済。以降は自動で月${yen(PERSONAL_MONTHLY_JPY)}に移ります。解約しても初回料金は返金されません。既存の契約は現在の料金のまま継続します。`
              : "初回特典は利用済みです。既存の契約は現在の料金のまま継続します。"}
          </p>
        </div>
      </section>

      <AuthDialog
        open={authOpen && !user}
        supabase={supabase}
        reason="登録だけでは料金はかかりません。次の画面でお支払い内容を確認してから進みます。"
        nextPath="/pricing"
        onBeforeRedirect={rememberSelection}
        onAuthed={() => {
          setAuthOpen(false);
          void loadUserAndPlan().then(() => setConfirmOpen(true));
        }}
        onClose={() => setAuthOpen(false)}
      />

      {confirmOpen && summary && selection ? (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={checkoutBusy ? undefined : () => setConfirmOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="お支払い内容の確認" className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl sm:p-7" onClick={(event) => event.stopPropagation()}>
            <p className="text-center text-xs font-black text-blue-700">ステップ 2 / 2</p>
            <h3 className="mt-1 text-center text-xl font-black text-slate-950">お支払い内容の確認</h3>
            <div className="mt-4 rounded-2xl bg-slate-50 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-black text-slate-800">{summary.title}</span>
                <span className="text-2xl font-black text-slate-950">{summary.today}</span>
              </div>
              <ul className="mt-3 space-y-1.5 text-xs font-bold leading-5 text-slate-600">
                {summary.lines.map((line) => <li key={line}>・<AutoRenewText text={line} /></li>)}
                <li>・表示はすべて税込です</li>
              </ul>
            </div>
            <button type="button" onClick={startCheckout} disabled={checkoutBusy} className="mt-4 w-full rounded-2xl bg-blue-600 px-4 py-3.5 text-base font-black text-white shadow-lg shadow-blue-600/25 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
              {checkoutBusy ? "決済ページを準備中..." : "Stripeで支払う"}
            </button>
            <button type="button" onClick={() => setConfirmOpen(false)} disabled={checkoutBusy} className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-50">
              戻る
            </button>
            <p className="mt-3 text-center text-[11px] font-bold text-slate-400">支払いはStripeの安全な決済画面で行います。</p>
          </div>
        </div>
      ) : null}
    </main>
  );
}
