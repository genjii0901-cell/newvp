import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "特定商取引法に基づく表記",
  description: "Vocab Print Pro の特定商取引法に基づく表記です。",
};

const rows: { label: string; value: string }[] = [
  { label: "販売事業者", value: "神谷 元輝" },
  { label: "運営責任者", value: "神谷 元輝" },
  { label: "所在地", value: "請求があり次第、遅滞なく開示します。" },
  { label: "電話番号", value: "請求があり次第、遅滞なく開示します。" },
  { label: "メールアドレス", value: "vocabprint@gmail.com" },
  { label: "販売価格", value: "都度印刷: 1ページ50円（税込） / Personal: 初回7日間380円（税込）、8日目から月額1,580円（税込） / Teacher: 月額2,980円（税込）。既存契約は契約時の価格が適用されます。" },
  { label: "商品代金以外の必要料金", value: "インターネット接続料金・通信料金等は利用者のご負担となります。" },
  {
    label: "支払方法",
    value:
      "Stripe Checkoutで利用可能なクレジットカード、Apple Pay、Google Pay、Linkなど（購入画面に表示される方法）",
  },
  { label: "支払時期", value: "都度印刷とPersonal初週380円は申込時に決済します。初回割引対象のPersonalは8日目から月額1,580円で自動更新し、対象外の方は申込時から月額1,580円で自動更新します。既存契約は契約時の条件に従います。" },
  { label: "商品の引渡し時期", value: "決済完了後、ただちに利用可能となります。" },
  {
    label: "返品・キャンセル",
    value:
      "デジタルサービスの性質上、購入後の返金は原則として行いません。サブスクリプションはいつでも解約できます。初回7日間380円の期間中に解約するとPersonal機能は直ちに停止します。月額期間中の解約では次回更新日以降の課金が停止し、日割り返金はありません。",
  },
  { label: "動作環境", value: "最新版のモダンブラウザ（Chrome / Safari / Edge 等）" },
];

export default function TokushohoPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="text-2xl font-black text-slate-900">特定商取引法に基づく表記</h1>
      <p className="mt-2 text-sm text-slate-500">最終更新日: 2026年10月6日</p>

      <div className="mt-8 overflow-hidden rounded-2xl border">
        <table className="w-full border-collapse text-sm">
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b last:border-0 align-top">
                <th className="w-40 bg-slate-50 px-4 py-3 text-left font-bold text-slate-700">
                  {row.label}
                </th>
                <td className="px-4 py-3 leading-relaxed text-slate-700">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-6 rounded-xl bg-slate-50 p-4 text-xs text-slate-500">
        ※ 住所・電話番号は、ご請求があり次第、遅滞なく開示いたします。開示をご希望の場合は上記メールアドレスまでご連絡ください。
      </p>
    </main>
  );
}
