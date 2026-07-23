import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "単語帳別に単語テスト・プリントを作成 | Vocab Print Pro",
  description:
    "英検、大学受験、TOEICなどの単語帳ごとに、範囲を選んで単語テスト、単語一覧、聞き流し、単語チェックを使えます。単語帳名入りの専用ページから印刷しやすいプリントを作成できます。",
  alternates: {
    canonical: "/guides/wordbooks-for-printing",
  },
  keywords: [
    "単語帳 プリント",
    "単語帳 単語テスト",
    "英検 単語テスト",
    "大学受験 英単語 プリント",
    "TOEIC 単語帳 PDF",
    "Vocab Print Pro",
  ],
};

const examples = [
  ["英検の単語帳", "級ごとの範囲を選んで、確認テストや解答プリントを作れます。"],
  ["大学受験の英単語帳", "定番単語帳の範囲学習、週ごとの小テスト、復習プリントに使えます。"],
  ["TOEIC・TOEFL対策", "スコア帯やテーマ別の語彙リストから、短時間で確認プリントを作れます。"],
  ["古文単語・日本語教材", "古語と意味の確認、暗記チェック、聞き流し学習にも使えます。"],
  ["自作単語帳", "ExcelやCSVから作ったリストを保存し、自分専用の単語帳として繰り返し使えます。"],
  ["かぶり調査", "複数の単語帳に共通する語や、片方にだけ出る語を調べ、印刷や保存につなげられます。"],
];

export default function WordbooksForPrintingGuidePage() {
  return (
    <main className="bg-white">
      <section className="border-b bg-gradient-to-b from-blue-50 to-white">
        <div className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
          <p className="text-sm font-black text-blue-700">単語帳別プリント作成</p>
          <h1 className="mt-3 text-3xl font-black leading-tight text-slate-950 sm:text-5xl">
            単語帳を選んで、
            <br />
            範囲別の単語テストを作成。
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-slate-600 sm:text-lg">
            Vocab Print Proでは、単語帳ごとの専用ページから、単語一覧、単語テスト印刷、聞き流し、単語チェックを使えます。
            単語帳名入りのURLを用意しているため、検索やnoteの記事からも目的の単語帳ページに直接案内しやすくなります。
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/wordbooks" className="rounded-2xl bg-blue-600 px-6 py-3.5 text-sm font-black text-white shadow-lg shadow-blue-600/30 hover:bg-blue-700">
              単語帳を探す
            </Link>
            <Link href="/guides/word-test-generator" className="rounded-2xl border px-6 py-3.5 text-sm font-black text-slate-700 hover:bg-slate-50">
              使い方を見る
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-14">
        <h2 className="text-2xl font-black text-slate-950 sm:text-3xl">対応しやすい単語帳・教材</h2>
        <p className="mt-2 text-sm font-bold text-slate-500">
          公式に登録した単語帳だけでなく、自作単語帳や貼り付けデータにも対応します。
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {examples.map(([name, text]) => (
            <article key={name} className="rounded-3xl border bg-white p-6 shadow-sm">
              <h3 className="font-black text-slate-900">{name}</h3>
              <p className="mt-2 text-sm leading-7 text-slate-600">{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y bg-slate-50">
        <div className="mx-auto max-w-5xl px-5 py-14">
          <h2 className="text-2xl font-black text-slate-950 sm:text-3xl">単語帳ページでできること</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              ["印刷", "範囲、問題数、空欄形式、日付やページ番号を指定してA4プリントを作れます。"],
              ["聞き流し", "英語と日本語、または日本語教材向けの読み上げで、移動中にも学習できます。"],
              ["単語チェック", "カードや4択で確認し、わからない語にマークを付けて復習できます。"],
            ].map(([title, text]) => (
              <div key={title} className="rounded-3xl border bg-white p-6">
                <h3 className="text-lg font-black text-slate-900">{title}</h3>
                <p className="mt-2 text-sm leading-7 text-slate-600">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-14">
        <div className="rounded-3xl bg-gradient-to-r from-blue-600 to-slate-900 p-8 text-white sm:p-10">
          <h2 className="text-2xl font-black sm:text-3xl">まずは単語帳を選んで試せます</h2>
          <p className="mt-3 max-w-2xl text-sm leading-8 text-blue-50 sm:text-base">
            無料でも制限付きで単語テストを作成できます。保存や本格的な印刷を増やしたい場合は、Personalプランでより広く使えます。
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/wordbooks" className="rounded-2xl bg-white px-6 py-3.5 text-sm font-black text-blue-700 hover:bg-blue-50">
              みんなの単語帳へ
            </Link>
            <Link href="/pricing" className="rounded-2xl border border-white/40 px-6 py-3.5 text-sm font-black text-white hover:bg-white/10">
              プランを見る
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
