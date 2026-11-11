"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SUPPORT_LOGIN_KEY } from "@/components/support-login-banner";

// 管理画面の「お客さんとして確認」から開くページ。住所の # の後ろにある1回限りの値でログインする。
export default function SupportLoginPage() {
  const supabase = useMemo(() => createClient(), []);
  const [tokenHash, setTokenHash] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    setTokenHash(params.get("token_hash") ?? "");
    setEmail(params.get("email") ?? "");
  }, []);

  async function start() {
    if (!supabase || !tokenHash) return;
    setBusy(true);
    setMessage("");
    await supabase.auth.signOut({ scope: "local" }).catch(() => null);
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
    if (error) {
      setBusy(false);
      setMessage("ログインできませんでした。値の期限切れか、使用済みです。管理画面でもう一度作ってください。");
      return;
    }
    window.sessionStorage.setItem(SUPPORT_LOGIN_KEY, email);
    window.history.replaceState(null, "", "/support-login");
    window.location.href = "/";
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <section className="rounded-3xl border border-amber-300 bg-amber-50 p-6 shadow-sm">
        <h1 className="text-xl font-black text-amber-900">お客さんのアカウントで確認する</h1>
        {tokenHash ? (
          <>
            <p className="mt-3 text-sm font-bold leading-6 text-amber-900">
              {email || "このお客さん"} としてログインします。お客さんと同じ画面・同じ制限で表示されます。
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-amber-900">
              <li>いまのブラウザの管理者ログインは外れます。シークレットウィンドウで開くのがおすすめです。</li>
              <li>操作は本物として記録されます。<span className="font-black text-red-700">申し込み・解約・削除・単語帳の編集はしないでください。</span></li>
              <li>確認が終わったら、上の帯の「確認を終える」を押してください。</li>
            </ul>
            <button
              type="button"
              onClick={start}
              disabled={busy || !supabase}
              className="mt-5 w-full rounded-2xl bg-amber-600 px-4 py-3 text-sm font-black text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {busy ? "ログイン中..." : "このお客さんとしてログインする"}
            </button>
          </>
        ) : (
          <p className="mt-3 text-sm font-bold text-amber-900">ログイン用の値がありません。管理画面の「ユーザー調査」から開いてください。</p>
        )}
        {message ? <p role="alert" className="mt-3 text-sm font-bold text-red-700">{message}</p> : null}
      </section>
    </main>
  );
}
