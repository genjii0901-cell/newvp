import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "利用規約",
  description: "Vocab Print Pro の利用規約です。",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="text-2xl font-black text-slate-900">利用規約</h1>
      <p className="mt-2 text-sm text-slate-500">最終更新日: 2026年6月27日</p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-slate-700">
        <section>
          <h2 className="text-lg font-black text-slate-900">第1条（適用）</h2>
          <p className="mt-2">
            本規約は、Vocab Print Pro（以下「本サービス」）の利用条件を定めるものです。利用者は本規約に同意のうえ本サービスを利用するものとします。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-black text-slate-900">第2条（アカウント登録）</h2>
          <p className="mt-2">
            利用者は、正確な情報を登録するものとします。登録情報に虚偽があった場合、運営者はアカウントの利用停止または削除を行うことがあります。アカウントの管理責任は利用者が負うものとします。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-black text-slate-900">第3条（料金・支払い）</h2>
          <p className="mt-2">
            有料プラン（Personal / Teacher）の料金および支払い方法は、料金ページおよび「特定商取引法に基づく表記」に定めるとおりです。支払いは決済代行サービス（Stripe）を通じて行われます。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-black text-slate-900">第4条（無料トライアル・解約）</h2>
          <p className="mt-2">
            Personalプランには初回登録から7日間の無料トライアルが付与される場合があります。トライアル期間中に解約された場合、料金は発生しません。トライアル終了後は自動的に有料プランへ移行し、登録された決済方法へ課金されます。解約はいつでも可能で、解約後は次回更新日以降の課金が停止します。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-black text-slate-900">第5条（教材・コンテンツの利用）</h2>
          <p className="mt-2">
            本サービスは、利用者が保有または正規に利用する教材・単語リストを用いた学習を補助するためのサービスです。市販教材の名称、表紙画像、商標その他の権利は、それぞれの出版社その他の権利者に帰属し、本サービスが当該権利者と提携または公認されていることを示すものではありません。詳しい取り扱いは「著作権・コンテンツ利用」に定めます。
          </p>
          <p className="mt-2">
            本サービス上の日本語訳、表記、分類、並び順その他の加工は、学習支援のために独自に編集・整形される場合があります。これらは各出版社・著作者による公式見解または公式訳を示すものではありません。生成したプリント等は、利用者自身の学習、家庭内学習または所属する学校・塾等での許諾された指導目的の範囲で利用してください。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-black text-slate-900">第6条（禁止事項）</h2>
          <p className="mt-2">利用者は、以下の行為を行ってはなりません。</p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li>法令または公序良俗に反する行為</li>
            <li>本サービスの運営を妨害する行為</li>
            <li>不正アクセス、リバースエンジニアリング等の行為</li>
            <li>教材・単語リスト・生成物の無断転載、公開、再配布、転売または第三者への販売</li>
            <li>権利者の許諾なく、市販教材の代替物として本サービスのコンテンツを提供する行為</li>
            <li>他の利用者または第三者の権利を侵害する行為</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-black text-slate-900">第7条（免責事項）</h2>
          <p className="mt-2">
            運営者は、本サービスの内容について、正確性・完全性・有用性等を保証しません。本サービスの利用により生じた損害について、運営者の故意または重過失による場合を除き、責任を負わないものとします。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-black text-slate-900">第8条（サービスの変更・終了）</h2>
          <p className="mt-2">
            運営者は、利用者への事前の通知なく、本サービスの内容の変更・追加・終了を行うことができるものとします。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-black text-slate-900">第9条（規約の変更）</h2>
          <p className="mt-2">
            運営者は、必要に応じて本規約を変更することがあります。変更後の規約は、本ページに掲示した時点から効力を生じるものとします。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-black text-slate-900">第10条（準拠法・管轄）</h2>
          <p className="mt-2">
            本規約は日本法に準拠します。本サービスに関して紛争が生じた場合、運営者の所在地を管轄する裁判所を第一審の専属的合意管轄とします。
          </p>
        </section>

        <p className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500">
          本規約は、法令の改正やサービス内容の変更に応じて更新することがあります。
        </p>
      </div>
    </main>
  );
}
