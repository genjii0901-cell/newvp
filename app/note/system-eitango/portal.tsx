"use client";

import { Eye, EyeOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import WordbookDetailClient from "@/app/wordbooks/[id]/wordbook-detail-client";

const WORD_BOOK_ID = "105";
const ACCESS_STORAGE_KEY = "vpp-note-system-eitango-test-access";
const NOTE_CHECK_STORAGE_KEY = "vpp-note-system-eitango-test-check";

export default function SystemEitangoNotePortal() {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [noteId, setNoteId] = useState("");
  const [licenseCode, setLicenseCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [licensed, setLicensed] = useState(false);
  const [noteChecked, setNoteChecked] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setNoteChecked(window.sessionStorage.getItem(NOTE_CHECK_STORAGE_KEY) === "ok");
  }, []);

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
    window.localStorage.setItem(ACCESS_STORAGE_KEY, user.id);
    setLicensed(true);
    setMessage("利用を開始できます。現在は公開前テストとして、入力したNote IDとライセンスコードを確認済みとして扱っています。");
  }

  function confirmNoteAccess(event: React.FormEvent) {
    event.preventDefault();
    if (!noteId.trim() || !licenseCode.trim()) {
      setMessage("Note IDとライセンスコードを入力してください。");
      return;
    }
    // Temporary launch mode requested by the operator. The production version validates a server-issued code.
    window.sessionStorage.setItem(NOTE_CHECK_STORAGE_KEY, "ok");
    setNoteChecked(true);
    setMessage("確認できました。続けてメールアドレスとパスワードを登録してください。");
  }

  if (user && licensed) {
    return <div className="bg-slate-50"><div className="mx-auto max-w-7xl px-4 pt-5"><div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-900">システム英単語〈5訂版〉購入者用ポータル <span className="ml-2 text-xs font-normal text-blue-700">印刷・聞き流し・単語チェックを利用できます</span></div></div><WordbookDetailClient bookIdOverride={WORD_BOOK_ID} preservePath temporaryLicensed /></div>;
  }

  return <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900"><div className="mx-auto max-w-lg"><header className="rounded-2xl bg-blue-700 p-7 text-white shadow-sm"><p className="text-sm font-bold text-blue-100">Note購入者用・単語帳専用サイト</p><h1 className="mt-2 text-3xl font-black">システム英単語〈5訂版〉</h1><p className="mt-3 text-sm leading-6 text-blue-100">概要、単語一覧、単語テスト印刷、聞き流し、カード・4択単語チェックをまとめて使えます。</p></header>
    {message && <p className="mt-5 rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm">{message}</p>}
    {!noteChecked ? <form onSubmit={confirmNoteAccess} className="mt-5 rounded-2xl border bg-white p-6 shadow-sm"><p className="text-xs font-black text-blue-700">STEP 1 / 2</p><h2 className="mt-1 text-lg font-black">Note購入情報を確認</h2><p className="mt-2 text-sm leading-6 text-slate-600">Note記事に記載されたNote IDとライセンスコードを入力してください。現在は公開前テスト中のため、どちらも任意の文字で確認できます。</p><label className="mt-4 block text-sm font-bold">Note ID<input required value={noteId} onChange={(event) => setNoteId(event.target.value)} placeholder="例: note-system-eitango" className="mt-1 w-full rounded-xl border px-3 py-3" /></label><label className="mt-4 block text-sm font-bold">ライセンスコード<input required value={licenseCode} onChange={(event) => setLicenseCode(event.target.value)} placeholder="Noteで案内されたコード" className="mt-1 w-full rounded-xl border px-3 py-3" /></label><button className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-3 font-black text-white">確認して会員登録へ進む</button></form> : !user ? <form onSubmit={submitAuth} className="mt-5 rounded-2xl border bg-white p-6 shadow-sm"><p className="text-xs font-black text-blue-700">STEP 2 / 2</p><h2 className="mt-1 text-lg font-black">購入者アカウントを登録</h2><p className="mt-2 text-sm leading-6 text-slate-600">このアカウントでは、システム英単語〈5訂版〉の専用ページだけを利用できます。通常のVocab Print Pro本体の有料会員にはなりません。</p><div className="mt-5 flex rounded-xl bg-slate-100 p-1 text-sm font-bold"><button type="button" onClick={() => setMode("signup")} className={`flex-1 rounded-lg py-2 ${mode === "signup" ? "bg-white text-blue-700 shadow" : "text-slate-500"}`}>新規登録</button><button type="button" onClick={() => setMode("login")} className={`flex-1 rounded-lg py-2 ${mode === "login" ? "bg-white text-blue-700 shadow" : "text-slate-500"}`}>ログイン</button></div><label className="mt-5 block text-sm font-bold">メールアドレス<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-xl border px-3 py-3" /></label><label className="mt-4 block text-sm font-bold">パスワード<div className="relative mt-1"><input required minLength={6} type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border px-3 py-3 pr-12" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-3 text-slate-500" aria-label="パスワードを表示する">{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button></div></label><button disabled={busy} className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-3 font-black text-white disabled:opacity-50">{busy ? "処理中…" : mode === "signup" ? "登録して専用ページを開く" : "ログインして専用ページを開く"}</button></form> : <section className="mt-5 rounded-2xl border bg-white p-6 shadow-sm"><h2 className="text-lg font-black">システム英単語の購入者登録</h2><p className="mt-2 text-sm leading-6 text-slate-600">このアカウントにはシステム英単語〈5訂版〉だけを付与します。他の単語帳は通常どおりPersonal登録または都度決済が必要です。</p><button onClick={activate} className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-3 font-black text-white">システム英単語を利用開始する</button></section>}
    <aside className="mt-6 rounded-2xl border border-blue-100 bg-white p-5 text-sm leading-6 text-slate-600">ほかの単語帳、Excel/CSVの貼り付け、複数教材の印刷は <a href="/" className="font-black text-blue-700">Vocab Print Pro本体</a> で利用できます。</aside>
  </div></main>;
}
