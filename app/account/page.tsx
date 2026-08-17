"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

type Plan = "free" | "personal" | "teacher";
type Role = "user" | "admin";
type CancellationReason = "price" | "usage" | "features" | "temporary" | "other" | "skip";
type AccountManagementView = "overview" | "cancel-reason" | "cancel-confirm" | "delete";

const cancellationReasons: Array<{ value: CancellationReason; label: string }> = [
  { value: "price", label: "料金が合わなかった" },
  { value: "usage", label: "利用する機会が少なかった" },
  { value: "features", label: "必要な機能が足りなかった" },
  { value: "temporary", label: "一時的に利用をやめたい" },
  { value: "other", label: "その他" },
  { value: "skip", label: "回答しない" },
];

const planInfo: Record<Plan, { label: string; color: string; limit: string; price: string }> = {
  free: {
    label: "Free",
    color: "bg-slate-100 text-slate-700",
    limit: "1日2回、1回50語まで。合計10回までお試しできます。",
    price: "無料",
  },
  personal: {
    label: "Personal",
    color: "bg-blue-100 text-blue-700",
    limit: "語数制限なし。履歴保存、自作単語帳、透かしなし印刷に対応します。",
    price: "¥780 / 月",
  },
  teacher: {
    label: "Teacher",
    color: "bg-purple-100 text-purple-700",
    limit: "教材管理、公式単語帳管理、CSV出力などを拡張予定です。",
    price: "¥2,980 / 月",
  },
};

function normalizePlan(value: unknown): Plan {
  return value === "personal" || value === "teacher" ? value : "free";
}

function getAuthRedirectBaseUrl() {
  if (typeof window !== "undefined") {
    return window.location.origin.replace(/\/$/, "");
  }
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return envUrl ? envUrl.replace(/\/$/, "") : "https://www.vocabprint.com";
}

function getAuthConfirmUrl(next = "/account") {
  return `${getAuthRedirectBaseUrl()}/auth/confirm?next=${encodeURIComponent(next)}`;
}

