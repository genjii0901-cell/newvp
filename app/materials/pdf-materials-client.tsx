"use client";

import { useEffect, useState } from "react";
import { FileText, Printer } from "lucide-react";

type Asset = { id: string; title: string; description: string; wordbookTitle: string | null; fileName: string; sizeBytes: number; downloadUrl: string };

export default function PdfMaterialsClient() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/pdf-assets").then((response) => response.json()).then((result) => setAssets(Array.isArray(result.assets) ? result.assets : [])).finally(() => setLoading(false));
  }, []);
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="rounded-3xl bg-gradient-to-br from-blue-700 to-sky-500 p-6 text-white sm:p-9">
        <p className="text-sm font-black text-blue-100">PDF教材</p>
        <h1 className="mt-2 text-3xl font-black">保存済み教材をすぐ印刷</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-blue-50">毎回作り直す必要のない教材や配布用PDFを、ここから開いて印刷できます。</p>
      </div>
      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? <p className="text-sm text-slate-400">読み込んでいます...</p> : assets.length === 0 ? <p className="text-sm text-slate-400">公開中のPDF教材はまだありません。</p> : assets.map((asset) => (
          <article key={asset.id} className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3"><span className="rounded-xl bg-red-50 p-3 text-red-600"><FileText size={22} /></span><div className="min-w-0"><h2 className="font-black text-slate-950">{asset.title}</h2><p className="mt-1 text-xs text-slate-400">{asset.wordbookTitle || "PDF教材"}</p></div></div>
            {asset.description ? <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{asset.description}</p> : null}
            <a href={asset.downloadUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-700"><Printer size={17} /> 開いて印刷</a>
          </article>
        ))}
      </section>
    </main>
  );
}

