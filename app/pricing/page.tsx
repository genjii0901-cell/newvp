"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

type Plan = "free" | "personal" | "teacher";
type PaidPlan = "personal" | "teacher";

const plans = [
  {
    id: "free",
    title: "Free",
    price: "¥0",
    description: "まず試したい人向けの無料プランです。",
    features: ["PDF回数に制限あり", "保存数に制限あり", "基本の単語帳で試せる"],
  },
  {
    id: "personal",
    title: "Personal",
    price: "¥780/月",
    description: "個人学習向けの有料プランです。",
    features: ["Pro単語帳を利用", "自作単語帳を保存", "PDF履歴を保存"],
  },
  {
    id: "teacher",
    title: "Teacher",
    price: "¥2,980/月",
    description: "先生や塾向けの拡張プランです。",
    features: ["複数教材の運用", "クラス配布用の作成", "公式教材の管理を拡張"],
  },
] as const;

function normalizePlan(value: unknown): Plan {
  return value === "personal" || value === "teacher" ? value : "free";
}

export default function PricingPage() {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [currentPlan, setCurrentPlan] = useState<Plan>("free");
  const [message, setMessage] = useState("");
  const [stripeConfigured, setStripeConfigured] = useState<boolean | null>(null);
  const [configuredPlans, setConfiguredPlans] = useState<Record<PaidPlan, boolean>>({
    personal: false,
    teacher: false,
  });
  const [missingStripeVars, setMissingStripeVars] = useState<string[]>([]);

  useEffect(() => {
    if (!supabase) {
      setMessage("Supabaseの設定がまだ入っていません。");
      return;
    }

    const client = supabase;

    async function loadUserAndPlan() {
      const { data: userData } = await client.auth.getUser();
      const nextUser = userData.user ?? null;
      setUser(nextUser);

      if (!nextUser) {
        setCurrentPlan("free");
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
      }
    }

    loadUserAndPlan();
  }, [supabase]);

  useEffect(() => {
    fetch("/api/stripe/config-status")
      .then((response) => response.json())
      .then((result) => {
        setStripeConfigured(Boolean(result.stripeSecretConfigured ?? result.stripeConfigured));
        setConfiguredPlans({
          personal: Boolean(result.personalConfigured),
          teacher: Boolean(result.teacherConfigured),
        });
        setMissingStripeVars(Array.isArray(result.missing) ? result.missing : []);
      })
      .catch(() => {
        setStripeConfigured(false);
        setConfiguredPlans({ personal: false, teacher: false });
        setMissingStripeVars(["STRIPE_SECRET_KEY", "STRIPE_PRICE_PERSONAL", "STRIPE_PRICE_TEACHER"]);
      });
  }, []);

  async function startCheckout(plan: PaidPlan) {
    if (currentPlan === plan) {
      setMessage("現在利用中のプランです。");
      return;
    }

    if (!configuredPlans[plan]) {
      setMessage(`Stripe設定が不足しています: ${missingStripeVars.join(" / ")}`);
      return;
    }

    if (!supabase || !user) {
      setMessage("先にログインしてください。");
      return;
    }

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (!token) {
      setMessage("ログインセッションを確認できません。もう一度ログインしてください。");
      return;
    }

    const response = await fetch("/api/stripe/create-checkout-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ plan }),
    });

    const result = await response.json().catch(() => ({}));
    if (result.url) {
      window.location.href = result.url;
      return;
    }

    setMessage(result.error ?? "決済ページを作成できませんでした。");
  }

  async function openPortal() {
    if (!stripeConfigured) {
      setMessage("Stripe設定がまだ完了していません。");
      return;
    }

    if (!supabase || !user) {
      setMessage("先にログインしてください。");
      return;
    }

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (!token) {
      setMessage("ログインセッションを確認できません。もう一度ログインしてください。");
      return;
    }

    const response = await fetch("/api/stripe/create-portal-session", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const result = await response.json().catch(() => ({}));
    if (result.url) {
      window.location.href = result.url;
      return;
    }

    setMessage(result.error ?? "請求管理ページを開けませんでした。");
  }

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-900">
      <section className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-blue-700">Vocab Print Pro</p>
            <h1 className="mt-1 text-3xl font-black">料金プラン</h1>
            <p className="mt-2 text-sm text-slate-500">
              Freeから始めて、必要に応じてPersonal / Teacherへ切り替えられます。
            </p>
          </div>
          <Link href="/" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">
            トップへ戻る
          </Link>
        </div>

        {stripeConfigured === false && (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-bold">Stripe設定がまだ不足しています。</p>
            <p className="mt-1">Vercelの環境変数に不足があるため、決済テストができない状態です。</p>
            <p className="mt-2 font-mono text-xs">{missingStripeVars.join(" / ")}</p>
          </div>
        )}

        {message && <p className="mt-5 rounded-2xl bg-white p-4 text-sm shadow-sm">{message}</p>}

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {plans.map((plan) => (
            <div key={plan.id} className="rounded-3xl border bg-white p-5 shadow-sm">
              <h2 className="text-xl font-black">{plan.title}</h2>
              <p className="mt-2 text-3xl font-black text-blue-600">{plan.price}</p>
              <p className="mt-3 text-sm text-slate-500">{plan.description}</p>
              <ul className="mt-4 space-y-2 text-sm text-slate-700">
                {plan.features.map((feature) => (
                  <li key={feature}>・{feature}</li>
                ))}
              </ul>
              {plan.id === "free" ? (
                <Link
                  href="/"
                  className="mt-5 block rounded-xl bg-slate-100 px-4 py-2 text-center text-sm font-bold"
                >
                  Freeで使う
                </Link>
              ) : currentPlan === plan.id ? (
                <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-center text-sm font-bold text-emerald-700">
                  現在利用中
                </div>
              ) : (
                <button
                  onClick={() => startCheckout(plan.id)}
                  className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:bg-slate-300"
                  disabled={!configuredPlans[plan.id]}
                >
                  {!configuredPlans[plan.id] ? "Stripe設定後に利用可能" : `${plan.title}に申し込む`}
                </button>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={openPortal}
          className="mt-6 rounded-xl border bg-white px-4 py-2 text-sm font-bold shadow-sm disabled:bg-slate-100 disabled:text-slate-400"
          disabled={stripeConfigured === false || currentPlan === "free"}
        >
          請求管理ページを開く
        </button>
      </section>
    </main>
  );
}
