export function WordbookCover({ title, image, lazy = false, crop = false }: { title: string; image?: string | null; lazy?: boolean; crop?: boolean }) {
  return (
    <div className={`flex w-full items-center justify-center overflow-hidden bg-slate-100 ${crop ? "aspect-[4/3]" : "aspect-[3/4] rounded-lg"}`}>
      {image ? (
        <img src={image} alt={`${title}の表紙`} className={`h-full w-full ${crop ? "object-cover" : "object-contain"}`} loading={lazy ? "lazy" : undefined} decoding="async" />
      ) : (
        <span className="line-clamp-3 px-2 text-center text-xs font-bold text-slate-600">{title}</span>
      )}
    </div>
  );
}
