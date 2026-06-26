"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

type Plan = "free" | "personal" | "teacher";
const planInfo: Record<Plan, { label: string; color: string; limit: string; price: string }> = {
  free: { label: "Free", color: "bg-slate-100 text-slate-700", limit: "1日3回・50語まで", price: "無料" },
  personal: { label: "Personal", color: "bg-blue-100 text-blue-700", limit: "月300回・300語まで", price: "¥780/月" },
  teacher: { label: "Teacher", color: "bg-purple-100 text-purple-700", limit: "月5000回・1900語まで", price: "¥2,980/月" },
};

function normalizePlan(v: unknown): Plan {
  return v === "personal" || v === "teacher" ? v : "free";
}

export default function AccountPage() {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [plan, setPlan] = useState<Plan>("free");
  const [loading, setLoading] = useState(true);
  const [newPassword, setNewPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    const sb = supabase;
    let cancelled = false;

    async function loadProfile() {
      const { data } = await sb.auth.getUser();
      const nextUser = data.user ?? null;
      if (!cancelled) setUser(nextUser);
      if (!nextUser) {
        if (!cancelled) setLoading(false);
        return;
      }

      const { data: sessionData } = await sb.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        if (!cancelled) setLoading(false);
        return;
      }

      const response = await fetch("/api/me/profile", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (!cancelled && response.ok && result.profile?.plan) {
        setPlan(normalizePlan(result.profile.plan));
      }
      if (!cancelled) setLoading(false);
    }

    loadProfile();

    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
      loadProfile();
    });
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  async function changePassword() {
    if (!supabase || !newPassword) return;
    setSavingPw(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setMsg(error ? "パスワード変更に失敗しました: " + error.message : "✅ パスワードを変更しました。");
    setNewPassword("");
    setSavingPw(false);
  }

  async function changeEmail() {
    if (!supabase || !newEmail) return;
    setSavingEmail(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    setMsg(error ? "メール変更に失敗しました: " + error.message : "✅ 確認メールを送信しました。メールを確認してください。");
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
    if (result.url) window.location.href = result.url;
    else setMsg(result.message ?? "請求管理ページを開けませんでした。");
    setPortalLoading(false);
  }

  async function logout() {
    if (!supabase) return;
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (!user && !loading) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-20 text-center">
        <p className="text-2xl">🔒</p>
        <p className="mt-4 font-bold text-slate-700">ログインが必要です</p>
        <Link href="/" className="mt-4 inline-block rounded-xl bg-blue-600 px-6 py-3 font-bold text-white">ログインへ</Link>
      </div>
    );
  }

  const info = planInfo[plan];

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="text-2xl font-black text-slate-900">アカウント設定</h1>

      {msg && (
        <div className={`mt-4 rounded-2xl p-4 text-sm font-bold ${msg.startsWith("✅") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {msg}
        </div>
      )}

      {/* Current plan */}
      <section className="mt-6 rounded-3xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-black">現在のプラン</h2>
        <div className="mt-4 flex items-center gap-4">
          <span className={`rounded-2xl px-4 py-2 text-lg font-black ${info.color}`}>{info.label}</span>
          <div>
            <p className="font-bold text-slate-700">{info.price}</p>
            <p className="text-sm text-slate-500">{info.limit}</p>
          </div>
        </div>
        {plan !== "free" && (
          <button
            onClick={openPortal}
            disabled={portalLoading}
            className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
          >
            {portalLoading ? "開いています..." : "請求管理・プラン変更"}
          </button>
        )}
        {plan === "free" && (
          <Link href="/pricing" className="mt-4 inline-block rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
            有料プランにアップグレード
          </Link>
        )}
      </section>

      {/* Account info */}
      <section className="mt-4 rounded-3xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-black">アカウント情報</h2>
        <div className="mt-4">
          <label className="text-sm font-bold text-slate-500">メールアドレス</label>
          <p className="mt-1 font-bold text-slate-900">{user?.email}</p>
        </div>
        <div className="mt-4">
          <label className="text-sm font-bold text-slate-500">ユーザーID</label>
          <p className="mt-1 font-mono text-xs text-slate-400">{user?.id}</p>
        </div>
      </section>

      {/* Change email */}
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
        <p className="mt-2 text-xs text-slate-400">※ 新しいメールアドレスに確認メールが届きます</p>
      </section>

      {/* Change password */}
      <section className="mt-4 rounded-3xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-black">パスワードを変更</h2>
        <div className="mt-4 flex gap-2">
          <input
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            type="password"
            placeholder="新しいパスワード（8文字以上）"
            className="flex-1 rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            onClick={changePassword}
            disabled={savingPw || newPassword.length < 6}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300"
          >
            {savingPw ? "変更中..." : "変更する"}
          </button>
        </div>
      </section>

      {/* Quick links */}
      <section className="mt-4 rounded-3xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-black">クイックリンク</h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Link href="/" className="rounded-xl border py-3 text-center text-sm font-bold text-slate-700 hover:bg-slate-50">単語テスト作成</Link>
          <Link href="/wordbooks" className="rounded-xl border py-3 text-center text-sm font-bold text-slate-700 hover:bg-slate-50">マイ単語帳</Link>
          <Link href="/history" className="rounded-xl border py-3 text-center text-sm font-bold text-slate-700 hover:bg-slate-50">生成履歴</Link>
          <Link href="/pricing" className="rounded-xl border py-3 text-center text-sm font-bold text-slate-700 hover:bg-slate-50">料金プラン</Link>
        </div>
      </section>

      {/* Logout */}
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
