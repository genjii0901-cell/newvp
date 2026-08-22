"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Check, FileImage, FileText, LockKeyhole, PackageCheck, Printer, ShoppingCart } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Asset = {
  id: string;
  title: string;
  description: string;
  wordbookId: string | null;
  wordbookTitle: string | null;
  visibility: "public" | "sale";
  outputKind?: "full-pdf" | "sample-pdf" | "sample-image" | "uploaded";
  priceJpy?: number | null;
  bundlePriceJpy?: number | null;
  mimeType?: string;
  fileName: string;
  sizeBytes: number;
  downloadUrl: string | null;
};
type Purchase = { purchase_type: "asset" | "wordbook"; asset_id: string | null; wordbook_id: string | null };

export default function PdfMaterialsClient() {
  const supabase = useMemo(() => createClient(), []);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [busyKey, setBusyKey] = useState("");

  async function authHeaders() {
    const session = supabase ? (await supabase.auth.getSession()).data.session : null;
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : null;
  }

  async function loadPurchases() {
    const headers = await authHeaders();
    if (!headers) return;
    const response = await fetch("/api/material-purchases/me", { headers, cache: "no-store" }).catch(() => null);
    const result = await response?.json().catch(() => ({}));
    if (response?.ok && Array.isArray(result.purchases)) setPurchases(result.purchases);
  }

  useEffect(() => {
    fetch("/api/pdf-assets", { cache: "no-store" })
      .then((response) => response.json())
      .then((result) => setAssets(Array.isArray(result.assets) ? result.assets : []))
      .finally(() => setLoading(false));
    queueMicrotask(() => void loadPurchases());
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if (params.get("checkout") !== "success" || !sessionId) return;
    void (async () => {
      const headers = await authHeaders();
      if (!headers) return;
      setBusyKey("verify");
      const response = await fetch("/api/stripe/verify-material-purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ sessionId }),
      }).catch(() => null);
      const result = await response?.json().catch(() => ({}));
      setMessage(response?.ok && result.paid ? "購入が完了しました。教材を開けます。" : result?.message ?? "購入結果を確認できませんでした。");
      if (response?.ok && result.paid) await loadPurchases();
      setBusyKey("");
      window.history.replaceState({}, "", "/materials");
    })();
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, { id: string | null; title: string; assets: Asset[] }>();
    for (const asset of assets) {
      const key = asset.wordbookId || `asset:${asset.id}`;
      const group = map.get(key) ?? { id: asset.wordbookId, title: asset.wordbookTitle || asset.title, assets: [] };
      group.assets.push(asset);
      map.set(key, group);
    }
    return [...map.values()].sort((a, b) => a.title.localeCompare(b.title, "ja"));
  }, [assets]);

  function isUnlocked(asset: Asset) {
    if (asset.visibility === "public") return true;
    return purchases.some((purchase) =>
      (purchase.purchase_type === "asset" && purchase.asset_id === asset.id) ||
      (purchase.purchase_type === "wordbook" && asset.wordbookId && purchase.wordbook_id === asset.wordbookId)
    );
  }

  async function startPurchase(payload: { purchaseType: "asset" | "wordbook"; assetId?: string; wordbookId?: string }) {
    const headers = await authHeaders();
    if (!headers) {
      window.location.assign("/#auth");
      return;
    }
    const key = payload.purchaseType === "asset" ? payload.assetId! : `book:${payload.wordbookId}`;
    setBusyKey(key);
    setMessage("");
    const response = await fetch("/api/stripe/material-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(payload),
    }).catch(() => null);
    const result = await response?.json().catch(() => ({}));
    if (response?.ok && result.url) window.location.assign(result.url);
    else {
      setMessage(result?.message ?? "購入画面を開けませんでした。");
      setBusyKey("");
    }
  }

  async function openAsset(asset: Asset) {
    if (asset.downloadUrl) {
      window.open(asset.downloadUrl, "_blank", "noopener,noreferrer");
      return;
    }
    const headers = await authHeaders();
    if (!headers) {
      window.location.assign("/#auth");
      return;
    }
    const pendingWindow = window.open("", "_blank");
    setBusyKey(asset.id);
    const response = await fetch(`/api/pdf-assets/${encodeURIComponent(asset.id)}/access`, { method: "POST", headers }).catch(() => null);
    const result = await response?.json().catch(() => ({}));
    if (response?.ok && result.url) {
      if (pendingWindow) pendingWindow.location.assign(result.url);
      else window.location.assign(result.url);
    } else {
      pendingWindow?.close();
      setMessage(result?.message ?? "教材を開けませんでした。");
    }
    setBusyKey("");
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-9">
      <div className="rounded-2xl bg-blue-700 p-6 text-white sm:p-9">
        <p className="text-sm font-black text-blue-100">PDF教材ストア</p>
        <h1 className="mt-2 text-2xl font-black sm:text-3xl">必要な単語帳だけ、すぐ印刷</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-blue-50">単品教材は500円から、1冊分の全形式セットは980円から。サブスクに加入しなくても購入できます。</p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold"><span className="rounded-full bg-white/15 px-3 py-1.5">購入後は再ダウンロード可</span><span className="rounded-full bg-white/15 px-3 py-1.5">編集制限付きPDF</span><span className="rounded-full bg-white/15 px-3 py-1.5">サンプル確認可</span></div>
      </div>

      {message ? <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">{message}</p> : null}
      {busyKey === "verify" ? <p className="mt-4 text-sm font-bold text-blue-700">購入内容を確認しています...</p> : null}

      <section className="mt-6 space-y-4">
        {loading ? <p className="text-sm text-slate-400">教材を読み込んでいます...</p> : groups.length === 0 ? <div className="rounded-2xl border bg-white p-8 text-center"><p className="font-bold text-slate-500">販売中の教材はまだありません。</p><Link href="/wordbooks" className="mt-3 inline-block text-sm font-black text-blue-600">みんなの単語帳を見る</Link></div> : groups.map((group) => {
          const saleAssets = group.assets.filter((asset) => asset.visibility === "sale");
          const sampleAssets = group.assets.filter((asset) => asset.visibility === "public");
          const bundleUnlocked = Boolean(group.id && purchases.some((purchase) => purchase.purchase_type === "wordbook" && purchase.wordbook_id === group.id));
          const bundlePrice = saleAssets[0]?.bundlePriceJpy ?? 980;
          return <article key={group.id || group.title} className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50 px-4 py-4 sm:px-5">
              <div><h2 className="text-lg font-black text-slate-950">{group.title}</h2><p className="mt-1 text-xs text-slate-500">完全版 {saleAssets.length}点・サンプル {sampleAssets.length}点</p></div>
              {group.id && saleAssets.length ? bundleUnlocked ? <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-100 px-4 py-2.5 text-sm font-black text-emerald-800"><PackageCheck size={17} /> セット購入済み</span> : <button type="button" onClick={() => startPurchase({ purchaseType: "wordbook", wordbookId: group.id! })} disabled={Boolean(busyKey)} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white disabled:bg-slate-300"><ShoppingCart size={17} /> 全形式セット ¥{bundlePrice.toLocaleString()}</button> : null}
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 sm:p-5">
              {[...sampleAssets, ...saleAssets].map((asset) => {
                const unlocked = isUnlocked(asset);
                const isImage = asset.mimeType?.startsWith("image/");
                return <div key={asset.id} className="flex min-h-40 flex-col rounded-xl border p-3">
                  <div className="flex items-start gap-3"><span className={`rounded-lg p-2.5 ${isImage ? "bg-violet-50 text-violet-600" : "bg-red-50 text-red-600"}`}>{isImage ? <FileImage size={20} /> : <FileText size={20} />}</span><div className="min-w-0"><h3 className="text-sm font-black text-slate-900">{asset.title}</h3><p className="mt-1 text-[11px] font-bold text-slate-400">{asset.visibility === "public" ? "無料サンプル" : `単品 ¥${(asset.priceJpy ?? 500).toLocaleString()}`}</p></div></div>
                  {asset.description ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{asset.description}</p> : null}
                  <div className="mt-auto pt-3">{unlocked ? <button type="button" onClick={() => openAsset(asset)} disabled={busyKey === asset.id} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2.5 text-xs font-black text-white"><Printer size={15} /> {asset.visibility === "public" ? "サンプルを見る" : "購入済み教材を開く"}</button> : <button type="button" onClick={() => startPurchase({ purchaseType: "asset", assetId: asset.id })} disabled={Boolean(busyKey)} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs font-black text-blue-700"><LockKeyhole size={15} /> 単品で購入</button>}</div>
                </div>;
              })}
            </div>
          </article>;
        })}
      </section>
      <p className="mt-5 flex items-center gap-2 text-xs text-slate-500"><Check size={14} className="text-emerald-500" /> 購入権限はログイン中のアカウントに保存されます。</p>
    </main>
  );
}