function isErrorMessage(message: string) {
  return /失敗|できません|エラー|削除できません/.test(message);
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
  const [cancelLoading, setCancelLoading] = useState(false);
  const [showContractManagement, setShowContractManagement] = useState(false);
  const [accountManagementView, setAccountManagementView] = useState<AccountManagementView>("overview");
  const [cancellationReason, setCancellationReason] = useState<CancellationReason | "">("");
  const [cancellationFeedback, setCancellationFeedback] = useState("");
  const [adminPlanSaving, setAdminPlanSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteAcknowledged, setDeleteAcknowledged] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const currentUrl = new URL(window.location.href);
    const authStatus = currentUrl.searchParams.get("auth");
    if (!authStatus) return;

    if (authStatus === "confirmed") {
      setMsg("メールアドレスの確認が完了しました。Vocab Print Proをそのまま利用できます。");
    } else if (authStatus === "deleted") {
      setMsg("アカウントを削除しました。");
    } else if (authStatus === "error") {
      setMsg("確認リンクの処理に失敗しました。もう一度、最新のメール内リンクを開いてください。");
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

    void loadProfile();

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      void loadProfile();
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

    const redirectUrl = getAuthConfirmUrl("/account");
    const { error } = await supabase.auth.updateUser(
      { email: newEmail },
      { emailRedirectTo: redirectUrl }
    );

    setMsg(
      error
        ? `メールアドレス変更に失敗しました: ${error.message}`
        : "確認メールを送信しました。メール内のリンクを開くと、Vocab Print Proに戻って変更が完了します。"
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

  function openAccountManagement() {
    setAccountManagementView("overview");
    setCancellationReason("");
    setCancellationFeedback("");
    setDeleteAcknowledged(false);
    setShowContractManagement(true);
  }

  function openCancellationFlow() {
    setAccountManagementView("cancel-reason");
  }

  async function cancelSubscription() {
    if (!supabase || !user) return;

    setCancelLoading(true);
    setMsg("");
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    const response = await fetch("/api/stripe/cancel-subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        reason: cancellationReason || "skip",
        feedback: cancellationFeedback.trim().slice(0, 500),
      }),
    });
    const result = await response.json().catch(() => ({}));

    if (response.ok) {
      if (result.profile?.plan) setPlan(normalizePlan(result.profile.plan));
      setMsg(result.message ?? "解約処理が完了しました。");
      setShowContractManagement(false);
      setAccountManagementView("overview");
    } else {
      setMsg(result.error ?? "解約処理に失敗しました。時間をおいて再度お試しください。");
    }
    setCancelLoading(false);
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
        <Link href="/#auth" className="mt-4 inline-block rounded-xl bg-blue-600 px-6 py-3 font-bold text-white">
          ログイン画面へ
        </Link>
      </div>
    );
  }

  const info = planInfo[plan];
  const isError = isErrorMessage(msg);

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
        {plan === "free" && (
          <>
            <Link href="/pricing" className="mt-4 inline-block rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
              有料プランを見る
            </Link>
            <p className="mt-2 text-xs text-slate-500">
              Freeプランではお試し印刷ができます。印刷回数や機能に制限があります。
            </p>
          </>
        )}
      </section>

      <section className="mt-4 rounded-3xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-black text-slate-900">アカウント・契約管理</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          支払い方法、契約の解約、アカウント削除などの重要な手続きはこちらにまとめています。
        </p>
        <button
          type="button"
          onClick={() => {
            if (showContractManagement) {
              setShowContractManagement(false);
            } else {
              openAccountManagement();
            }
          }}
          aria-expanded={showContractManagement}
          className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100"
        >
          {showContractManagement ? "管理画面を閉じる" : "アカウント・契約管理を開く"}
        </button>

        {showContractManagement && (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            {accountManagementView === "overview" && (
              <div className="space-y-3">
                {plan !== "free" ? (
                  <div className="rounded-2xl border border-blue-100 bg-white p-4">
                    <h3 className="font-black text-slate-900">支払い・契約</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      支払い方法や請求情報の確認はStripeの安全な画面で行えます。解約は理由と確認を経て行います。
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={openPortal}
                        disabled={portalLoading}
                        className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                      >
                        {portalLoading ? "開いています..." : "支払い方法・請求を管理"}
                      </button>
                      <button
                        type="button"
                        onClick={openCancellationFlow}
                        disabled={portalLoading}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                      >
                        契約の解約手続き
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <h3 className="font-black text-slate-900">現在はFreeプランです</h3>
                    <p className="mt-1 text-sm text-slate-500">有料契約はありません。プランの変更は料金ページから行えます。</p>
                  </div>
                )}

                <div className="rounded-2xl border border-red-100 bg-white p-4">
                  <h3 className="font-black text-slate-900">アカウント削除</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    保存した単語帳、履歴、利用情報を含むアカウントの削除手続きです。削除後は元に戻せません。
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteAcknowledged(false);
                      setAccountManagementView("delete");
                    }}
                    className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-100"
                  >
                    アカウント削除を確認する
                  </button>
                </div>
              </div>
            )}

            {accountManagementView === "cancel-reason" && (
              <>
                <h3 className="font-black text-slate-900">解約理由を教えてください</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  今後の改善の参考にします。回答しないことを選んでも、解約手続きは進められます。
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {cancellationReasons.map((reason) => {
                    const selected = cancellationReason === reason.value;
                    return (
                      <button
                        key={reason.value}
                        type="button"
                        onClick={() => setCancellationReason(reason.value)}
                        className={`rounded-xl border px-3 py-2 text-left text-sm font-bold transition ${
                          selected
                            ? "border-blue-600 bg-blue-600 text-white"
                            : "border-slate-200 bg-white text-slate-700 hover:border-blue-300"
                        }`}
                      >
                        {reason.label}
                      </button>
                    );
                  })}
                </div>
                <label className="mt-4 block text-sm font-bold text-slate-700" htmlFor="cancellation-feedback">
                  ご意見（任意）
                </label>
                <textarea
                  id="cancellation-feedback"
                  value={cancellationFeedback}
                  onChange={(event) => setCancellationFeedback(event.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="改善してほしい点があれば教えてください"
                  className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setAccountManagementView("overview")}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100"
                  >
                    戻る
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountManagementView("cancel-confirm")}
                    disabled={!cancellationReason}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:bg-slate-300"
                  >
                    確認へ進む
                  </button>
                </div>
              </>
            )}

            {accountManagementView === "cancel-confirm" && (
              <>
                <h3 className="font-black text-red-700">契約を終了しますか？</h3>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  無料トライアル中に解約すると、この時点でPersonal機能は使えなくなり、Freeプランに戻ります。
                  すでに月額料金の支払いが完了している場合は、支払い済み期間の終了まで現在のプランを利用できます。
                </p>
                <p className="mt-3 rounded-xl bg-white px-3 py-2 text-xs text-slate-500">
                  選択した理由: {cancellationReasons.find((reason) => reason.value === cancellationReason)?.label ?? "回答しない"}
                </p>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setAccountManagementView("cancel-reason")}
                    disabled={cancelLoading}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                  >
                    理由を変更する
                  </button>
                  <button
                    type="button"
                    onClick={cancelSubscription}
                    disabled={cancelLoading || portalLoading}
                    className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:bg-red-300"
                  >
                    {cancelLoading ? "解約処理中..." : "契約を解約する"}
                  </button>
                </div>
              </>
            )}

            {accountManagementView === "delete" && (
              <>
                <h3 className="font-black text-red-700">アカウントを削除しますか？</h3>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  削除すると、保存した単語帳、生成履歴、利用情報を含むアカウント情報が削除され、元に戻せません。
                </p>
                {plan !== "free" && (
                  <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
                    有料契約またはトライアル中のため、先に契約の解約手続きを完了してください。支払い済み期間が残る契約は、期間終了後に削除できます。
                  </p>
                )}
                <label className="mt-4 flex items-start gap-3 rounded-xl bg-white p-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={deleteAcknowledged}
                    onChange={(event) => setDeleteAcknowledged(event.target.checked)}
                    disabled={plan !== "free" || deleteLoading}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                  />
                  <span>削除後はアカウントと保存データを復元できないことを理解しました。</span>
                </label>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setAccountManagementView("overview")}
                    disabled={deleteLoading}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                  >
                    戻る
                  </button>
                  <button
                    type="button"
                    onClick={deleteAccount}
                    disabled={plan !== "free" || !deleteAcknowledged || deleteLoading}
                    className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:bg-red-300"
                  >
                    {deleteLoading ? "削除中..." : "アカウントを削除する"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {role === "admin" && (
        <section className="mt-4 rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <h2 className="text-lg font-black text-amber-900">管理者プレビュー</h2>
          <p className="mt-2 text-sm text-amber-800">
            管理者アカウントは、表示確認用にFree / Personal / Teacherを切り替えられます。
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
                  {current ? `${planInfo[nextPlan].label} 利用中` : `${planInfo[nextPlan].label}で確認`}
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
          新しいメールアドレスに確認メールを送信します。確認後にVocab Print Proへ反映されます。
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
            単語テスト印刷
          </Link>
          <Link href="/wordbooks" className="rounded-xl border py-3 text-center text-sm font-bold text-slate-700 hover:bg-slate-50">
            単語帳
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
