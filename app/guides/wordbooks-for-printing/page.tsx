import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "単語帳別に英単語プリントを作る",
  description:
    "英検、大学受験、TOEICなどの単語帳から、範囲を選んで英単語プリントや小テストを作るためのページです。",
};

export default function WordbooksForPrintingGuidePage() {
  const examples = [
    "英検 出る順パス単",
    "ターゲット1900",
    "鉄壁",
    "システム英単語",
    "速読英熟語",
    "TOEIC 金のフレーズ",
  ];

  return (
    <main className="mx-auto max-w-5xl px-5 py-12">
      <p className="text-sm font-black text-blue-700">検索から来た方向け</p>
      <h1 className="mt-3 text-3xl font-black leading-tight text-slate-950 sm:text-5xl">
        単語帳別に英単語プリントを作る
      </h1>
      <p className="mt-5 max-w-3xl text-base leading-8 text-slate-600">
        Vocab Print Proは、単語帳を選んで範囲を指定し、印刷用の単語一覧・小テスト・解答プリントを作れるサービスです。
        ログインなしでも1ページまで試せます。保存や多ページ作成にはPersonalプランが使えます。
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {examples.map((name) => (
          <div key={name} className="rounded-3xl border bg-white p-5 shadow-sm">
            <h2 className="font-black text-slate-900">{name}</h2>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              学習範囲を指定して、確認テストや一覧プリントを作成できます。
            </p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-3xl bg-blue-50 p-6">
        <h2 className="text-xl font-black text-slate-950">まずは単語帳を選んで試す</h2>
        <p className="mt-2 text-sm leading-7 text-slate-600">
          単語帳ページでは、教材ごとの詳細ページから「単語テストを作る」「聞き流しで学習」を選べます。
        </p>
        <Link href="/wordbooks" className="mt-5 inline-block rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700">
          みんなの単語帳へ
        </Link>
      </div>
    </main>
  );
}
