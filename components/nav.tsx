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

  function goToAuth() {
    if (pathname === "/") {
      window.dispatchEvent(new CustomEvent("vpp:open-auth", { detail: { mode: "login" } }));
      setOpen(false);
      return;
    }
    window.location.href = "/?auth=login";
  }

  const links = [
    { href: "/", label: "単語テスト印刷", always: true },
    { href: "/wordbooks", label: "みんなの単語帳", always: true },
    { href: "/my-wordbooks", label: "マイ単語帳", always: true },
    { href: "/materials", label: "PDF教材", always: true },
    { href: "/overlap", label: "かぶり調査", always: true },
    { href: "/history", label: "履歴", always: false },
    { href: "/pricing", label: "料金", always: true },
    { href: "/account", label: "アカウント", always: false },
  ].filter((link) => link.always || !!user);
  // パソコンの上部は主要5つ。ログイン中は「料金」「履歴」を「アカウント」メニューにまとめる
  // （未ログインの間は「料金」を上部に出す。スマホは下タブとメニューで全て辿れる）。
  const mainHrefs = user
    ? ["/", "/wordbooks", "/my-wordbooks", "/materials", "/overlap"]
    : ["/", "/wordbooks", "/my-wordbooks", "/materials", "/overlap", "/pricing"];
  const mainLinks = links.filter((link) => mainHrefs.includes(link.href));
  const moreLinks = [
    { href: "/account", label: "アカウント設定" },
    { href: "/history", label: "履歴" },
    { href: "/pricing", label: "料金" },
  ];
  const [moreOpen, setMoreOpen] = useState(false);

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
          {mainLinks.map((link) => (
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
          <div className="relative" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setMoreOpen(false); }}>
            <button
              type="button"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((value) => !value)}
              className={`rounded-lg px-3 py-2 text-sm font-bold transition-colors ${moreOpen || moreLinks.some((link) => link.href === pathname) ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-100"}`}
            >
              アカウント ▾
            </button>
            {moreOpen ? (
              <div className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-xl border bg-white py-1 shadow-lg">
                {moreLinks.map((link) => (
                  <Link key={link.href} href={link.href} onClick={() => setMoreOpen(false)} className="block px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">
                    {link.label}
                  </Link>
                ))}
                <button
                  type="button"
                  onClick={() => { setMoreOpen(false); void logout(); }}
                  className="block w-full border-t px-4 py-2.5 text-left text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  ログアウト
                </button>
              </div>
            ) : null}
          </div>
          ) : (
            <button
              type="button"
              onClick={goToAuth}
              className="ml-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
            >
              ログイン
            </button>
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
            <button
              type="button"
              onClick={goToAuth}
              className="mt-3 block rounded-xl bg-blue-600 py-2 text-center text-sm font-bold text-white"
            >
              ログイン
            </button>
          )}
        </div>
      )}
    </nav>
  );
}
