import Link from "next/link";
import { loadCachedPublicCatalog } from "@/lib/cached-wordbooks";
import { buildWordbookPath } from "@/lib/wordbook-slug";

const featuredIds = ["83", "71", "102", "272", "80", "93", "310"];

export async function FeaturedWordbooks({ limit }: { limit: number }) {
  const catalog = await loadCachedPublicCatalog().catch(() => null);
  const byId = new Map(catalog?.wordbooks.map((book) => [book.id, book]));
  const books = featuredIds
    .map((id) => byId.get(id))
    .filter((book) => book != null && Boolean(book.coverImage))
    .slice(0, limit);

  return (
    <section className="mx-auto max-w-5xl px-5 py-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-slate-950 sm:text-3xl">使っている単語帳からテストを作る</h2>
          <p className="mt-2 text-sm text-slate-600">表紙を選ぶと、その本の印刷画面で出題範囲を設定できます。</p>
        </div>
        <Link href="/wordbooks" className="rounded-xl border px-4 py-2.5 text-sm font-bold text-blue-700 hover:bg-blue-50">
          すべての単語帳を見る
        </Link>
      </div>
      {books.length > 0 && (
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {books.map((book) => (
            <li key={book.id}>
              <Link href={`${buildWordbookPath(book.id, book.title)}?tab=test`} className="group flex h-full flex-col rounded-2xl border bg-white p-3 shadow-sm transition hover:border-blue-300 hover:shadow-md">
                <div className="flex h-36 items-center justify-center rounded-xl bg-slate-50 p-2 sm:h-44">
                  <img src={book.coverImage ?? undefined} alt={`${book.title}の表紙`} width={160} height={176} className="h-full w-full object-contain" loading="lazy" decoding="async" />
                </div>
                <h3 className="mt-3 flex-1 text-sm font-bold leading-5 text-slate-950">{book.title}</h3>
                {book.wordCountKnown && book.wordCount > 0 && (
                  <p className="mt-1 text-xs text-slate-600">{book.wordCount.toLocaleString("ja-JP")}語</p>
                )}
                <span className="mt-2 text-xs font-bold text-blue-700 group-hover:underline">単語テストを作る →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
