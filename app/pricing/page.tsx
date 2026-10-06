"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { PERSONAL_INTRO_JPY, PERSONAL_MONTHLY_JPY, PRINT_PAGE_JPY } from "@/lib/personal-pricing";
import { getPricingVariant, trackPricingEvent, type PricingVariant } from "@/lib/pricing-experiment";

type Plan = "free" | "personal" | "teacher";
type PaidPlan = "personal" | "teacher";
type TrialOffer = "first" | "winback" | null;

const TEACHER_PUBLIC_ENABLED = true;
const PERSONAL_PUBLIC_CONFIGURED = false;

const plans = [
  {
    id: "personal" as const,
    title: "Personal",
    price: `最初の7日間 ¥${PERSONAL_INTRO_JPY}`,
    description: "個人学習向け。最初の7日間は380円、その後は月1,580円で自動更新します。",
    features: [
      "最初の7日間は380円（初回のみ）",
      "8日目から月1,580円で自動更新",
      "印刷回数は無制限",
      "1回20ページまで出力",
      "透かしなし・記入名を設定可能",
      "マイ単語帳の保存",
      "PDF生成履歴の保存",
      "みんなの単語帳をまとめて利用可能",
      "タイトル変更・CSV出力はTeacher限定",
    ],
  },
  {
    id: "teacher" as const,
    title: "Teacher",
    price: "¥2,980/月",
    description: "先生・塾・教材作成者向け。授業で繰り返し使う教材作成を効率化します。",
    features: [
      "単語テストのタイトルを自由に変更",
      "単語リストをCSVで出力",
      "印刷回数は無制限",
      "クラス名・番号・氏名欄を設定",
      "複数教材・クラス別教材の管理",
    ],
  },
] as const;

function normalizePlan(value: unknown): Plan {
  return value === "personal" || value === "teacher" ? value : "free";
}

