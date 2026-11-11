"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import AuthDialog from "@/components/auth-dialog";

type Props = {
  label: string;
  // 開放されたとき（Teacher）に移動する先
  href: string;
  // 必要なプラン名（表示用）
  planName?: string;
  description: string;
  className?: string;
};

// 機能の場所に置く「鍵つきボタン」。
// 未ログイン → 登録・ログインのポップアップ / 無料・Personal → プラン案内 / Teacher → そのまま開く。
export default function LockedFeatureButton({ label, href, planName = "Teacher", description, className }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [plan, setPlan] = useState<string>("free");
  const [authOpen, setAuthOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setLoggedIn(false);
      return;
    }
    let cancelled = false;
    async function load(token: string | null) {
      if (!token) {
        if (!cancelled) {
          setLoggedIn(false);
          setUnlocked(false);
        }
        return;
      }
      setLoggedIn(true);
      const res = await fetch("/api/me/profile", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }).catch(() => null);
      const json = await res?.json().catch(() => null);
      if (cancelled) return;
      const nextPlan = json?.profile?.plan ?? "free";
      setPlan(nextPlan);
      setUnlocked(nextPlan === "teacher" || json?.profile?.adminAccess === true);
    }
    supabase.auth.getSession().then(({ data }) => load(data.session?.access_token ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => void load(session?.access_token ?? null));
    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  const base = className ?? "flex min-h-11 items-center rounded-xl border bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50";

  return (
    <>
      {unlocked ? (
        <Link href={href} className={base}>{label}</Link>
      ) : (
        <button
          type="button"
          onClick={() => (loggedIn ? setInfoOpen(true) : setAuthOpen(true))}
          className={base}
          aria-label={`${label}（${planName}プランで開放）`}
        >
          🔒 {label}
        </button>
      )}

      <AuthDialog
        open={authOpen}
        supabase={supabase}
        reason={`「${label}」を使うには、アカウント登録（無料）と${planName}プランが必要です。`}
        nextPath="/pricing"
        onAuthed={() => {
          setAuthOpen(false);
          setLoggedIn(true);
          setInfoOpen(true);
        }}
        onClose={() => setAuthOpen(false)}
      />

      {infoOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center" onClick={() => setInfoOpen(false)}>
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <p className="text-xs font-black text-blue-700">{planName}プランで開放</p>
            <h3 className="mt-1 text-lg font-black leading-snug text-slate-950">{label}</h3>
            <p className="mt-2 text-sm font-bold leading-6 text-slate-600">
              {description}
              {plan === "personal" ? "いまはPersonalプランです。Teacherに切り替えると使えます。" : "いまは無料会員です。Teacherに申し込むと使えます。"}
            </p>
            <div className="mt-5 space-y-2">
              <Link href="/pricing" className="block rounded-2xl bg-blue-600 px-4 py-3.5 text-center text-base font-black text-white hover:bg-blue-700">{planName}の料金を見る</Link>
              <button type="button" onClick={() => setInfoOpen(false)} className="w-full rounded-2xl border px-4 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-50">閉じる</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
