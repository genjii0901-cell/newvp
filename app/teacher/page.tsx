import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Teacherプラン | 学校・塾向け英単語テスト作成",
  description: "単語テストのタイトル変更、CSV出力、クラス・番号・氏名欄、教材管理に対応した学校・塾向けTeacherプランです。",
  alternates: { canonical: "/teacher" },
};

const features = [
  ["教材名を自由に設定", "学校名、講座名、定期テスト名など、配布目的に合わせて印刷タイトルを変更できます。"],
  ["単語リストをCSV出力", "選択した単語帳をCSVで取り出し、表計算ソフトや校内教材の編集に利用できます。"],
  ["クラス配布向けの記入欄", "クラス・番号・氏名欄、日付、ページ番号を設定して、学校の小テストに近い形で印刷できます。"],
  ["印刷回数は無制限", "複数クラスや講座で、必要なだけ教材を繰り返し作成できます。"],
  ["20ページを超える教材にも対応", "Personalの1回20ページ上限を超える、大きな範囲の教材も作成できます。"],
  ["管理しやすい保存機能", "マイ単語帳と作成履歴を使い、授業ごとの教材を再利用できます。"],
];

export default function TeacherPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <section className="rounded-3xl bg-blue-700 px-6 py-10 text-white sm:px-10">
          <p className="text-xs font-black text-blue-100">FOR SCHOOL &amp; CRAM SCHOOL</p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">Teacherプラン</h1>
          <p className="mt-4 max-w-2xl text-sm font-bold leading-7 text-blue-50">単語帳の範囲を選ぶだけで、授業用の問題・解答・一覧プリントを短時間で作成。学校名やテスト名を入れた教材作成、CSV出力にも対応します。</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/pricing" className="rounded-xl bg-white px-5 py-3 text-sm font-black text-blue-700">月額2,980円で始める</Link>
            <Link href="/wordbooks" className="rounded-xl border border-blue-300 px-5 py-3 text-sm font-black text-white">対応単語帳を見る</Link>
          </div>
        </section>

        <section className="py-10">
          <h2 className="text-2xl font-black">Teacherでできること</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(([title, text]) => (
              <article key={title} className="rounded-2xl border bg-white p-5 shadow-sm">
                <h3 className="font-black text-blue-800">{title}</h3>
                <p className="mt-2 text-sm font-bold leading-6 text-slate-600">{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-6 sm:p-8">
          <h2 className="text-xl font-black">授業での使い方</h2>
          <ol className="mt-4 grid gap-3 text-sm font-bold text-slate-700 sm:grid-cols-3">
            <li className="rounded-xl bg-slate-50 p-4">1. 単語帳と出題範囲を選ぶ</li>
            <li className="rounded-xl bg-slate-50 p-4">2. 問題形式・タイトル・記入欄を設定</li>
            <li className="rounded-xl bg-slate-50 p-4">3. プレビューを確認して印刷</li>
          </ol>
          <p className="mt-5 text-xs font-bold leading-6 text-slate-500">教材の利用にあたっては、各書籍・教材の利用条件と著作権に配慮し、授業や学習の補助としてご利用ください。</p>
        </section>
      </div>
    </main>
  );
}
