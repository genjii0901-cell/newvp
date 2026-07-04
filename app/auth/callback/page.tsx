"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function normalizeNextPath(value: string | null) {
  if (!value || !value.startsWith("/")) return "/";
  return value;
}

export default function AuthCallbackPage() {
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("認証を確認しています...");

  useEffect(() => {
    async function run() {
      const currentUrl = new URL(window.location.href);
      const next = normalizeNextPath(currentUrl.searchParams.get("next"));
      const code = currentUrl.searchParams.get("code");
      const errorCode = currentUrl.searchParams.get("error");
      const errorDescription = currentUrl.searchParams.get("error_description");

      if (!supabase) {
        setStatus("error");
        setMessage("Supabaseの設定が見つかりません。");
        return;
      }

      if (errorCode || errorDescription) {
        setStatus("error");
        setMessage(errorDescription || errorCode || "認証リンクの確認に失敗しました。");
        return;
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setStatus("error");
          setMessage(error.message || "認証リンクの処理に失敗しました。");
          return;
        }
      }

      setStatus("success");
      setMessage("メール認証が完了しました。トップページへ移動します...");
      window.setTimeout(() => {
        const destination = new URL(next, window.location.origin);
        destination.searchParams.set("auth", "confirmed");
        window.location.replace(destination.toString());
      }, 900);
    }

    run();
  }, [supabase]);

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-16 text-slate-900">
      <div className="mx-auto max-w-xl rounded-3xl border bg-white p-8 shadow-sm">
        <p className="text-sm font-bold text-blue-700">Vocab Print Pro</p>
        <h1 className="mt-2 text-2xl font-black">メール認証</h1>
        <p
          className={`mt-4 rounded-2xl p-4 text-sm font-bold ${
            status === "error"
              ? "bg-red-50 text-red-700"
              : status === "success"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-100 text-slate-700"
          }`}
        >
          {message}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">
            トップへ戻る
          </Link>
          <Link href="/#auth" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white">
            ログイン画面へ
          </Link>
        </div>
      </div>
    </main>
  );
}
