import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "英単語テストをPDFで作る方法",
  description:
    "単語帳やExcelデータから、英単語テスト・単語一覧・解答プリントをPDFで作る方法を解説します。無料でも1ページまで試せます。",
};

export default function WordTestGeneratorGuidePage() {
  return (
    <main className="bg-white">
      <section className="mx-auto max-w-4xl px-5 py-12 sm:py-16">
        <p className="text-sm font-black text-blue-700">Vocab Print Pro ガイド</p>
        <h1 className="mt-3 text-3xl font-black leading-tight text-slate-950 sm:text-5xl">
          英単語テストをPDFで作る方法
        </h1>
        <p className="mt-5 text-base leading-8 text-slate-600">
          Vocab Print Proでは、単語番号・英単語・日本語訳を用意するだけで、A4印刷向けの単語一覧、
          小テスト、解答プリントを作成できます。市販単語帳風のリストから選ぶことも、ExcelやCSVから貼り付けることもできます。
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/" className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700">
            単語テストを作る
          </Link>
          <Link href="/wordbooks" className="rounded-2xl border px-5 py-3 text-sm font-black text-slate-700 hover:bg-slate-50">
            みんなの単語帳を見る
          </Link>
        </div>
      </section>

      <section className="border-y bg-slate-50">
        <div className="mx-auto grid max-w-4xl gap-4 px-5 py-10 sm:grid-cols-3">
          {[
            ["1", "単語帳を選ぶ", "英検、大学受験、TOEICなどの単語帳から使う範囲を選びます。"],
            ["2", "形式を選ぶ", "一覧PDF、問題PDF、解答PDF、英語空欄、日本語空欄などを選べます。"],
            ["3", "印刷する", "A4に収まるレイアウトで、授業や自習用のプリントを作れます。"],
          ].map(([no, title, text]) => (
            <div key={no} className="rounded-3xl border bg-white p-5 shadow-sm">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-sm font-black text-white">
                {no}
              </div>
              <h2 className="mt-4 text-lg font-black text-slate-900">{title}</h2>
              <p className="mt-2 text-sm leading-7 text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-12">
        <h2 className="text-2xl font-black text-slate-950">よくある使い方</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {[
            ["英検の単語テスト", "出る順の単語リストから、授業前の確認テストや宿題プリントを作れます。"],
            ["大学受験の単語帳プリント", "ターゲット、鉄壁、システム英単語などの学習範囲に合わせて小テストを作る用途に向いています。"],
            ["Excelから自作テスト", "番号・英単語・日本語訳の3列を貼り付ければ、自分の単語リストでも作成できます。"],
            ["無料で試す", "ログインなしでもFree相当で1ページまで試せます。保存したい場合は無料登録が便利です。"],
          ].map(([title, text]) => (
            <article key={title} className="rounded-3xl border p-5">
              <h3 className="font-black text-slate-900">{title}</h3>
              <p className="mt-2 text-sm leading-7 text-slate-600">{text}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
