"use client";

import { useState } from "react";
import { POPULARITY_DISPLAY_MIN } from "@/lib/wordbook-popularity";

export type ShelfBook = {
  id: string;
  title: string;
  href: string;
  cover: string;
  planLabel: string;
  wordCount: number;
  users: number;
  creator?: string;
};

function usersLabel(users: number) {
  return users >= POPULARITY_DISPLAY_MIN ? `👤約${users.toLocaleString()}人` : "新着";
}

// 同じ大きさの表紙を、1行ずつ並べる棚。「すべて見る」でその場に全部広がる（スライダーなし）。
// 表示する情報は、表紙の上＝プラン（ランキングは順位）、表紙の下端＝人数、表紙の下＝題名・語数。
export default function WordbookShelf({
  title,
  books,
  ranked = false,
  selectedId,
}: {
  title: string;
  books: ShelfBook[];
  ranked?: boolean;
  rows?: 1 | 2;
  selectedId?: string;
  moreHref?: string;
}) {
  const [open, setOpen] = useState(false);
  if (books.length === 0) return null;
  return (
    <div className="mt-4 sm:mt-6">
      <div className="flex items-baseline justify-between px-0.5">
        <h4 className="text-sm font-black text-slate-900 sm:text-lg">
          {title}
          <span className="ml-1.5 text-[11px] font-bold text-slate-400 sm:text-xs">{books.length}冊</span>
        </h4>
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-[11px] font-bold text-blue-700 sm:text-sm">
          {open ? "閉じる ▴" : "すべて見る ▾"}
        </button>
      </div>
      <div className={`mt-1.5 grid grid-cols-4 gap-x-2 gap-y-3 sm:grid-cols-6 sm:gap-x-3 lg:grid-cols-8 ${open ? "" : "[&>*:nth-child(n+5)]:hidden sm:[&>*:nth-child(n+5)]:block sm:[&>*:nth-child(n+7)]:hidden lg:[&>*:nth-child(n+7)]:block lg:[&>*:nth-child(n+9)]:hidden"}`}>
        {books.map((book, index) => (
          <a
            key={book.id}
            href={book.href}
            className="block min-w-0 active:scale-[0.98]"
          >
            <div className={`relative aspect-[3/4] w-full overflow-hidden rounded-lg border bg-slate-100 shadow-sm ${book.id === selectedId ? "border-blue-500 ring-2 ring-blue-300" : "border-slate-200"}`}>
              <img src={book.cover} alt={book.title} loading="lazy" className="h-full w-full object-cover" />
              {ranked ? (
                <span className={`absolute left-0 top-0 rounded-br-lg px-1.5 text-sm font-black leading-6 text-white sm:text-lg sm:leading-7 ${index === 0 ? "bg-amber-500" : index === 1 ? "bg-slate-400" : index === 2 ? "bg-orange-700" : "bg-slate-800/80"}`}>
                  {index + 1}
                </span>
              ) : book.planLabel !== "Free" ? (
                <span className="absolute left-0.5 top-0.5 rounded bg-white/90 px-1 text-[8px] font-black leading-4 text-slate-800 sm:text-[10px]">
                  {book.planLabel}
                </span>
              ) : null}
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/80 to-transparent px-1 pb-0.5 pt-3 text-[9px] font-black text-white sm:text-[11px]">
                {usersLabel(book.users)}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-[10px] font-black leading-tight text-slate-900 sm:text-xs">{book.title}</p>
            <p className="truncate text-[9px] font-bold text-slate-400 sm:text-[11px]">{book.wordCount.toLocaleString()}語</p>
          </a>
        ))}
      </div>
    </div>
  );
}
