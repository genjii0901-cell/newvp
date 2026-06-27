"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

type Plan = "free" | "personal" | "teacher";
type PaidPlan = "personal" | "teacher";

const TEACHER_PUBLIC_ENABLED = false;

const plans = [
  {
    id: "free" as const,
    title: "Free",
    price: "¥0",
    description: "まず試したい方向けの無料プランです。",
    features: [
      "1日3回までPDF作成",
      "1回50語・1ページまで",
      "透かし付きでそのまま印刷",
      "基本の公式単語帳を体験",
    ],
  },
  {
    id: "personal" as const,
    title: "Personal",
    price: "¥780/月",
    description: "個人学習をしっかり続けたい方向け。有料機能の中心プランです。",
    features: [
      "初回30日無料トライアル",
      "Pro単語帳を利用可能",
      "マイ単語帳の保存",
      "PDF履歴の保存",
      "ページ数制限なし",
      "赤字・空欄・ランダムなどの印刷設定",
    ],
  },
  {
    id: "teacher" as const,
    title: "Teacher",
    price: "¥2,980/月",
    description: "先生・塾向けプラン。現在は準備中です。",
    features: [
      "クラス配布向けの運用",
      "複数教材の一括管理",
      "先生向けの作成機能を順次追加予定",
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
  const [message, setMessage] = useState("");
  const [configuredPlans, setConfiguredPlans] = useState<Record<PaidPlan, boolean>>({
    personal: false,
    teacher: false,
  });
  const [stripeLiveMode, setStripeLiveMode] = useState(false);
  const [missingStripeVars, setMissingStripeVars] = useState<string[]>([]);

  useEffect(() => {
    if (!supabase) return;
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
        setMissingStripeVars(["STRIPE_SECRET_KEY", "STRIPE_PRICE_PERSONAL"]);
      });
  }, []);

  async function startCheckout(plan: PaidPlan) {
    if (plan === "teacher" && !TEACHER_PUBLIC_ENABLED) {
      setMessage("Teacherプランは現在準備中です。公開まではPersonalをご利用ください。");
      return;
    }

    if (currentPlan === plan) {
      setMessage("現在利用中のプランです。");
      return;
    }

    if (!configuredPlans[plan]) {
      if (plan === "personal" && !stripeLiveMode) {
        setMessage("現在、本番課金の最終確認中です。少し時間をおいてお試しください。");
        return;
      }
      setMessage(`Stripe設定が未完了です: ${missingStripeVars.join(" / ")}`);
      return;
    }

    if (!user) {
      setMessage("先にログインしてください。");
      return;
    }

    if (!supabase) {
      setMessage("Supabaseが未設定です。");
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

    setMessage(result.error ?? "チェックアウトページを開けませんでした。");
  }

  async function openPortal() {
    if (!supabase || !user) {
      setMessage("先にログインしてください。");
      return;
    }

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (!token) {
      setMessage("ログインセッションを確認できません。");
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
              まずはFreeで試して、気に入ったらPersonalへ。Teacherは現在準備中です。
            </p>
          </div>
          <Link href="/" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">
            トップへ戻る
          </Link>
        </div>

        {!stripeLiveMode && (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-bold">本番課金の最終確認中です。</p>
            <p className="mt-1">
              現在は Personal の公開準備を進めています。本番 Stripe の設定が整い次第、このページから正式に課金できます。
            </p>
          </div>
        )}

        {message && <p className="mt-5 rounded-2xl bg-white p-4 text-sm shadow-sm">{message}</p>}

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = currentPlan === plan.id;
            const isTeacher = plan.id === "teacher";
            const canCheckout = plan.id === "personal" ? configuredPlans.personal : false;

            return (
              <div key={plan.id} className="rounded-3xl border bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-xl font-black">{plan.title}</h2>
                  {isTeacher && (
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
                      準備中
                    </span>
                  )}
                </div>
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
                ) : isCurrent ? (
                  <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-center text-sm font-bold text-emerald-700">
                    現在利用中
                  </div>
                ) : (
                  <button
                    onClick={() => startCheckout(plan.id)}
                    className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500"
                    disabled={isTeacher || !canCheckout}
                  >
                    {isTeacher
                      ? "Teacherは準備中"
                      : !canCheckout
                        ? "本番課金の設定確認中"
                        : "Personalに申し込む"}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <section className="mt-8 rounded-3xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">有料にするメリット</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-black text-slate-900">保存できる</p>
              <p className="mt-2 text-sm text-slate-600">
                自作単語帳やPDF履歴を残せるので、毎回貼り付け直さなくて済みます。
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-black text-slate-900">印刷が広がる</p>
              <p className="mt-2 text-sm text-slate-600">
                赤字、空欄、ランダム順などを使い分けて、同じ単語帳から何枚も作れます。
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-black text-slate-900">すぐ配れる</p>
              <p className="mt-2 text-sm text-slate-600">
                A4で見やすい形にまとまるので、小テストや自習プリントにそのまま使えます。
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
            請求管理ページを開く
          </button>
          <p className="text-xs text-slate-500">
            Personalは初回30日無料トライアル付きです。期間中の解約なら料金は発生しません。
          </p>
        </div>
      </section>
    </main>
  );
}
