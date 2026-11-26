export default function PrintPageCount({ pages }: { pages: number }) {
  return (
    <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border bg-slate-50 px-3 py-2">
      <span className="text-xs font-bold text-slate-600">ページ数</span>
      <output className="shrink-0 whitespace-nowrap text-base font-black tabular-nums text-slate-950">
        {pages}<span className="ml-1 text-xs font-bold">ページ</span>
      </output>
    </div>
  );
}
