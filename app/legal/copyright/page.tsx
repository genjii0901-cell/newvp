import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "著作権・コンテンツ利用について",
  description: "Vocab Print Proで扱う教材名、画像、単語リスト、生成物の利用方針と権利者向けの連絡窓口です。",
};

export default function CopyrightPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="text-2xl font-black text-slate-900">著作権・コンテンツ利用について</h1>
      <p className="mt-2 text-sm text-slate-500">最終更新日: 2026年7月30日</p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-slate-700">
        <section>
          <h2 className="text-lg font-black text-slate-900">サービスの位置づけ</h2>
          <p className="mt-2">
            Vocab Print Proは、利用者が正規に保有・利用する単語帳や、自身で作成した単語リストを使って、学習用のプリント、聞き流し、単語チェックを作成するための補助サービスです。市販教材そのものを販売・代替するサービスではありません。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-black text-slate-900">教材名・画像・商標について</h2>
          <p className="mt-2">
            単語帳の名称、表紙画像、ロゴ、商標その他の表示は、単語帳を識別し、利用者が対象教材を確認するために参照表示する場合があります。これらの権利は各出版社、著作者その他の権利者に帰属します。Vocab Print Proは、各権利者との提携、公認、推奨または許諾を示すものではありません。
          </p>
          <p className="mt-2">
            表紙画像等は、権利者の表示、正規の提供元、または利用者が登録したデータに基づき掲載します。権利関係が確認できない表示については、確認のうえ掲載停止・差し替え・削除を行う場合があります。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-black text-slate-900">単語リスト・日本語訳・生成物について</h2>
          <p className="mt-2">
            本サービスで表示される単語、意味、例示、分類、並び順等は、利用者の入力、公開情報、運営者による編集、または学習用途に合わせた整形に基づく場合があります。日本語訳や表記は、学習上の見やすさを目的に独自に変更・要約されることがあり、出版社・著作者による公式訳や公式見解ではありません。
          </p>
          <p className="mt-2">
            生成したPDF、画像、音声その他の出力物は、利用者自身の学習、家庭内学習、または利用者が所属する学校・塾等で許諾された指導目的の範囲で利用してください。権利者の許諾なく、ウェブサイト、SNS、ファイル共有サービス等への公開、第三者への配布、転載、転売、教材としての再販売を行うことは禁止します。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-black text-slate-900">権利者の方からのご連絡</h2>
          <p className="mt-2">
            掲載されている教材名、画像、単語リストその他の表示について、権利上の懸念や掲載内容の修正・削除のご希望がある場合は、対象ページのURL、該当箇所、権利者であることを確認できる情報、希望する対応を添えてご連絡ください。内容を確認し、必要に応じて一時非公開、削除、差し替え等を行います。
          </p>
          <p className="mt-2">
            連絡先: <a className="font-bold text-blue-700 underline" href="mailto:vocabprint@gmail.com">vocabprint@gmail.com</a>
          </p>
        </section>

        <p className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500">
          本ページはサービスの運用方針を示すものであり、個別の権利関係について法的判断を行うものではありません。必要に応じて、権利者または専門家にご確認ください。
        </p>
      </div>
    </main>
  );
}
