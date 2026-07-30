import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "購入者用単語帳ポータルのサンプル | Vocab Print Pro", robots: { index: false, follow: false } };

const sampleWords = [
  ["1", "achieve", "達成する"],
  ["2", "benefit", "利益、恩恵"],
  ["3", "challenge", "挑戦、課題"],
  ["4", "develop", "発展させる"],
  ["5", "essential", "不可欠な"],
];

export default function LicenseSamplePage() {
  return <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900"><div className="mx-auto max-w-4xl"><div className="mb-7 flex items-center justify-between"><Link href="/" className="text-sm font-black text-blue-700">Vocab Print Pro</Link><span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-bold">デモ画面</span></div><section className="overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="grid md:grid-cols-[200px_1fr]"><div className="min-h-44 bg-gradient-to-br from-blue-700 to-sky-400" /><div className="p-6"><p className="text-sm font-bold text-blue-700">Note購入者向け・単語帳専用ポータル</p><h1 className="mt-1 text-2xl font-black">システム英単語（サンプル）</h1><p className="mt-3 text-sm leading-6 text-slate-600">実際の購入者は、Noteで案内された専用URLでメールアドレス・パスワード・ライセンスキーを登録します。使えるのは購入した単語帳だけです。</p></div></div></section><section className="mt-6 rounded-2xl border bg-white p-6 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-black">単語チェック（機能を絞った例）</h2><p className="mt-1 text-sm text-slate-500">単語一覧と4択チェックだけを置いた、購入者用の最小構成です。</p></div><button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white">4択チェックを始める</button></div><div className="mt-5 overflow-hidden rounded-xl border"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-slate-500"><tr><th className="p-3">番号</th><th>英単語</th><th>意味</th></tr></thead><tbody>{sampleWords.map(([no, english, japanese]) => <tr key={no} className="border-t"><td className="p-3 text-slate-500">{no}</td><td className="font-bold">{english}</td><td>{japanese}</td></tr>)}</tbody></table></div></section><aside className="mt-8 rounded-2xl border border-blue-100 bg-white p-5"><h2 className="font-black">Vocab Print Pro本体ではさらにできること</h2><p className="mt-2 text-sm leading-6 text-slate-600">他の単語帳、Excel/CSVの貼り付け、単語テスト印刷、聞き流し、印刷レイアウト設定をまとめて利用できます。</p><Link href="/" className="mt-3 inline-block text-sm font-black text-blue-700">Vocab Print Pro本体を見る</Link></aside></div></main>;
}
