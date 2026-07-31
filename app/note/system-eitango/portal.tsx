"use client";

import { Eye, EyeOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import WordbookDetailClient from "@/app/wordbooks/[id]/wordbook-detail-client";

const WORD_BOOK_ID = "105";
const ACCESS_STORAGE_KEY = "vpp-note-system-eitango-test-access";

export default function SystemEitangoNotePortal() {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [key, setKey] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [licensed, setLicensed] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      setUser(data.user ?? null);
    }
    void loadUser();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!user || typeof window === "undefined") {
      setLicensed(false);
      return;
    }
    setLicensed(window.localStorage.getItem(ACCESS_STORAGE_KEY) === user.id);
  }, [user]);

  async function submitAuth(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) { setMessage("ログイン機能の設定が未完了です。"); return; }
    setBusy(true);
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      setMessage(error ? "メールアドレスまたはパスワードが違います。" : "ログインしました。続けて確認キーを入力してください。");
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent("/note/system-eitango")}` },
    });
    setBusy(false);
    if (error) { setMessage(error.message); return; }
    setMessage(data.session ? "登録しました。続けて確認キーを入力してください。" : "確認メールを送信しました。認証後にこのページをもう一度開いてログインしてください。");
  }

  function activate() {
    if (!user) return;
    if (!key.trim()) { setMessage("確認キーを入力してください。"); return; }
    // Temporary launch mode requested by the operator. Replace with API validation before sales begin.
    window.localStorage.setItem(ACCESS_STORAGE_KEY, user.id);
    setLicensed(true);
    setMessage("利用を開始できます。現在は公開前テストとして、任意の確認キーで有効化されます。");
  }

  if (user && licensed) {
    return <div className="bg-slate-50"><div className="mx-auto max-w-7xl px-4 pt-5"><div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-900">システム英単語〈5訂版〉購入者用ポータル <span className="ml-2 text-xs font-normal text-blue-700">印刷・聞き流し・単語チェックを利用できます</span></div></div><WordbookDetailClient bookIdOverride={WORD_BOOK_ID} preservePath temporaryLicensed /></div>;
  }

  return <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900"><div className="mx-auto max-w-lg"><header className="rounded-2xl bg-blue-700 p-7 text-white shadow-sm"><p className="text-sm font-bold text-blue-100">Note購入者用・単語帳専用サイト</p><h1 className="mt-2 text-3xl font-black">システム英単語〈5訂版〉</h1><p className="mt-3 text-sm leading-6 text-blue-100">概要、単語一覧、単語テスト印刷、聞き流し、カード・4択単語チェックをまとめて使えます。</p></header>
    {message && <p className="mt-5 rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm">{message}</p>}
    {!user ? <form onSubmit={submitAuth} className="mt-5 rounded-2xl border bg-white p-6 shadow-sm"><div className="flex rounded-xl bg-slate-100 p-1 text-sm font-bold"><button type="button" onClick={() => setMode("signup")} className={`flex-1 rounded-lg py-2 ${mode === "signup" ? "bg-white text-blue-700 shadow" : "text-slate-500"}`}>新規登録</button><button type="button" onClick={() => setMode("login")} className={`flex-1 rounded-lg py-2 ${mode === "login" ? "bg-white text-blue-700 shadow" : "text-slate-500"}`}>ログイン</button></div><label className="mt-5 block text-sm font-bold">メールアドレス<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-xl border px-3 py-3" /></label><label className="mt-4 block text-sm font-bold">パスワード<div className="relative mt-1"><input required minLength={6} type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border px-3 py-3 pr-12" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-3 text-slate-500" aria-label="パスワードを表示する">{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button></div></label><button disabled={busy} className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-3 font-black text-white disabled:opacity-50">{busy ? "処理中…" : mode === "signup" ? "登録して確認キーへ進む" : "ログインして確認キーへ進む"}</button></form> : <section className="mt-5 rounded-2xl border bg-white p-6 shadow-sm"><h2 className="text-lg font-black">購入者確認キーを入力</h2><p className="mt-2 text-sm leading-6 text-slate-600">公開前テスト中のため、現在は任意の文字を入力すると利用開始できます。本番公開時にはNote購入者だけに渡すキーで確認します。</p><input value={key} onChange={(event) => setKey(event.target.value)} placeholder="確認キー" className="mt-4 w-full rounded-xl border px-3 py-3" /><button onClick={activate} className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-3 font-black text-white">利用を開始する</button></section>}
    <aside className="mt-6 rounded-2xl border border-blue-100 bg-white p-5 text-sm leading-6 text-slate-600">ほかの単語帳、Excel/CSVの貼り付け、複数教材の印刷は <a href="/" className="font-black text-blue-700">Vocab Print Pro本体</a> で利用できます。</aside>
  </div></main>;
}
