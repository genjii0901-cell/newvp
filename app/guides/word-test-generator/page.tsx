import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "英単語テストPDFをかんたん作成 | Vocab Print Pro",
  description:
    "単語帳やExcel/CSVの単語データから、A4印刷向けの英単語テスト・単語一覧・解答プリントを自動作成。英検・大学受験・TOEICに対応。スマホからも印刷でき、無料で始められます。",
  alternates: {
    canonical: "/guides/word-test-generator",
  },
};

const features = [
  ["📄 3種類のプリント", "「問題」「解答」「一覧」をワンタップで切り替え。答え合わせ用の解答プリントも一緒に作れます。"],
  ["🔁 出題方向を選べる", "英語→日本語／日本語→英語／スペルテスト（頭文字だけ表示）。同じ単語帳で何通りものテストが作れます。"],
  ["🟥 赤シート対応", "答えを赤字で印刷。赤シートを重ねれば繰り返し暗記チェックに使えます。"],
  ["🎧 聞き流し学習", "作った範囲をそのまま音声で聞き流し。移動中やスキマ時間の学習に。"],
  ["📊 範囲・問題数を自由に", "開始・終了・問題数を指定。今日の範囲だけ、ランダム順など細かく調整できます。"],
  ["🖨 スマホからも印刷", "iPhone・iPad・AndroidのブラウザからそのままA4印刷。コンビニ印刷にも対応。"],
];

const useCases = [
  ["英検の単語テスト", "英検準2級〜1級の出る順単語から、授業前の確認テストや宿題プリントをすぐ作成。"],
  ["大学受験の単語帳プリント", "ターゲット・鉄壁・システム英単語など、今週の範囲に合わせた小テストを量産できます。"],
  ["塾・学校の先生に", "クラス名・氏名・日付の記入欄つきで印刷。作成者名も入れられ、そのまま配布できます。"],
  ["Excel / CSVから自作", "番号・英単語・日本語訳の列を貼り付けるだけ。自分だけのオリジナル単語テストに。"],
];

export default function WordTestGeneratorGuidePage() {
  return (
    <main className="bg-white">
      {/* Hero */}
      <section className="border-b bg-gradient-to-b from-blue-50 to-white">
        <div className="mx-auto max-w-4xl px-5 py-14 sm:py-20">
          <p className="text-sm font-black text-blue-700">英単語テスト作成ツール</p>
          <h1 className="mt-3 text-3xl font-black leading-tight text-slate-950 sm:text-5xl">
            単語帳を選ぶだけで、
            <br />
            英単語テストPDFが完成。
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
            番号・英単語・日本語訳から、A4印刷向けの「問題」「解答」「一覧」プリントを自動作成。
            英検・大学受験・TOEICの単語帳に対応し、ExcelやCSVの自作リストからも作れます。
            登録すればスマホからそのまま印刷できます。
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/#auth" className="rounded-2xl bg-blue-600 px-6 py-3.5 text-sm font-black text-white shadow-lg shadow-blue-600/30 hover:bg-blue-700">
              無料で始める
            </Link>
            <Link href="/wordbooks" className="rounded-2xl border px-6 py-3.5 text-sm font-black text-slate-700 hover:bg-slate-50">
              みんなの単語帳を見る
            </Link>
          </div>
          <p className="mt-3 text-xs font-bold text-slate-400">
            会員登録は無料・メールアドレスだけ。Personalプランは期間限定で7日間無料。
          </p>
        </div>
      </section>

      {/* Steps */}
      <section className="mx-auto max-w-4xl px-5 py-14">
        <h2 className="text-2xl font-black text-slate-950 sm:text-3xl">3ステップで作成</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            ["1", "単語帳と範囲を選ぶ", "英検・受験・資格などの単語帳から、今日使いたい範囲（何番〜何番）を選びます。"],
            ["2", "形式を選ぶ", "問題・解答・一覧、出題方向、赤シート、記入欄などをタップで切り替え。"],
            ["3", "印刷する", "A4にきれいに収まるレイアウトで、そのまま印刷・配布できます。"],
          ].map(([no, title, text]) => (
            <div key={no} className="rounded-3xl border bg-white p-6 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-base font-black text-white">
                {no}
              </div>
              <h3 className="mt-4 text-lg font-black text-slate-900">{title}</h3>
              <p className="mt-2 text-sm leading-7 text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="border-y bg-slate-50">
        <div className="mx-auto max-w-4xl px-5 py-14">
          <h2 className="text-2xl font-black text-slate-950 sm:text-3xl">できること</h2>
          <p className="mt-2 text-sm font-bold text-slate-500">紙の単語テストづくりに必要な機能を、ぜんぶこの1画面で。</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {features.map(([title, text]) => (
              <div key={title} className="rounded-3xl border bg-white p-5">
                <h3 className="text-base font-black text-slate-900">{title}</h3>
                <p className="mt-2 text-sm leading-7 text-slate-600">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section className="mx-auto max-w-4xl px-5 py-14">
        <h2 className="text-2xl font-black text-slate-950 sm:text-3xl">こんな使い方に</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {useCases.map(([title, text]) => (
            <article key={title} className="rounded-3xl border p-6">
              <h3 className="font-black text-slate-900">{title}</h3>
              <p className="mt-2 text-sm leading-7 text-slate-600">{text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="border-t bg-slate-50">
        <div className="mx-auto max-w-4xl px-5 py-14">
          <h2 className="text-2xl font-black text-slate-950 sm:text-3xl">料金</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border-2 border-slate-200 bg-white p-6">
              <p className="text-xs font-black text-slate-500">フリープラン</p>
              <p className="mt-1 text-3xl font-black text-slate-950">無料</p>
              <ul className="mt-4 space-y-1.5 text-sm font-bold text-slate-600">
                <li>・カード登録なしで使える</li>
                <li>・1ページの印刷が2回まで無料</li>
                <li>・「見本」の透かし入り</li>
              </ul>
            </div>
            <div className="relative rounded-3xl border-2 border-blue-500 bg-white p-6 shadow-md">
              <span className="absolute right-4 top-4 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-black text-white">期間限定</span>
              <p className="text-xs font-black text-blue-700">Personalプラン</p>
              <p className="mt-1 text-3xl font-black text-slate-950">7日間 無料</p>
              <p className="text-xs font-bold text-slate-500">その後は月額780円・いつでも解約OK</p>
              <ul className="mt-4 space-y-1.5 text-sm font-bold text-slate-700">
                <li>✓ 印刷し放題・透かしなし</li>
                <li>✓ 語数制限なし・範囲や問題数も自由</li>
                <li>✓ 単語帳の保存</li>
              </ul>
            </div>
          </div>
          <div className="mt-8 text-center">
            <Link href="/#auth" className="inline-block rounded-2xl bg-blue-600 px-8 py-4 text-base font-black text-white shadow-lg shadow-blue-600/30 hover:bg-blue-700">
              無料で会員登録して始める
            </Link>
            <p className="mt-3 text-xs font-bold text-slate-400">
              メールアドレスだけで登録。Google・LINEでも登録できます。
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
