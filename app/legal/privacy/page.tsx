import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "プライバシーポリシー",
  description: "Vocab Print Pro のプライバシーポリシーです。",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="text-2xl font-black text-slate-900">プライバシーポリシー</h1>
      <p className="mt-2 text-sm text-slate-500">最終更新日: 2026年6月27日</p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-slate-700">
        <section>
          <h2 className="text-lg font-black text-slate-900">1. 取得する情報</h2>
          <p className="mt-2">本サービスは、以下の情報を取得します。</p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li>メールアドレス（アカウント登録時）</li>
            <li>決済に関する情報（決済代行サービスStripeを通じて処理。カード番号等は当社では保持しません）</li>
            <li>サービス利用状況（作成履歴、利用回数など）</li>
            <li>Cookie等によるアクセス情報</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-black text-slate-900">2. 利用目的</h2>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li>本サービスの提供・本人認証・利用管理のため</li>
            <li>有料プランの決済および請求のため</li>
            <li>お問い合わせへの対応のため</li>
            <li>サービスの改善・新機能の開発のため</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-black text-slate-900">3. 第三者提供</h2>
          <p className="mt-2">
            運営者は、法令に基づく場合を除き、利用者の同意なく個人情報を第三者に提供しません。ただし、サービス提供に必要な範囲で、以下の外部サービスを利用します。
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li>Supabase（認証・データベース）</li>
            <li>Stripe（決済処理）</li>
            <li>Vercel（ホスティング）</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-black text-slate-900">4. 情報の管理</h2>
          <p className="mt-2">
            運営者は、取得した情報の漏洩・滅失・毀損の防止に努め、適切に管理します。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-black text-slate-900">5. 開示・訂正・削除</h2>
          <p className="mt-2">
            利用者は、自己の個人情報の開示・訂正・削除を求めることができます。お問い合わせ先までご連絡ください。アカウント削除をご希望の場合も同様です。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-black text-slate-900">6. お問い合わせ先</h2>
          <p className="mt-2">
            個人情報の取り扱いに関するお問い合わせは、下記までご連絡ください。
            <br />
            メールアドレス: <span className="font-bold">vocabprint@gmail.com</span>
          </p>
        </section>

        <p className="rounded-xl bg-amber-50 p-4 text-xs text-amber-800">
          ※ 本ポリシーは公開前に内容をご確認のうえ、必要に応じて専門家の確認を受けてください。
        </p>
      </div>
    </main>
  );
}
