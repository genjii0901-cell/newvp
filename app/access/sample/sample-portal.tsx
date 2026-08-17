import Link from "next/link";
import { Headphones, ListChecks, Printer, Star } from "lucide-react";

type SampleWord = [number, string, string];

type SamplePortalProps = {
  accent: "blue" | "indigo";
  bookId: string;
  description: string;
  noteHref: string;
  title: string;
  words: SampleWord[];
};

const accentClasses = {
  blue: { badge: "bg-blue-50 text-blue-700", button: "bg-blue-600 hover:bg-blue-700", border: "border-blue-100" },
  indigo: { badge: "bg-indigo-50 text-indigo-700", button: "bg-indigo-600 hover:bg-indigo-700", border: "border-indigo-100" },
};

export default function SamplePortal({ accent, bookId, description, noteHref, title, words }: SamplePortalProps) {
  const colors = accentClasses[accent];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <Link href="/" className="text-sm font-black text-blue-700">Vocab Print Pro</Link>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${colors.badge}`}>購入前サンプル</span>
        </div>

        <section className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <div className="grid sm:grid-cols-[190px_1fr]">
            <div className="aspect-[4/3] bg-slate-100 sm:aspect-auto">
              <img
                src={`https://www.vocabprint.com/api/wordbooks/cover?id=${encodeURIComponent(bookId)}`}
                alt={`${title}の表紙`}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="p-5 sm:p-7">
              <p className="text-sm font-bold text-blue-700">Note購入者向け・単語帳専用ページ</p>
              <h1 className="mt-1 text-2xl font-black sm:text-3xl">{title}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">{description}</p>
              <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold text-slate-600">
                <span className="rounded-full bg-slate-100 px-3 py-1.5">A4テスト印刷</span>
                <span className="rounded-full bg-slate-100 px-3 py-1.5">聞き流し</span>
                <span className="rounded-full bg-slate-100 px-3 py-1.5">単語チェック</span>
                <span className="rounded-full bg-slate-100 px-3 py-1.5">苦手マーク</span>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            [Printer, "必要な範囲だけ印刷", "開始・終了番号と出題形式を選び、A4の小テストを作成します。"],
            [Headphones, "自分の速さで聞き流し", "読み上げ速度、間隔、反復回数を調整して確認できます。"],
            [ListChecks, "答えられるかチェック", "単語カードや4択で確認し、迷った語には星を付けられます。"],
          ].map(([Icon, heading, copy]) => {
            const FeatureIcon = Icon as typeof Printer;
            return (
              <article key={String(heading)} className="rounded-lg border bg-white p-4 shadow-sm">
                <FeatureIcon className="h-5 w-5 text-blue-600" />
                <h2 className="mt-3 font-black">{String(heading)}</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">{String(copy)}</p>
              </article>
            );
          })}
        </section>

        <section className="mt-5 overflow-hidden rounded-lg border bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50 px-4 py-3">
            <div>
              <h2 className="font-black">単語チェックのサンプル</h2>
              <p className="text-xs text-slate-500">実際の購入者版では、対象範囲全体を利用できます。</p>
            </div>
            <button type="button" className={`rounded-lg px-4 py-2 text-sm font-black text-white ${colors.button}`}>4択チェックを始める</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="text-xs text-slate-500"><tr><th className="px-4 py-3">番号</th><th>単語</th><th>意味</th><th className="pr-4 text-right">復習</th></tr></thead>
              <tbody>{words.map(([no, word, meaning]) => (
                <tr key={no} className="border-t">
                  <td className="px-4 py-3 text-slate-500">{no}</td>
                  <td className="font-bold">{word}</td>
                  <td>{meaning}</td>
                  <td className="pr-4 text-right"><Star className="ml-auto h-4 w-4 text-amber-500" /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>

        <section className={`mt-5 rounded-lg border bg-white p-5 ${colors.border}`}>
          <h2 className="font-black">購入者版の利用方法</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Noteの有料部分にある専用URLを開き、メールアドレスとパスワードを登録した後、1回限りのライセンスキーを入力します。</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href={noteHref} className={`rounded-lg px-4 py-2.5 text-sm font-black text-white ${colors.button}`}>購入者用ページを見る</Link>
            <Link href="/" className="rounded-lg border px-4 py-2.5 text-sm font-black text-blue-700">Vocab Print Pro本体を見る</Link>
          </div>
        </section>

        <p className="mt-5 text-xs leading-5 text-slate-500">本ページは購入前の機能確認用です。対象教材を所有している学習者の補助利用を目的とし、書籍本文や収録データそのものを提供するものではありません。</p>
      </div>
    </main>
  );
}