export default function PricingPage() {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [currentPlan, setCurrentPlan] = useState<Plan>("free");
  const [trialOffer, setTrialOffer] = useState<TrialOffer>("first");
  const [pricingVariant, setPricingVariant] = useState<PricingVariant | null>(null);
  const [message, setMessage] = useState("");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [configuredPlans, setConfiguredPlans] = useState<Record<PaidPlan, boolean>>({
    personal: PERSONAL_PUBLIC_CONFIGURED,
    teacher: false,
  });
  const [stripeLiveMode, setStripeLiveMode] = useState(PERSONAL_PUBLIC_CONFIGURED);
  const [missingStripeVars, setMissingStripeVars] = useState<string[]>([]);

  useEffect(() => {
    const variant = getPricingVariant();
    setPricingVariant(variant);
    trackPricingEvent("view", variant);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;

    async function loadUserAndPlan() {
      const { data: userData } = await client.auth.getUser();
      const nextUser = userData.user ?? null;
      setUser(nextUser);

      if (!nextUser) {
        setCurrentPlan("free");
        setTrialOffer("first");
        return;
      }

      const { data: sessionData } = await client.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setCurrentPlan("free");
        return;
      }

      const response = await fetch("/api/me/profile", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.profile?.plan) {
        setCurrentPlan(normalizePlan(result.profile.plan));
        setTrialOffer(
          result.profile.trialOffer === "first" || result.profile.trialOffer === "winback"
            ? result.profile.trialOffer
            : null
        );
      }
    }

    loadUserAndPlan();
  }, [supabase]);

  useEffect(() => {
    fetch("/api/stripe/config-status")
      .then((response) => response.json())
      .then((result) => {
        setStripeLiveMode(Boolean(result.liveMode));
        setConfiguredPlans({
          personal: Boolean(result.personalConfigured),
          teacher: Boolean(result.teacherConfigured && result.teacherPublicEnabled),
        });
        setMissingStripeVars(Array.isArray(result.missing) ? result.missing : []);
      })
      .catch(() => {
        setStripeLiveMode(false);
        setConfiguredPlans({ personal: false, teacher: false });
        setMissingStripeVars(["STRIPE_SECRET_KEY"]);
      });
  }, []);

  async function startCheckout(plan: PaidPlan) {
    if (checkoutBusy) return;
    if (plan === "teacher" && !TEACHER_PUBLIC_ENABLED) {
      setMessage("Teacherプランの公開設定を確認中です。");
      return;
    }

    if (currentPlan === plan) {
      setMessage("現在利用中のプランです。");
      return;
    }

    if (!configuredPlans[plan]) {
      if (plan === "personal" && !stripeLiveMode) {
        setMessage("現在は本番Stripeの設定確認中です。");
        return;
      }
      setMessage(`Stripe設定が未完了です: ${missingStripeVars.join(" / ")}`);
      return;
    }

    if (!user) {
      window.location.assign(plan === "personal" ? "/?print_auth=personal" : "/?checkout_plan=teacher");
      return;
    }

    if (!supabase) {
      setMessage("Supabaseの設定が未完了です。");
      return;
    }

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      window.location.assign(plan === "personal" ? "/?print_auth=personal" : "/?checkout_plan=teacher");
      return;
    }
    setCheckoutBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan, pricingVariant }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.url) {
        if (plan === "personal" && pricingVariant) trackPricingEvent("checkout", pricingVariant);
        window.location.assign(result.url);
        return;
      }
      setMessage(result.error ?? "チェックアウトページを開けませんでした。");
    } catch {
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

    const response = await fetch("/api/stripe/create-portal-session", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    const result = await response.json().catch(() => ({}));
    if (result.url) {
      window.location.href = result.url;
      return;
    }

    setMessage(result.error ?? "請求情報ページを開けませんでした。");
  }

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-900">
      <section className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-blue-700">Vocab Print Pro</p>
            <h1 className="mt-1 text-3xl font-black">料金プラン</h1>
            <p className="mt-2 text-sm text-slate-500">
              {pricingVariant === "choice"
                ? `印刷は1ページ${PRINT_PAGE_JPY}円の都度購入、またはPersonal。授業向けにはTeacherも選べます。`
                : "印刷回数を気にせず使うならPersonal。授業向けにはTeacherも選べます。"}
            </p>
          </div>
          <Link href="/" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">
            トップへ戻る
          </Link>
        </div>

        {!stripeLiveMode && (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-bold">本番Stripeの確認中です。</p>
            <p className="mt-1">
              現在は Personal の公開準備を進めています。本番 Stripe の設定が整い次第、このページから正式に課金できます。
            </p>
          </div>
        )}

        {message && <p className="mt-5 rounded-2xl bg-white p-4 text-sm shadow-sm">{message}</p>}

        <div className={`mt-6 grid gap-4 ${pricingVariant === "choice" ? "md:grid-cols-3" : "md:max-w-4xl md:grid-cols-2"}`}>
          {pricingVariant === "choice" && (
            <div className="rounded-lg border bg-white p-5 shadow-sm">
              <h2 className="text-xl font-black">都度購入</h2>
              <p className="mt-2 text-3xl font-black text-slate-900">1ページ ¥{PRINT_PAGE_JPY}</p>
              <p className="mt-3 text-sm text-slate-600">無料でアカウントを作成し、印刷するページ分だけ支払います。月額料金はありません。</p>
              <ul className="mt-4 space-y-2 text-sm text-slate-700">
                <li>・印刷するたびに決済が必要</li>
                <li>・まとめて印刷するとPersonalより高くなる場合があります</li>
                <li>・印刷回数の無料枠はありません</li>
              </ul>
              <Link href="/?print_auth=purchase" className="mt-5 block rounded-lg bg-slate-100 px-4 py-2 text-center text-sm font-bold">都度購入で始める</Link>
            </div>
          )}
          {plans.map((plan) => {
            const isCurrent = currentPlan === plan.id;
            const isTeacher = plan.id === "teacher";
            const canCheckout = plan.id === "personal" ? configuredPlans.personal : configuredPlans.teacher;

            return (
              <div key={plan.id} className={`rounded-lg border bg-white p-5 shadow-sm ${plan.id === "personal" ? "border-blue-400 ring-2 ring-blue-100" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-xl font-black">{plan.title}</h2>
                  {isTeacher && !configuredPlans.teacher && (
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
                      Stripe設定確認中
                    </span>
                  )}
                </div>
                <p className="mt-2 text-3xl font-black text-blue-600">{plan.id === "personal" && trialOffer !== "first" ? `¥${PERSONAL_MONTHLY_JPY.toLocaleString("ja-JP")}/月` : plan.price}</p>
                <p className="mt-3 text-sm text-slate-500">{plan.id === "personal" && trialOffer !== "first" ? `初回割引利用済みの方は月${PERSONAL_MONTHLY_JPY.toLocaleString("ja-JP")}円で開始します。` : plan.description}</p>
                <ul className="mt-4 space-y-2 text-sm text-slate-700">
                  {plan.features.filter((feature) => plan.id !== "personal" || trialOffer === "first" || (!feature.includes("最初の7日間") && !feature.includes("8日目から"))).map((feature) => (
                    <li key={feature}>・{feature}</li>
                  ))}
                </ul>

                {isCurrent ? (
                  <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-center text-sm font-bold text-emerald-700">
                    現在利用中
                  </div>
                ) : (
                  <button
                    onClick={() => startCheckout(plan.id)}
                    className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500"
                    disabled={!canCheckout || checkoutBusy}
                  >
                    {checkoutBusy ? "決済画面を準備中..." : !canCheckout
                      ? "Stripe設定確認中"
                      : isTeacher
                        ? "Teacherに申し込む"
                        : trialOffer === "first"
                            ? "最初の7日間380円で始める"
                            : "Personalに申し込む"}
                  </button>
                )}
                {isTeacher ? (
                  <Link href="/teacher" className="mt-3 block text-center text-xs font-black text-blue-700 hover:underline">
                    Teacherの機能を詳しく見る
                  </Link>
                ) : null}
              </div>
            );
          })}
        </div>

        <section className="mt-8 rounded-lg border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">プランの使い分け</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-black text-slate-900">{pricingVariant === "choice" ? "まず試せる" : "アカウント作成"}</p>
              <p className="mt-2 text-sm text-slate-600">
                {pricingVariant === "choice"
                  ? "アカウント作成は無料ですが、印刷の無料枠はありません。都度購入なら1ページ50円。繰り返し印刷するならPersonalの方が費用を抑えやすくなります。"
                  : "アカウントは無料で作成できます。印刷の無料枠はありません。まずはPersonalの内容を確認できます。"}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-black text-slate-900">保存ができる</p>
              <p className="mt-2 text-sm text-slate-600">
                Personalは初回7日間380円、その後月1,580円で印刷回数無制限。透かしなし、マイ単語帳と履歴も使えます。1回20ページまでです。
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-black text-slate-900">授業用の教材を効率化</p>
              <p className="mt-2 text-sm text-slate-600">
                Teacherではタイトル変更、CSV出力、クラス別教材管理など授業向けの機能を利用できます。
              </p>
            </div>
          </div>
        </section>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            onClick={openPortal}
            className="rounded-xl border bg-white px-4 py-2 text-sm font-bold shadow-sm disabled:bg-slate-100 disabled:text-slate-400"
            disabled={currentPlan === "free"}
          >
            請求情報を確認
          </button>
          <p className="text-xs text-slate-500">
            {trialOffer === "first"
              ? "初回7日間380円は申込時に決済。8日目から月1,580円で自動更新します。解約しても初週料金は返金されません。"
              : "初回割引は利用済みです。Personalは月額1,580円で再開できます。既存契約は現在の料金のまま継続します。"}
          </p>
        </div>
      </section>
    </main>
  );
}
