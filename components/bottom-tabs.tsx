"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// スマホ用の下タブ（Duolingo・mikan・Quizletなど学習アプリの定番配置）。親指で押せる位置に主要4画面を置く。
type Tab = { href: string; label: string; match: (path: string) => boolean; icon: ReactNode };

const icon = (path: ReactNode) => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {path}
  </svg>
);

const TABS: Tab[] = [
  {
    href: "/",
    label: "印刷",
    match: (path) => path === "/" || path.startsWith("/print") || path.startsWith("/history"),
    icon: icon(<><path d="M7 9V4h10v5" /><rect x="4" y="9" width="16" height="8" rx="2" /><path d="M7 14h10v6H7z" /></>),
  },
  {
    href: "/wordbooks",
    label: "単語帳",
    match: (path) => path.startsWith("/wordbooks") || path.startsWith("/shared"),
    icon: icon(<><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H12v16H5.5A1.5 1.5 0 0 1 4 18.5z" /><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H12v16h6.5a1.5 1.5 0 0 0 1.5-1.5z" /></>),
  },
  {
    href: "/my-wordbooks",
    label: "マイ単語帳",
    match: (path) => path.startsWith("/my-wordbooks"),
    icon: icon(<><path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9l-5.3 2.7 1-5.8L3.5 9.7l5.9-.9z" /></>),
  },
  {
    href: "/account",
    label: "アカウント",
    match: (path) => path.startsWith("/account") || path.startsWith("/pricing"),
    icon: icon(<><circle cx="12" cy="8" r="3.6" /><path d="M5 20c.8-3.6 3.5-5.4 7-5.4s6.2 1.8 7 5.4" /></>),
  },
];

export default function BottomTabs() {
  const pathname = usePathname() ?? "/";
  if (pathname.startsWith("/admin") || pathname.startsWith("/print")) return null;
  return (
    <nav
      aria-label="メインメニュー"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-lg grid-cols-4">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-black transition-colors ${active ? "text-blue-600" : "text-slate-400 hover:text-slate-600"}`}
              >
                <span className={`rounded-full px-4 py-0.5 transition-colors ${active ? "bg-blue-50" : ""}`}>{tab.icon}</span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
