"use client";

const PER_PAGE_PRICE_JPY = 50;

export type PrintGateModalProps = {
  open: boolean;
  pages: number;
  isLoggedIn: boolean;
  busy?: boolean;
  onPurchase: () => void;
  onPersonal: () => void;
  onClose: () => void;
};

// 「最後の印刷」で出すゲート。単品購入（1ページ50円×枚数）か、Personal 7日間無料かを選ばせる。
export default function PrintGateModal({ open, pages, isLoggedIn, busy, onPurchase, onPersonal, onClose }: PrintGateModalProps) {
  if (!open) return null;
  const amount = Math.max(1, pages) * PER_PAGE_PRICE_JPY;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl sm:p-7" onClick={(e) => e.stopPropagation()}>
        <p className="text-center text-xs font-black text-blue-700">印刷するには</p>
        <h3 className="mt-1 text-center text-xl font-black leading-tight text-slate-950">
          支払い方法を選んでください
        </h3>

        {/* 単品購入 */}
        <button
          type="button"
          onClick={onPurchase}
          disabled={busy}
          className="mt-5 w-full rounded-2xl border-2 border-slate-200 bg-white p-4 text-left transition hover:border-blue-300 disabled:opacity-60"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-black text-slate-800">① この内容を単品購入</span>
            <span className="text-lg font-black text-slate-950">¥{amount.toLocaleString()}</span>
          </div>
          <p className="mt-1 text-[11px] font-bold text-slate-500">
            {pages}ページ × {PER_PAGE_PRICE_JPY}円。今回の印刷ぶんだけ支払います。
            {isLoggedIn ? "カードを登録すると次回から自動で決済されます。" : "会員登録（無料）が必要です。"}
          </p>
        </button>

        {/* Personal */}
        <button
          type="button"
          onClick={onPersonal}
          disabled={busy}
          className="relative mt-3 w-full rounded-2xl border-2 border-blue-500 bg-blue-50 p-4 text-left shadow-md transition hover:bg-blue-100 disabled:opacity-60"
        >
          <span className="absolute right-3 top-3 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-black text-white">おすすめ・期間限定</span>
          <div className="flex items-center justify-between">
            <span className="text-sm font-black text-blue-800">② Personalプランで印刷し放題</span>
            <span className="text-lg font-black text-slate-950">7日間 0円</span>
          </div>
          <p className="mt-1 text-[11px] font-bold text-slate-600">
            7日間無料 → その後 月780円・いつでも解約OK。印刷し放題・透かしなし。何回も印刷するならこちらがお得。
          </p>
        </button>

        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="mt-4 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-60"
        >
          {busy ? "処理中..." : "戻る"}
        </button>
        <p className="mt-3 text-center text-[11px] font-bold text-slate-400">
          支払いはStripeの安全な決済画面で行われます。
        </p>
      </div>
    </div>
  );
}
