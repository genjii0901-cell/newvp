"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export default function Nav() {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  async function logout() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    window.location.href = "/";
  }

  const links = [
    { href: "/", label: "単語テスト作成", always: true },
    { href: "/wordbooks", label: "みんなの単語帳", always: true },
    { href: "/my-wordbooks", label: "マイ単語帳", always: false },
    { href: "/listening", label: "聞き流し", always: true },
    { href: "/history", label: "履歴", always: false },
    { href: "/pricing", label: "料金", always: true },
    { href: "/account", label: "アカウント", always: false },
  ].filter((link) => link.always || !!user);

  return (
    <nav className="sticky top-0 z-50 border-b bg-white shadow-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-xs font-black text-white">
            VP
          </span>
          <span className="text-base font-black tracking-tight text-slate-900">Vocab Print Pro</span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
                pathname === link.href ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {link.label}
            </Link>
          ))}
          {user ? (
            <button
              onClick={logout}
              className="ml-2 rounded-lg border px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100"
            >
              ログアウト
            </button>
          ) : (
            <Link
              href="/#auth"
              className="ml-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
            >
              ログイン
            </Link>
          )}
        </div>

        <button
          className="flex flex-col gap-1 p-2 md:hidden"
          onClick={() => setOpen((value) => !value)}
          aria-label="メニュー"
        >
          <span className={`block h-0.5 w-5 bg-slate-700 transition-transform ${open ? "translate-y-1.5 rotate-45" : ""}`} />
          <span className={`block h-0.5 w-5 bg-slate-700 transition-opacity ${open ? "opacity-0" : ""}`} />
          <span className={`block h-0.5 w-5 bg-slate-700 transition-transform ${open ? "-translate-y-1.5 -rotate-45" : ""}`} />
        </button>
      </div>

      {open && (
        <div className="border-t bg-white px-5 pb-4 md:hidden">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={`block border-b py-3 text-sm font-bold last:border-0 ${
                pathname === link.href ? "text-blue-600" : "text-slate-700"
              }`}
            >
              {link.label}
            </Link>
          ))}
          {user ? (
            <button
              onClick={logout}
              className="mt-3 block w-full rounded-xl border py-2 text-sm font-bold text-slate-600"
            >
              ログアウト
            </button>
          ) : (
            <Link
              href="/#auth"
              onClick={() => setOpen(false)}
              className="mt-3 block rounded-xl bg-blue-600 py-2 text-center text-sm font-bold text-white"
            >
              ログイン
            </Link>
          )}
        </div>
      )}
    </nav>
  );
}
