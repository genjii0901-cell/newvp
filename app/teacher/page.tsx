import type { Metadata } from "next";
import Link from "next/link";
import TeacherCsvTool from "./csv-tool";

export const metadata: Metadata = {
  title: "Teacherプラン | 学校・塾向け英単語テスト作成",
  description: "単語テストのタイトル変更、20ページを超える教材の印刷、CSV出力に対応した学校・塾向けTeacherプランです。",
  alternates: { canonical: "/teacher" },
};

const teacherOnly = [
  ["教材名を自由に設定", "学校名、講座名、定期テスト名など、配布目的に合わせて印刷タイトルを変更できます。"],
  ["20ページを超える教材にも対応", "Personalの1回20ページ上限を超える、大きな範囲の教材も作成できます。"],
  ["CSV出力と列名の設定", "自作の単語帳をCSVで書き出し、列の見出しを自分の形式に合わせられます。"],
];

const alsoInPersonal = [
  ["クラス配布向けの記入欄", "クラス・番号・氏名欄、日付、ページ番号を設定して、学校の小テストに近い形で印刷できます。"],
  ["印刷回数は無制限", "複数クラスや講座で、必要なだけ教材を繰り返し作成できます。"],
  ["管理しやすい保存機能", "マイ単語帳と作成履歴を使い、授業ごとの教材を再利用できます。"],
];

export default function TeacherPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 pb-28 pt-8 text-slate-900 sm:pb-12">
      <div className="mx-auto max-w-5xl">
        <section className="rounded-2xl bg-blue-700 px-4 py-6 text-white sm:rounded-3xl sm:px-10 sm:py-10">
          <p className="text-xs font-black text-blue-100">FOR SCHOOL &amp; CRAM SCHOOL</p>
          <h1 className="mt-1 text-2xl font-black sm:mt-2 sm:text-4xl">Teacherプラン</h1>
          <p className="mt-3 max-w-2xl text-[13px] font-bold leading-6 text-blue-50 sm:mt-4 sm:text-sm sm:leading-7">単語帳の範囲を選ぶだけで、授業用の問題・解答・一覧プリントを短時間で作成。学校名やテスト名を入れた教材作成にも対応します。</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/pricing" className="rounded-xl bg-white px-4 py-2.5 text-[13px] font-black text-blue-700 sm:px-5 sm:py-3 sm:text-sm">料金プランを見る・申し込む（月間¥3,980／年間は月換算¥2,080）</Link>
            <Link href="/wordbooks" className="rounded-xl border border-blue-300 px-4 py-2.5 text-[13px] font-black text-white sm:px-5 sm:py-3 sm:text-sm">対応単語帳を見る</Link>
          </div>
        </section>

        <section className="py-8 sm:py-10">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-black sm:text-2xl">Teacher限定の機能</h2>
            <span className="rounded-full bg-blue-700 px-3 py-1 text-xs font-black text-white">Teacher限定</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {teacherOnly.map(([title, text]) => (
              <article key={title} className="rounded-2xl border border-blue-200 bg-white p-4 shadow-sm sm:p-5">
                <h3 className="font-black text-blue-800">{title}</h3>
                <p className="mt-2 text-sm font-bold leading-6 text-slate-600">{text}</p>
              </article>
            ))}
          </div>

          <h2 className="mt-8 text-lg font-black text-slate-800 sm:text-xl">Personalにも含まれる機能</h2>
          <p className="mt-1 text-xs font-bold text-slate-500">TeacherはPersonalの機能をすべて含みます。</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {alsoInPersonal.map(([title, text]) => (
              <article key={title} className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
                <h3 className="font-black text-slate-800">{title}</h3>
                <p className="mt-2 text-sm font-bold leading-6 text-slate-600">{text}</p>
              </article>
            ))}
          </div>
        </section>

        <div className="mb-10">
          <TeacherCsvTool />
        </div>

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
