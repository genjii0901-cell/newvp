import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Note購入者用ページのサンプル | Vocab Print Pro",
  robots: { index: false, follow: false },
};

const samples = [
  { href: "/access/sample/system-eitango", id: "84", title: "システム英単語", copy: "英単語の印刷・聞き流し・4択チェックを試せる購入前サンプルです。" },
  { href: "/access/sample/koten-315", id: "31", title: "古典単語315", copy: "古語と意味の印刷・聞き流し・苦手確認を試せる購入前サンプルです。" },
];

export default function LicenseSampleIndexPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="text-sm font-black text-blue-700">Vocab Print Pro</Link>
        <h1 className="mt-6 text-3xl font-black">購入者用ページのサンプル</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Noteで購入する前に、対象教材ごとの画面と機能を確認できます。</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {samples.map((sample) => (
            <Link key={sample.href} href={sample.href} className="overflow-hidden rounded-lg border bg-white shadow-sm transition hover:border-blue-300 hover:shadow-md">
              <div className="aspect-[16/8] overflow-hidden bg-slate-100"><img src={`https://www.vocabprint.com/api/wordbooks/cover?id=${sample.id}`} alt={`${sample.title}の表紙`} className="h-full w-full object-cover" /></div>
              <div className="p-5"><h2 className="text-lg font-black">{sample.title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{sample.copy}</p><span className="mt-4 inline-block text-sm font-black text-blue-700">サンプルを開く</span></div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
