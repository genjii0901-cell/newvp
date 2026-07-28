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

export default function PrintGateModal({
  open,
  pages,
  isLoggedIn,
  busy,
  onPurchase,
  onPersonal,
  onClose,
}: PrintGateModalProps) {
  if (!open) return null;

  const safePages = Math.max(1, pages);
  const amount = safePages * PER_PAGE_PRICE_JPY;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-center text-xs font-black text-blue-700">印刷を続けるには</p>
        <h3 className="mt-1 text-center text-xl font-black leading-tight text-slate-950">
          印刷方法を選んでください
        </h3>
        <p className="mt-2 text-center text-xs font-bold leading-5 text-slate-500">
          無料枠を超える印刷は、Personalプランか1回ごとの印刷購入で続けられます。
        </p>

        <button
          type="button"
          onClick={onPersonal}
          disabled={busy}
          className="mt-5 w-full rounded-2xl border-2 border-blue-500 bg-blue-50 p-4 text-left shadow-md transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-black text-blue-800">Personalプランで印刷し放題</span>
            <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-black text-white">
              7日間無料
            </span>
          </span>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="text-xl font-black text-slate-950">7日間 0円</span>
            <span className="text-[11px] font-bold text-slate-500">その後 月額780円</span>
          </div>
          <p className="mt-1 text-[11px] font-bold leading-5 text-slate-600">
            たくさん印刷するならこちらがおすすめです。語数制限なし・透かしなしで使えます。
          </p>
        </button>

        <button
          type="button"
          onClick={onPurchase}
          disabled={busy}
          className="mt-3 w-full rounded-2xl border-2 border-slate-200 bg-white p-4 text-left transition hover:border-blue-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-black text-slate-800">今回だけ印刷する</span>
            <span className="whitespace-nowrap text-lg font-black text-slate-950">
              ¥{amount.toLocaleString()}
            </span>
          </div>
          <p className="mt-1 text-[11px] font-bold leading-5 text-slate-500">
            {safePages}ページ × {PER_PAGE_PRICE_JPY}円。今回の印刷分だけをStripeで決済します。
            {!isLoggedIn && " 先に無料会員登録が必要です。登録後、そのまま決済へ進みます。"}
          </p>
        </button>

        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="mt-4 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "決済ページを準備中..." : "戻る"}
        </button>
        <p className="mt-3 text-center text-[11px] font-bold text-slate-400">
          支払いはStripeの安全な決済画面で行います。
        </p>
      </div>
    </div>
  );
}
