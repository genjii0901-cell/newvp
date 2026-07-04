"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

type Plan = "free" | "personal" | "teacher";
type Role = "user" | "admin";

const planInfo: Record<Plan, { label: string; color: string; limit: string; price: string }> = {
  free: {
    label: "Free",
    color: "bg-slate-100 text-slate-700",
    limit: "1日2回・1回1ページまで・通算10回まで",
    price: "無料",
  },
  personal: {
    label: "Personal",
    color: "bg-blue-100 text-blue-700",
    limit: "月300回まで・1回5ページまで",
    price: "¥780/月",
  },
  teacher: {
    label: "Teacher",
    color: "bg-purple-100 text-purple-700",
    limit: "月5000回まで・大規模運用向け",
    price: "¥2,980/月",
  },
};

function normalizePlan(v: unknown): Plan {
  return v === "personal" || v === "teacher" ? v : "free";
}

export default function AccountPage() {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [plan, setPlan] = useState<Plan>("free");
  const [role, setRole] = useState<Role>("user");
  const [loading, setLoading] = useState(true);
  const [newPassword, setNewPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [adminPlanSaving, setAdminPlanSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadProfile() {
      const { data } = await supabase.auth.getUser();
      const nextUser = data.user ?? null;
      if (!cancelled) setUser(nextUser);

      if (!nextUser) {
        if (!cancelled) setLoading(false);
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        if (!cancelled) setLoading(false);
        return;
      }

      const response = await fetch("/api/me/profile", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));

      if (!cancelled && response.ok) {
        setPlan(normalizePlan(result.profile?.plan));
        setRole(result.profile?.role === "admin" ? "admin" : "user");
      }

      if (!cancelled) setLoading(false);
    }

    loadProfile();

    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
      loadProfile();
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  async function changePassword() {
    if (!supabase || !newPassword) return;
    setSavingPw(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setMsg(error ? `パスワード変更に失敗しました: ${error.message}` : "パスワードを更新しました。");
    setNewPassword("");
    setSavingPw(false);
  }

  async function changeEmail() {
    if (!supabase || !newEmail) return;
    setSavingEmail(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    setMsg(error ? `メール変更に失敗しました: ${error.message}` : "確認メールを送信しました。");
    setNewEmail("");
    setSavingEmail(false);
  }

  async function openPortal() {
    if (!supabase) return;
    setPortalLoading(true);
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    const res = await fetch("/api/stripe/create-portal-session", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    const result = await res.json().catch(() => ({}));
    if (result.url) {
      window.location.href = result.url;
      return;
    }
    setMsg(result.message ?? result.error ?? "請求ページを開けませんでした。");
    setPortalLoading(false);
  }

  async function changeAdminPlan(nextPlan: Plan) {
    if (!supabase || !user || role !== "admin") return;
    setAdminPlanSaving(true);
    setMsg("");
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    const response = await fetch("/api/me/profile", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ plan: nextPlan }),
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.profile?.plan) {
      const updatedPlan = normalizePlan(result.profile.plan);
      setPlan(updatedPlan);
      try {
        window.localStorage.setItem(`vpp-profile-plan:${user.id}`, updatedPlan);
      } catch {}
      setMsg(`管理者プレビューを ${planInfo[updatedPlan].label} に切り替えました。`);
    } else {
      setMsg(result.error ?? "プラン変更に失敗しました。");
    }
    setAdminPlanSaving(false);
  }

  async function logout() {
    if (!supabase) return;
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-8">
        <div className="rounded-3xl border bg-white p-6 text-sm text-slate-500 shadow-sm">
          アカウント情報を読み込んでいます...
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-20 text-center">
        <p className="mt-4 font-bold text-slate-700">ログイン後に利用できます。</p>
        <Link href="/" className="mt-4 inline-block rounded-xl bg-blue-600 px-6 py-3 font-bold text-white">
          トップへ戻る
        </Link>
      </div>
    );
  }

  const info = planInfo[plan];

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="text-2xl font-black text-slate-900">アカウント設定</h1>

      {msg && (
        <div
          className={`mt-4 rounded-2xl p-4 text-sm font-bold ${
            msg.includes("失敗") ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {msg}
        </div>
      )}

      <section className="mt-6 rounded-3xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-black">現在のプラン</h2>
        <div className="mt-4 flex items-center gap-4">
          <span className={`rounded-2xl px-4 py-2 text-lg font-black ${info.color}`}>{info.label}</span>
          <div>
            <p className="font-bold text-slate-700">{info.price}</p>
            <p className="text-sm text-slate-500">{info.limit}</p>
          </div>
        </div>
        {plan !== "free" ? (
          <button
            onClick={openPortal}
            disabled={portalLoading}
            className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
          >
            {portalLoading ? "開いています..." : "請求情報を確認"}
          </button>
        ) : (
          <Link href="/pricing" className="mt-4 inline-block rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
            料金ページへ
          </Link>
        )}
      </section>

      {role === "admin" && (
        <section className="mt-4 rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <h2 className="text-lg font-black text-amber-900">管理者プレビュー</h2>
          <p className="mt-2 text-sm text-amber-800">
            管理者アカウントは Free / Personal / Teacher を自由に切り替えて確認できます。
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {(["free", "personal", "teacher"] as Plan[]).map((nextPlan) => {
              const current = plan === nextPlan;
              return (
                <button
                  key={nextPlan}
                  onClick={() => changeAdminPlan(nextPlan)}
                  disabled={adminPlanSaving || current}
                  className={`rounded-2xl border px-4 py-3 text-sm font-black ${
                    current
                      ? "border-amber-400 bg-amber-200 text-amber-900"
                      : "border-amber-200 bg-white text-amber-900 hover:bg-amber-100"
                  } disabled:opacity-60`}
                >
                  {current ? `${planInfo[nextPlan].label} 利用中` : `${planInfo[nextPlan].label} で確認`}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="mt-4 rounded-3xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-black">アカウント情報</h2>
        <div className="mt-4">
          <label className="text-sm font-bold text-slate-500">メールアドレス</label>
          <p className="mt-1 font-bold text-slate-900">{user.email}</p>
        </div>
        <div className="mt-4">
          <label className="text-sm font-bold text-slate-500">ユーザーID</label>
          <p className="mt-1 font-mono text-xs text-slate-400">{user.id}</p>
        </div>
      </section>

      <section className="mt-4 rounded-3xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-black">メールアドレスを変更</h2>
        <div className="mt-4 flex gap-2">
          <input
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            type="email"
            placeholder="新しいメールアドレス"
            className="flex-1 rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            onClick={changeEmail}
            disabled={savingEmail || !newEmail}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300"
          >
            {savingEmail ? "送信中..." : "変更する"}
          </button>
        </div>
      </section>

      <section className="mt-4 rounded-3xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-black">パスワードを変更</h2>
        <div className="mt-4 flex gap-2">
          <input
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            type={showPassword ? "text" : "password"}
            placeholder="新しいパスワード"
            className="flex-1 rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="rounded-xl border px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            {showPassword ? "隠す" : "表示"}
          </button>
          <button
            onClick={changePassword}
            disabled={savingPw || newPassword.length < 6}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300"
          >
            {savingPw ? "更新中..." : "変更する"}
          </button>
        </div>
      </section>

      <section className="mt-4 rounded-3xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-black">クイックリンク</h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Link href="/" className="rounded-xl border py-3 text-center text-sm font-bold text-slate-700 hover:bg-slate-50">
            単語テスト作成
          </Link>
          <Link href="/wordbooks" className="rounded-xl border py-3 text-center text-sm font-bold text-slate-700 hover:bg-slate-50">
            みんなの単語帳
          </Link>
          <Link href="/history" className="rounded-xl border py-3 text-center text-sm font-bold text-slate-700 hover:bg-slate-50">
            生成履歴
          </Link>
          <Link href="/pricing" className="rounded-xl border py-3 text-center text-sm font-bold text-slate-700 hover:bg-slate-50">
            料金プラン
          </Link>
        </div>
      </section>

      <div className="mt-6 text-center">
        <button
          onClick={logout}
          className="rounded-2xl border border-red-200 bg-red-50 px-6 py-3 text-sm font-bold text-red-600 hover:bg-red-100"
        >
          ログアウト
        </button>
      </div>
    </main>
  );
}
