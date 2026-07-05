"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

type Plan = "free" | "personal" | "teacher";
type Role = "user" | "admin";

const planInfo: Record<Plan, { label: string; color: string; limit: string; price: string }> = {
  free: {
    label: "Free",
    color: "bg-slate-100 text-slate-700",
    limit: "1日2回・1回1ページまで / 合計10回まで",
    price: "無料",
  },
  personal: {
    label: "Personal",
    color: "bg-blue-100 text-blue-700",
    limit: "1回5ページまで / 履歴保存・自作単語帳対応",
    price: "¥780 / 月",
  },
  teacher: {
    label: "Teacher",
    color: "bg-purple-100 text-purple-700",
    limit: "教材管理・公式単語帳管理・拡張機能",
    price: "¥2,980 / 月",
  },
};

function normalizePlan(value: unknown): Plan {
  return value === "personal" || value === "teacher" ? value : "free";
}

function getAppUrl() {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (envUrl) {
    return envUrl.replace(/\/$/, "");
  }
  return "https://www.vocabprint.com";
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
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const currentUrl = new URL(window.location.href);
    const authStatus = currentUrl.searchParams.get("auth");
    if (!authStatus) return;

    if (authStatus === "confirmed") {
      setMsg("メールアドレスの確認が完了しました。Vocab Print Pro でそのまま利用できます。");
    } else if (authStatus === "error") {
      setMsg("確認リンクの処理に失敗しました。もう一度メールのリンクを開いてください。");
    }

    currentUrl.searchParams.delete("auth");
    window.history.replaceState({}, "", currentUrl.pathname + currentUrl.search);
  }, []);

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
    setMsg("");

    const redirectUrl = `${getAppUrl()}/auth/confirm?next=/account`;
    const { error } = await supabase.auth.updateUser(
      { email: newEmail },
      { emailRedirectTo: redirectUrl }
    );

    setMsg(
      error
        ? `メールアドレス変更に失敗しました: ${error.message}`
        : "確認メールを送信しました。メール内のボタンを開くと Vocab Print Pro に戻って変更が完了します。"
    );
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

  async function deleteAccount() {
    if (!supabase || !user) return;

    const confirmed = window.confirm(
      "本当にアカウントを削除しますか？\n\n保存した履歴や作成データも削除されます。"
    );
    if (!confirmed) return;

    setDeleteLoading(true);
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;

    const response = await fetch("/api/me/delete-account", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      setMsg(result.error ?? "アカウント削除に失敗しました。");
      setDeleteLoading(false);
      return;
    }

    await supabase.auth.signOut();
    window.location.href = "/?auth=deleted";
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
  const isError = msg.includes("失敗") || msg.includes("できません");

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="text-2xl font-black text-slate-900">アカウント設定</h1>

      {msg && (
        <div className={`mt-4 rounded-2xl p-4 text-sm font-bold ${isError ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
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
          <>
            <button
              onClick={openPortal}
              disabled={portalLoading}
              className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
            >
              {portalLoading ? "開いています..." : "請求・解約を開く"}
            </button>
            <p className="mt-2 text-xs text-slate-500">
              Stripe の請求ページで、支払い方法の変更や解約ができます。
            </p>
          </>
        ) : (
          <>
            <Link href="/pricing" className="mt-4 inline-block rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
              有料プランを見る
            </Link>
            <p className="mt-2 text-xs text-slate-500">
              Freeプランでは試用ができます。印刷回数や機能に制限があります。
            </p>
          </>
        )}
      </section>

      {role === "admin" && (
        <section className="mt-4 rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <h2 className="text-lg font-black text-amber-900">管理者プレビュー</h2>
          <p className="mt-2 text-sm text-amber-800">
            管理者アカウントは Free / Personal / Teacher を切り替えて表示確認できます。
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
        <p className="mt-2 text-sm text-slate-500">
          新しいメールアドレスに確認メールを送信します。確認後に Vocab Print Pro のアカウントへ反映されます。
        </p>
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
            className="rounded-xl border px-3 py-2 text-slate-700 hover:bg-slate-50"
            aria-label={showPassword ? "パスワードを隠す" : "パスワードを表示"}
          >
            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
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

      <section className="mt-4 rounded-3xl border border-red-200 bg-red-50 p-6 shadow-sm">
        <h2 className="text-lg font-black text-red-700">アカウント削除</h2>
        <p className="mt-2 text-sm text-red-700">
          アカウントを削除すると、保存済みの履歴や利用情報も削除されます。
        </p>
        <p className="mt-2 text-xs text-red-600">
          有料プラン利用中の場合は、先に請求ページから解約しておくと安心です。
        </p>
        <button
          onClick={deleteAccount}
          disabled={deleteLoading}
          className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:bg-red-300"
        >
          {deleteLoading ? "削除中..." : "アカウントを削除"}
        </button>
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
