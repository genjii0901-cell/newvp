import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "特定商取引法に基づく表記",
  description: "Vocab Print Pro の特定商取引法に基づく表記です。",
};

const FILL = "【記入してください】";

const rows: { label: string; value: string }[] = [
  { label: "販売事業者", value: FILL + "（屋号または氏名）" },
  { label: "運営責任者", value: FILL },
  { label: "所在地", value: "請求があり次第、遅滞なく開示します。" },
  { label: "電話番号", value: "請求があり次第、遅滞なく開示します。" },
  { label: "メールアドレス", value: "vocabprint@gmail.com" },
  { label: "販売価格", value: "Personal: 月額780円（税込） / Teacher: 月額2,980円（税込）" },
  { label: "商品代金以外の必要料金", value: "インターネット接続料金・通信料金等は利用者のご負担となります。" },
  { label: "支払方法", value: "クレジットカード決済（Stripe）" },
  { label: "支払時期", value: "お申し込み時に課金されます。無料トライアル付きの場合はトライアル終了後に初回課金、以降は毎月自動更新で課金されます。" },
  { label: "商品の引渡し時期", value: "決済完了後、ただちに利用可能となります。" },
  {
    label: "返品・キャンセル",
    value:
      "デジタルサービスの性質上、購入後の返金は原則として行いません。サブスクリプションはいつでも解約でき、解約後は次回更新日以降の課金が停止します（日割り返金はありません）。",
  },
  { label: "動作環境", value: "最新版のモダンブラウザ（Chrome / Safari / Edge 等）" },
];

export default function TokushohoPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="text-2xl font-black text-slate-900">特定商取引法に基づく表記</h1>
      <p className="mt-2 text-sm text-slate-500">最終更新日: 2026年6月27日</p>

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

      <p className="mt-6 rounded-xl bg-amber-50 p-4 text-xs text-amber-800">
        ※「【記入してください】」の項目は、公開前に必ず実際の情報を入力してください（特定商取引法により記載が義務付けられています）。
        住所・電話番号は、個人事業主の場合「請求があれば遅滞なく開示する」形での記載も認められていますが、
        プラットフォームや決済事業者によっては全項目の開示を求められる場合があります。
      </p>
    </main>
  );
}
