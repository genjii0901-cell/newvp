export function WordbookCover({ title, image, lazy = false }: { title: string; image?: string | null; lazy?: boolean }) {
  return (
    <div className="flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-lg bg-slate-100">
      {image ? (
        <img src={image} alt={`${title}の表紙`} className="h-full w-full object-contain" loading={lazy ? "lazy" : undefined} decoding="async" />
      ) : (
        <span className="line-clamp-3 px-2 text-center text-xs font-bold text-slate-600">{title}</span>
      )}
    </div>
  );
}

export function WordbookMemoryBadge({ percent }: { percent: number }) {
  return <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">記憶度 {percent}%</span>;
}
