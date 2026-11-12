"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeAuthErrorMessage, withAuthTimeout } from "@/lib/auth";
import AutoRenewText from "@/components/auto-renew-text";

// ページ移動なしで開く「登録・ログイン」ポップアップ（料金ページなどで使う）。
// Google/LINEは外部サイトへ移動して戻ってくるため、戻り先(next)と再開用の目印は呼び出し側が決める。
export type AuthDialogProps = {
  open: boolean;
  supabase: SupabaseClient | null;
  reason: string;
  // 認証後に戻るページ（例: "/pricing"）。/auth/confirm 経由で戻る。
  nextPath: string;
  // 外部サイトへ移動する直前に呼ばれる（再開用の目印を保存する）。
  onBeforeRedirect?: () => void;
  // メール登録・ログインがその場で完了したとき。
  onAuthed: () => void;
  onClose: () => void;
};

const LINE_ENABLED = process.env.NEXT_PUBLIC_ENABLE_LINE_LOGIN !== "false";

export default function AuthDialog({ open, supabase, reason, nextPath, onBeforeRedirect, onAuthed, onClose }: AuthDialogProps) {
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    if (open) setMessage(null);
  }, [open]);

  if (!open) return null;

  const confirmUrl = () => `${window.location.origin.replace(/\/$/, "")}/auth/confirm?next=${encodeURIComponent(nextPath)}`;

  async function oauth(provider: "google" | "line") {
    if (busy) return;
    if (!supabase) {
      setMessage({ tone: "error", text: "ログイン機能の設定が未完了です。" });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      onBeforeRedirect?.();
      const { error } = await withAuthTimeout(
        supabase.auth.signInWithOAuth({
          provider: provider === "line" ? "custom:line" : provider,
          options: { redirectTo: confirmUrl() },
        }),
      );
      if (error) setMessage({ tone: "error", text: normalizeAuthErrorMessage(error.message) });
    } catch (error) {
      setMessage({ tone: "error", text: normalizeAuthErrorMessage(error instanceof Error ? error.message : String(error)) });
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (busy) return;
    if (!supabase) {
      setMessage({ tone: "error", text: "ログイン機能の設定が未完了です。" });
      return;
    }
    if (!email || !password) {
      setMessage({ tone: "error", text: "メールアドレスとパスワードを入力してください。" });
      return;
    }
    if (mode === "signup" && password.length < 6) {
      setMessage({ tone: "error", text: "パスワードは6文字以上で入力してください。" });
      return;
    }
    if (mode === "signup" && password !== passwordConfirm) {
      setMessage({ tone: "error", text: "パスワードと確認用のパスワードが一致しません。同じものを2回入力してください。" });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      if (mode === "signup") {
        onBeforeRedirect?.();
        const { data, error } = await withAuthTimeout(
          supabase.auth.signUp({ email, password, options: { emailRedirectTo: confirmUrl() } }),
        );
        if (error) {
          setMessage({ tone: "error", text: normalizeAuthErrorMessage(error.message) });
          return;
        }
        // 登録済みのメールだと、Supabaseはエラーを返さずメールも送らない（identitiesが空）。ログインへ案内する。
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          setMode("login");
          setMessage({ tone: "error", text: "このメールアドレスはすでに登録されています。新規登録はできません。「ログイン」からパスワードでログインしてください（Googleで登録した場合は「Googleで続ける」を押してください）。" });
          return;
        }
        if (data.user) {
          void withAuthTimeout(
            supabase.from("profiles").upsert({ id: data.user.id, email, plan: "free" }),
            5_000,
          ).catch(() => undefined);
        }
        if (data.session) {
          onAuthed();
          return;
        }
        setMessage({ tone: "success", text: `${email} に確認メールを送りました。まだ登録は完了していません。メール内のリンクを開くと登録が完了し、この料金ページに戻って続きから進めます。届かないときは迷惑メールフォルダを確認してください。` });
        return;
      }
      const { error } = await withAuthTimeout(supabase.auth.signInWithPassword({ email, password }));
      if (error) {
        setMessage({ tone: "error", text: normalizeAuthErrorMessage(error.message) });
        return;
      }
      onAuthed();
    } catch (error) {
      setMessage({ tone: "error", text: normalizeAuthErrorMessage(error instanceof Error ? error.message : String(error)) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={busy ? undefined : onClose}>
      <div role="dialog" aria-modal="true" aria-label="登録・ログイン" className="max-h-[94dvh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-7" onClick={(event) => event.stopPropagation()}>
        <p className="text-center text-xs font-black text-blue-700">ステップ 1 / 2</p>
        <h3 className="mt-1 text-center text-xl font-black leading-tight text-slate-950">
          {mode === "signup" ? "登録して続ける" : "ログインして続ける"}
        </h3>
        <p className="mt-3 rounded-xl bg-blue-50 px-4 py-3 text-xs font-bold leading-5 text-blue-800"><AutoRenewText text={reason} /></p>
        {message ? (
          <p role="alert" className={`mt-3 rounded-lg p-3 text-sm font-bold ${message.tone === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{message.text}</p>
        ) : null}

        <div className="mt-4 flex gap-2">
          {(["signup", "login"] as const).map((value) => (
            <button key={value} type="button" onClick={() => setMode(value)} className={`flex-1 rounded-xl px-4 py-2 text-sm font-bold ${mode === value ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"}`}>
              {value === "signup" ? "新規登録" : "ログイン"}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-2">
          <button type="button" onClick={() => oauth("google")} disabled={!supabase || busy} className="flex h-11 items-center justify-center gap-3 rounded-md border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400">
            Googleで続ける
          </button>
          {LINE_ENABLED && (
            <button type="button" onClick={() => oauth("line")} disabled={!supabase || busy} className="flex h-11 items-center justify-center gap-3 rounded-md bg-[#06c755] px-4 text-sm font-bold text-white shadow-sm hover:bg-[#05b64d] disabled:bg-slate-300">
              <span className="rounded bg-white px-1.5 py-0.5 text-xs font-black text-[#06c755]">LINE</span>
              <span>LINEで続ける</span>
            </button>
          )}
        </div>

        <div className="mt-4 flex items-center gap-3 text-xs font-bold text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          <span>またはメールアドレスで続ける</span>
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <div className="mt-4 space-y-3">
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" placeholder="メールアドレス" className="w-full rounded-xl border px-3 py-3 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <div className="relative">
            <input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} autoComplete={mode === "signup" ? "new-password" : "current-password"} placeholder={mode === "signup" ? "パスワード（6文字以上）" : "パスワード"} className="w-full rounded-xl border px-3 py-3 pr-11 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label={showPassword ? "パスワードを隠す" : "パスワードを表示"}>
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {mode === "signup" && (
            <input value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder="パスワード（確認のためもう一度）" className="w-full rounded-xl border px-3 py-3 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          )}
          <button type="button" onClick={submit} disabled={!supabase || busy} className="w-full rounded-2xl bg-blue-600 px-4 py-3.5 text-base font-black text-white shadow-lg shadow-blue-600/30 hover:bg-blue-700 disabled:bg-slate-300 disabled:shadow-none">
            {busy ? "処理中..." : mode === "signup" ? "登録して次へ" : "ログインして次へ"}
          </button>
          <button type="button" onClick={onClose} disabled={busy} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-50">
            戻る
          </button>
        </div>
      </div>
    </div>
  );
}
