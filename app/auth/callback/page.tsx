"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function normalizeNextPath(value: string | null) {
  if (!value || !value.startsWith("/")) return "/";
  return value;
}

function AuthCallbackContent() {
  const params = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("ログイン情報を確認しています。");

  const next = normalizeNextPath(params.get("next"));
  const code = params.get("code");
  const errorDescription = params.get("error_description") || params.get("message");

  useEffect(() => {
    let cancelled = false;

    async function finishAuth() {
      if (!supabase) {
        setStatus("error");
        setMessage("Supabaseの設定が未完了です。");
        return;
      }

      if (errorDescription) {
        setStatus("error");
        setMessage(errorDescription);
        return;
      }

      if (!code) {
        setStatus("error");
        setMessage("ログインに必要な情報が見つかりませんでした。もう一度お試しください。");
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (cancelled) return;

      if (error) {
        setStatus("error");
        setMessage(
          error.message.includes("PKCE")
            ? "ログイン開始時と同じブラウザで開けませんでした。もう一度GoogleまたはLINEログインをお試しください。"
            : error.message
        );
        return;
      }

      setStatus("success");
      setMessage("ログインしました。Vocab Print Proへ戻ります。");
      window.setTimeout(() => {
        window.location.href = `${next}${next.includes("?") ? "&" : "?"}auth=confirmed`;
      }, 500);
    }

    void finishAuth();
    return () => {
      cancelled = true;
    };
  }, [code, errorDescription, next, supabase]);

  const loginHref = next === "/" ? "/#auth" : `${next}#auth`;

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-16 text-slate-900">
      <div className="mx-auto max-w-xl rounded-3xl border bg-white p-8 shadow-sm">
        <p className="text-sm font-bold text-blue-700">Vocab Print Pro</p>
        <h1 className="mt-2 text-2xl font-black">ログイン確認</h1>
        <p
          className={`mt-4 rounded-2xl p-4 text-sm font-bold ${
            status === "error"
              ? "bg-red-50 text-red-700"
              : status === "success"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-50 text-slate-700"
          }`}
        >
          {message}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">
            トップへ戻る
          </Link>
          <Link href={loginHref} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white">
            ログイン画面へ
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <AuthCallbackContent />
    </Suspense>
  );
}
