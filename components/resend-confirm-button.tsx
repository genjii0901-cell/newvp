"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeAuthErrorMessage, withAuthTimeout } from "@/lib/auth";

const COOLDOWN_SECONDS = 60;

// 確認メールを送ったあとに出す「もう一度送る」ボタン。
// 送りすぎるとSupabaseの送信上限にかかるため、送信直後から60秒は押せないようにする。
export default function ResendConfirmButton({ supabase, email, redirectTo }: {
  supabase: SupabaseClient | null;
  email: string;
  redirectTo: string;
}) {
  const [wait, setWait] = useState(COOLDOWN_SECONDS);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setWait((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);

  async function resend() {
    if (!supabase || busy || wait > 0 || !email) return;
    setBusy(true);
    setNote(null);
    try {
      const { error } = await withAuthTimeout(
        supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: redirectTo } }),
      );
      if (error) {
        setNote({ tone: "error", text: normalizeAuthErrorMessage(error.message) });
      } else {
        setNote({ tone: "success", text: `${email} に確認メールをもう一度送りました。いちばん新しいメールのリンクを開いてください。` });
      }
    } catch (error) {
      setNote({ tone: "error", text: normalizeAuthErrorMessage(error instanceof Error ? error.message : String(error)) });
    } finally {
      setBusy(false);
      setWait(COOLDOWN_SECONDS);
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={resend}
        disabled={!supabase || busy || wait > 0}
        className="w-full rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-sm font-black text-emerald-700 hover:bg-emerald-50 disabled:border-slate-200 disabled:text-slate-400"
      >
        {busy ? "送信中..." : wait > 0 ? `確認メールを再送する（あと${wait}秒）` : "確認メールを再送する"}
      </button>
      {note ? (
        <p role="status" className={`mt-2 rounded-lg p-2 text-xs font-bold ${note.tone === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{note.text}</p>
      ) : null}
    </div>
  );
}
