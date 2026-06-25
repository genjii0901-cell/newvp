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
    { href: "/wordbooks", label: "単語帳", always: false },
    { href: "/history", label: "履歴", always: false },
    { href: "/pricing", label: "料金", always: true },
    { href: "/account", label: "アカウント", always: false },
  ].filter((l) => l.always || !!user);

  return (
    <nav className="sticky top-0 z-50 border-b bg-white shadow-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-xs font-black text-white">
            VP
          </span>
          <span className="text-base font-black tracking-tight text-slate-900">Vocab Print Pro</span>
        </Link>

        {/* Desktop */}
        <div className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
                pathname === l.href
                  ? "bg-blue-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {l.label}
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
              href="/"
              className="ml-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
            >
              ログイン
            </Link>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className="flex flex-col gap-1 p-2 md:hidden"
          onClick={() => setOpen(!open)}
          aria-label="メニュー"
        >
          <span className={`block h-0.5 w-5 bg-slate-700 transition-transform ${open ? "translate-y-1.5 rotate-45" : ""}`} />
          <span className={`block h-0.5 w-5 bg-slate-700 transition-opacity ${open ? "opacity-0" : ""}`} />
          <span className={`block h-0.5 w-5 bg-slate-700 transition-transform ${open ? "-translate-y-1.5 -rotate-45" : ""}`} />
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="border-t bg-white px-5 pb-4 md:hidden">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className={`block py-3 text-sm font-bold border-b last:border-0 ${
                pathname === l.href ? "text-blue-600" : "text-slate-700"
              }`}
            >
              {l.label}
            </Link>
          ))}
          {user && (
            <button
              onClick={logout}
              className="mt-3 block w-full rounded-xl border py-2 text-sm font-bold text-slate-600"
            >
              ログアウト
            </button>
          )}
        </div>
      )}
    </nav>
  );
}
