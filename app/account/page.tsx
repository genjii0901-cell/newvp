"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import { PERSONAL_FEATURES, personalOfferText } from "@/lib/personal-pricing";

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
    label: "無料会員（都度購入）",
    color: "bg-slate-100 text-slate-700",
    limit: "聞き流し・単語チェックは基本機能が無料。印刷は1ページ50円の都度購入です。全設定はPersonalで解放されます。",
    price: "アカウント作成は無料",
  },
  personal: {
    label: "Personal",
    color: "bg-blue-100 text-blue-700",
    limit: "印刷回数無制限（1回20ページまで）。聞き流し・単語チェックの全設定、忘却曲線の復習、履歴保存、マイ単語帳、透かしなし印刷に対応します。",
    price: "契約料金は請求情報で確認できます",
  },
  teacher: {
    label: "Teacher",
    color: "bg-purple-100 text-purple-700",
    limit: "Personalの全機能に加え、印刷タイトルの変更、20ページを超える教材の印刷、CSV出力と列名の設定が使えます。",
    price: "契約料金は請求情報で確認できます",
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
  const [trialOffer, setTrialOffer] = useState<"first" | null>("first");
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
  const [adminCapable, setAdminCapable] = useState(false);
  const [customerView, setCustomerView] = useState(false);
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
    const client = supabase;

    async function loadProfile() {
      const { data } = await client.auth.getUser();
      const nextUser = data.user ?? null;
      if (!cancelled) setUser(nextUser);

      if (!nextUser) {
        if (!cancelled) setLoading(false);
        return;
      }

      const { data: sessionData } = await client.auth.getSession();
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
        setRole(result.profile?.adminAccess === true ? "admin" : "user");
        setAdminCapable(result.profile?.adminCapable === true);
        setCustomerView(result.profile?.customerView === true);
        setTrialOffer(result.profile?.trialOffer === "first" ? "first" : null);
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

  // 管理者の試用: 購入者と同じ plan / trial_used をDBに書き、購入者ビューのON/OFFも切り替える。
  async function changeAdminPlan(payload: { plan?: Plan; trialUsed?: boolean; customerView?: boolean }) {
    if (!supabase || !user || !adminCapable) return;
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
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.profile?.plan) {
      const updatedPlan = normalizePlan(result.profile.plan);
      setPlan(updatedPlan);
      setRole(result.profile.adminAccess === true ? "admin" : "user");
      setCustomerView(result.profile.customerView === true);
      setTrialOffer(result.profile.trialOffer === "first" ? "first" : null);
      try {
        window.localStorage.setItem(`vpp-profile-plan:${user.id}`, updatedPlan);
      } catch {}
      setMsg(`試用状態を更新しました（${planInfo[updatedPlan].label}${result.profile.customerView ? "・購入者ビュー" : "・管理者ビュー"}）。`);
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
  const offerText = personalOfferText(trialOffer === "first");
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
        {role === "admin" ? (
          <p className="mt-4 text-sm font-bold text-blue-700">管理者認証中: Personal・Teacherの機能を利用できます。請求プランは変更されません。</p>
        ) : null}
        {plan === "free" && role !== "admin" && (
          <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-black text-slate-900">Personalプラン</h3>
              <p className="text-lg font-black text-blue-700">{offerText?.price ?? "料金を読み込み中…"}</p>
            </div>
            {offerText && <p className="mt-1 text-xs font-bold text-slate-600">{offerText.summary}</p>}
            <p className="mt-2 text-sm text-slate-600">個人学習向けのプランです。印刷回数を気にせず使えて、聞き流し・単語チェックの詳細設定もすべて使えます。</p>
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {PERSONAL_FEATURES.map((feature) => <li key={feature}>・{feature}</li>)}
            </ul>
            <Link href="/pricing" className="mt-4 inline-block rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
              料金プランを見る・申し込む
            </Link>
            <p className="mt-2 text-xs text-slate-500">
              無料会員のままでも、印刷は1ページ50円の都度購入でご利用いただけます。
            </p>
          </div>
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
                  最初の7日間（無料期間・初回料金の期間）に解約すると、その時点でPersonal機能が終了し、都度購入のアカウントに戻ります。
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

      {adminCapable && (
        <section className="mt-4 rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <h2 className="text-lg font-black text-amber-900">管理者の試用（購入者と同じ状態で確認）</h2>
          <p className="mt-2 text-sm text-amber-800">
            自分のアカウントを Free / Personal / Teacher に切り替えて、購入者と同じ画面・同じ制限で試せます。専用の特別処理はなく、購入者と同じ「プラン」の値を書き換えるだけなので、聞き流し・単語チェック・忘却曲線の記録も通常どおり同期されます。
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => changeAdminPlan({ customerView: !customerView })}
              disabled={adminPlanSaving}
              className={`rounded-2xl border px-4 py-3 text-sm font-black ${customerView ? "border-emerald-400 bg-emerald-100 text-emerald-900" : "border-amber-300 bg-white text-amber-900 hover:bg-amber-100"} disabled:opacity-60`}
            >
              {customerView ? "購入者ビュー：ON（管理者の全機能開放を外しています）" : "購入者ビューにする（管理者の全機能開放を外す）"}
            </button>
            <button
              onClick={() => changeAdminPlan({ trialUsed: trialOffer === "first" })}
              disabled={adminPlanSaving}
              className="rounded-2xl border border-amber-300 bg-white px-4 py-3 text-sm font-black text-amber-900 hover:bg-amber-100 disabled:opacity-60"
            >
              {trialOffer === "first" ? "初回の7日間アクセス：対象（押すと体験済みにする）" : "7日間アクセス：体験済み（押すと対象に戻す）"}
            </button>
          </div>
          <p className="mt-2 text-xs text-amber-700">
            購入者ビューがOFFのときは、管理者として全機能が開放されるため、プランを変えても見え方は変わりません。試すときはONにしてください。
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {(["free", "personal", "teacher"] as Plan[]).map((nextPlan) => {
              const current = plan === nextPlan;
              return (
                <button
                  key={nextPlan}
                  onClick={() => changeAdminPlan({ plan: nextPlan })}
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
          <Link href="/notifications" className="rounded-xl border py-3 text-center text-sm font-bold text-slate-700 hover:bg-slate-50">
            メール設定
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
