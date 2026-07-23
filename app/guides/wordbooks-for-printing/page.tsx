import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "単語帳別に英単語プリントを作成 | Vocab Print Pro",
  description:
    "英検・大学受験・TOEICなどの単語帳から、範囲を選んで単語一覧・小テスト・解答プリントを作成。単語帳ごとの専用ページから印刷・聞き流し・単語チェックができます。無料で始められます。",
  alternates: {
    canonical: "/guides/wordbooks-for-printing",
  },
};

const examples = [
  ["英検 出る順パス単", "英検5級〜1級の出る順で、級ごとの確認テストを作成。"],
  ["ターゲット1900", "大学受験の定番。今週の範囲だけの小テストに。"],
  ["鉄壁", "難関大向けの単語帳。まとめて解答プリントも作れます。"],
  ["システム英単語", "ミニマルフレーズごとの範囲でテスト化。"],
  ["速読英熟語", "熟語の意味を空欄にした確認プリントに。"],
  ["TOEIC 金のフレーズ", "スコア帯別の範囲で、日→英テストもワンタップ。"],
];

export default function WordbooksForPrintingGuidePage() {
  return (
    <main className="bg-white">
      {/* Hero */}
      <section className="border-b bg-gradient-to-b from-blue-50 to-white">
        <div className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
          <p className="text-sm font-black text-blue-700">単語帳から英単語プリント作成</p>
          <h1 className="mt-3 text-3xl font-black leading-tight text-slate-950 sm:text-5xl">
            使っている単語帳から、
            <br />
            小テストとプリントを。
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-slate-600 sm:text-lg">
            単語帳を選んで範囲を指定するだけで、印刷用の単語一覧・小テスト・解答プリントが完成。
            単語帳ごとの専用ページから、印刷・聞き流し・単語チェックまでまとめて使えます。
            自分で作った単語帳や、Excel・CSVの貼り付けデータからも作成できます。
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/wordbooks" className="rounded-2xl bg-blue-600 px-6 py-3.5 text-sm font-black text-white shadow-lg shadow-blue-600/30 hover:bg-blue-700">
              みんなの単語帳を見る
            </Link>
            <Link href="/#auth" className="rounded-2xl border px-6 py-3.5 text-sm font-black text-slate-700 hover:bg-slate-50">
              無料で始める
            </Link>
          </div>
        </div>
      </section>

      {/* Examples */}
      <section className="mx-auto max-w-5xl px-5 py-14">
        <h2 className="text-2xl font-black text-slate-950 sm:text-3xl">対応している単語帳の例</h2>
        <p className="mt-2 text-sm font-bold text-slate-500">
          英検・大学受験・資格まで、よく使われる単語帳をそろえています。
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {examples.map(([name, text]) => (
            <div key={name} className="rounded-3xl border bg-white p-5 shadow-sm">
              <h3 className="font-black text-slate-900">{name}</h3>
              <p className="mt-2 text-sm leading-7 text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* What each wordbook page offers */}
      <section className="border-y bg-slate-50">
        <div className="mx-auto max-w-5xl px-5 py-14">
          <h2 className="text-2xl font-black text-slate-950 sm:text-3xl">単語帳ごとの専用ページでできること</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              ["🖨 印刷する", "範囲を選んで、問題・解答・一覧をA4で印刷。赤シート対応や記入欄つきにもできます。"],
              ["🎧 聞き流し", "選んだ範囲をそのまま音声で聞き流し。移動中・スキマ時間の学習に。"],
              ["✅ 単語チェック", "4択・カード形式で、印刷せずにその場で暗記チェックができます。"],
            ].map(([title, text]) => (
              <div key={title} className="rounded-3xl border bg-white p-6 shadow-sm">
                <h3 className="text-lg font-black text-slate-900">{title}</h3>
                <p className="mt-2 text-sm leading-7 text-slate-600">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-5xl px-5 py-14">
        <div className="rounded-3xl bg-gradient-to-r from-blue-600 to-slate-900 p-8 text-white sm:p-10">
          <h2 className="text-2xl font-black sm:text-3xl">まずは単語帳を選んで試す</h2>
          <p className="mt-3 max-w-2xl text-sm leading-8 text-blue-50 sm:text-base">
            会員登録は無料・メールアドレスだけ。Personalプランなら期間限定で7日間無料、印刷し放題・透かしなしで使えます。
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/wordbooks" className="rounded-2xl bg-white px-6 py-3.5 text-sm font-black text-blue-700 hover:bg-blue-50">
              みんなの単語帳へ
            </Link>
            <Link href="/#auth" className="rounded-2xl border border-white/40 px-6 py-3.5 text-sm font-black text-white hover:bg-white/10">
              無料で会員登録する
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
