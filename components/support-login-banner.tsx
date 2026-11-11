"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export const SUPPORT_LOGIN_KEY = "vpp_support_login_email";

// 管理者がお客さんのアカウントで確認しているあいだ、全ページの上に帯を出す。
export default function SupportLoginBanner() {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");

  useEffect(() => {
    const stored = window.sessionStorage.getItem(SUPPORT_LOGIN_KEY);
    if (!stored || !supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email?.toLowerCase() === stored.toLowerCase()) setEmail(stored);
      else window.sessionStorage.removeItem(SUPPORT_LOGIN_KEY);
    });
  }, [supabase]);

  if (!email) return null;

  async function finish() {
    window.sessionStorage.removeItem(SUPPORT_LOGIN_KEY);
    await supabase?.auth.signOut({ scope: "local" }).catch(() => null);
    window.location.href = "/admin";
  }

  return (
    <div className="sticky top-0 z-[60] flex flex-wrap items-center justify-center gap-2 bg-amber-500 px-3 py-2 text-center text-xs font-black text-white sm:text-sm">
      <span>お客さんのアカウントで確認中：{email}（申し込み・解約・削除はしない）</span>
      <button type="button" onClick={finish} className="rounded-full bg-white px-3 py-1 text-amber-700">確認を終える</button>
    </div>
  );
}
