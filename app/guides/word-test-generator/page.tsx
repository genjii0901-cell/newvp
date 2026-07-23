import type { Metadata } from "next";
import Link from "next/link";
import { fallbackOfficialWordbooksForApi } from "@/lib/official-wordbooks";

export const metadata: Metadata = {
  title: "英単語テストPDFをかんたん作成 | Vocab Print Pro",
  description:
    "Vocab Print Proは、単語帳やCSV/Excelの単語データからA4印刷向けの英単語テスト、解答プリント、単語一覧PDFを作れるサービスです。英語空欄・日本語空欄・ランダム順・赤シート学習にも対応しています。",
  alternates: {
    canonical: "/guides/word-test-generator",
  },
  keywords: [
    "英単語テスト 作成",
    "英単語 PDF",
    "単語帳 プリント",
    "単語テスト ジェネレーター",
    "英単語 小テスト 作成",
    "Vocab Print Pro",
  ],
};

const features = [
  ["テスト・解答・一覧を切り替え", "英語を空欄、日本語を空欄、一覧プリントなど、授業や自習に合わせて形式を変えられます。"],
  ["Excel/CSV貼り付けに対応", "番号・英語・日本語だけでなく、ユニット、レッスン、ページ、メモ付きのデータも扱えます。"],
  ["A4印刷向けのレイアウト", "ページ番号、日付、名前欄、Created by表記を調整し、紙で配りやすい形に整えます。"],
  ["単語帳からすぐ作成", "みんなの単語帳やマイ単語帳を選ぶだけで、範囲指定して単語テストを作れます。"],
  ["聞き流し・単語チェックも利用", "印刷だけでなく、同じ単語リストで聞き流し学習やオンラインの単語チェックもできます。"],
  ["無料でも試せる", "無料利用では制限付きで試し、必要になったらPersonalプランで制限を広げられます。"],
];

const faqs = [
  ["どんな列のデータを貼り付けられますか？", "番号、英単語、日本語訳の3列に加えて、Unit、Lesson、Page、Memoなどの列にも対応しています。"],
  ["市販の単語帳名で検索されやすくできますか？", "各単語帳に専用URLとタイトル、説明文、サイトマップを用意し、Googleに内容を伝えやすい構成にしています。"],
  ["スマホからも使えますか？", "スマホでも単語帳を選び、範囲を決めて印刷や聞き流しを使えるように調整しています。"],
];

const sampleWordbooks = fallbackOfficialWordbooksForApi().slice(0, 6);

export default function WordTestGeneratorGuidePage() {
  return (
    <main className="bg-white">
      <section className="border-b bg-gradient-to-b from-blue-50 to-white">
        <div className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
          <p className="text-sm font-black text-blue-700">英単語テスト作成ツール</p>
          <h1 className="mt-3 text-3xl font-black leading-tight text-slate-950 sm:text-5xl">
            単語帳やExcelから、
            <br />
            A4の英単語テストPDFを作成。
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-slate-600 sm:text-lg">
            Vocab Print Proは、英単語・日本語訳・番号をもとに、学校や塾で配りやすい単語テストを作るサービスです。
            英語空欄、日本語空欄、ランダム順、赤字表示、解答プリント、一覧プリントまで、同じ画面で切り替えられます。
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/" className="rounded-2xl bg-blue-600 px-6 py-3.5 text-sm font-black text-white shadow-lg shadow-blue-600/30 hover:bg-blue-700">
              単語テストを作る
            </Link>
            <Link href="/wordbooks" className="rounded-2xl border px-6 py-3.5 text-sm font-black text-slate-700 hover:bg-slate-50">
              みんなの単語帳を見る
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-14">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-black text-blue-700">みんなの単語帳</p>
            <h2 className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">画像で選んで、すぐ単語テストにできます</h2>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">
              登録済みの単語帳はカードで見つけやすく表示されます。単語帳ページから、印刷・聞き流し・単語チェックへ進めます。
            </p>
          </div>
          <Link href="/wordbooks" className="rounded-2xl border px-5 py-3 text-sm font-black text-slate-700 hover:bg-slate-50">
            単語帳を見る
          </Link>
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sampleWordbooks.map((book) => (
            <Link key={book.id} href="/wordbooks" className="overflow-hidden rounded-3xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="relative h-36 bg-slate-100">
                <img src={book.coverImage ?? ""} alt={book.title} className="h-full w-full object-cover" loading="lazy" />
                <span className="absolute bottom-3 right-3 rounded-full bg-blue-600/90 px-2.5 py-1 text-xs font-black text-white">
                  {book.words.length}語
                </span>
              </div>
              <div className="p-4">
                <h3 className="line-clamp-2 font-black text-slate-950">{book.title}</h3>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{book.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-14">
        <h2 className="text-2xl font-black text-slate-950 sm:text-3xl">できること</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(([title, text]) => (
            <article key={title} className="rounded-3xl border bg-white p-6 shadow-sm">
              <h3 className="text-base font-black text-slate-900">{title}</h3>
              <p className="mt-2 text-sm leading-7 text-slate-600">{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y bg-slate-50">
        <div className="mx-auto max-w-5xl px-5 py-14">
          <h2 className="text-2xl font-black text-slate-950 sm:text-3xl">使い方</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              ["1", "単語帳を選ぶ", "みんなの単語帳、マイ単語帳、CSV/Excel貼り付けから使う単語を用意します。"],
              ["2", "範囲と形式を決める", "何番から何番まで、何問、英語空欄か日本語空欄かを選びます。"],
              ["3", "印刷する", "プレビューで紙面を確認してから、A4で印刷またはPDF保存します。"],
            ].map(([no, title, text]) => (
              <div key={no} className="rounded-3xl border bg-white p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-base font-black text-white">{no}</div>
                <h3 className="mt-4 text-lg font-black text-slate-900">{title}</h3>
                <p className="mt-2 text-sm leading-7 text-slate-600">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-14">
        <h2 className="text-2xl font-black text-slate-950 sm:text-3xl">よくある質問</h2>
        <div className="mt-8 space-y-4">
          {faqs.map(([question, answer]) => (
            <article key={question} className="rounded-3xl border p-6">
              <h3 className="font-black text-slate-900">{question}</h3>
              <p className="mt-2 text-sm leading-7 text-slate-600">{answer}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
