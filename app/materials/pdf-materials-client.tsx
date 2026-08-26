"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronRight,
  Copy,
  Download,
  FileImage,
  FileText,
  LockKeyhole,
  PackageCheck,
  Printer,
  Search,
  ShoppingCart,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Asset = {
  id: string;
  title: string;
  description: string;
  wordbookId: string | null;
  wordbookTitle: string | null;
  visibility: "public" | "sale";
  variant?: string | null;
  outputKind?: "full-pdf" | "sample-pdf" | "sample-image" | "uploaded";
  priceJpy?: number | null;
  bundlePriceJpy?: number | null;
  mimeType?: string;
  fileName: string;
  sizeBytes: number;
  downloadUrl: string | null;
};

type MaterialGroup = {
  id: string;
  wordbookId: string | null;
  title: string;
  description: string;
  saleCount: number;
  sampleCount: number;
  variantCount: number;
  bundlePriceJpy: number;
  fromPriceJpy: number;
  sampleImageUrl: string | null;
};

type GroupDetail = { group: MaterialGroup; assets: Asset[] };
type Purchase = { purchase_type: "asset" | "wordbook"; asset_id: string | null; wordbook_id: string | null };

function groupProducts(assets: Asset[]) {
  return [...assets.reduce((map, asset) => {
    const key = asset.variant || `asset:${asset.id}`;
    const product = map.get(key) ?? { key, assets: [] as Asset[] };
    product.assets.push(asset);
    map.set(key, product);
    return map;
  }, new Map<string, { key: string; assets: Asset[] }>()).values()]
    .sort((a, b) => (a.assets.find((asset) => asset.visibility === "sale")?.title ?? a.key)
      .localeCompare(b.assets.find((asset) => asset.visibility === "sale")?.title ?? b.key, "ja"));
}

export default function PdfMaterialsClient() {
  const supabase = useMemo(() => createClient(), []);
  const [groups, setGroups] = useState<MaterialGroup[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [details, setDetails] = useState<Record<string, GroupDetail>>({});
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
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

  async function loadGroups() {
    setLoading(true);
    const response = await fetch("/api/pdf-assets", { cache: "no-store" }).catch(() => null);
    const result = await response?.json().catch(() => ({}));
    if (response?.ok && Array.isArray(result.groups)) {
      setGroups(result.groups);
    } else {
      setMessage(result?.message ?? "教材一覧を読み込めませんでした。時間をおいて再読み込みしてください。");
    }
    setLoading(false);
  }

  async function openGroup(group: MaterialGroup) {
    setSelectedId(group.id);
    setMessage("");
    if (group.wordbookId) {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set("book", group.wordbookId);
      window.history.replaceState({}, "", `${nextUrl.pathname}${nextUrl.search}`);
    }
    if (!details[group.id] && group.wordbookId) {
      setDetailLoading(true);
      const response = await fetch(`/api/pdf-assets?wordbookId=${encodeURIComponent(group.wordbookId)}`, { cache: "no-store" }).catch(() => null);
      const result = await response?.json().catch(() => ({}));
      if (response?.ok && result.group && Array.isArray(result.assets)) {
        setDetails((current) => ({ ...current, [group.id]: { group: result.group, assets: result.assets } }));
      } else {
        setMessage(result?.message ?? "教材の詳細を読み込めませんでした。");
      }
      setDetailLoading(false);
    }
    window.setTimeout(() => document.getElementById("material-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function closeGroup() {
    setSelectedId("");
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete("book");
    window.history.replaceState({}, "", `${nextUrl.pathname}${nextUrl.search}`);
  }

  useEffect(() => {
    queueMicrotask(() => {
      void loadGroups();
      void loadPurchases();
    });
  }, []);

  useEffect(() => {
    if (!groups.length || selectedId) return;
    const requestedBook = new URLSearchParams(window.location.search).get("book");
    const requestedGroup = requestedBook ? groups.find((group) => group.wordbookId === requestedBook) : null;
    if (requestedGroup) queueMicrotask(() => void openGroup(requestedGroup));
  }, [groups]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if (params.get("checkout") === "cancel") {
      queueMicrotask(() => setMessage("購入はキャンセルされました。料金は発生していません。"));
      window.history.replaceState({}, "", "/materials");
      return;
    }
    if (params.get("checkout") !== "success" || !sessionId) return;
    void (async () => {
      const headers = await authHeaders();
      if (!headers) {
        setMessage("購入内容を確認するため、もう一度ログインしてください。");
        return;
      }
      setBusyKey("verify");
      const response = await fetch("/api/stripe/verify-material-purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ sessionId }),
      }).catch(() => null);
      const result = await response?.json().catch(() => ({}));
      setMessage(response?.ok && result.paid
        ? "購入が完了しました。教材をダウンロードできます。"
        : result?.message ?? "購入結果を確認できませんでした。お問い合わせから決済番号をお知らせください。");
      if (response?.ok && result.paid) await loadPurchases();
      setBusyKey("");
      window.history.replaceState({}, "", "/materials");
    })();
  }, []);

  const filteredGroups = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ja");
    if (!normalized) return groups;
    return groups.filter((group) => `${group.title} ${group.description}`.toLocaleLowerCase("ja").includes(normalized));
  }, [groups, query]);

  const selectedGroup = groups.find((group) => group.id === selectedId) ?? null;
  const selectedDetail = selectedId ? details[selectedId] : null;
  const products = selectedDetail ? groupProducts(selectedDetail.assets) : [];

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
      setMessage(result?.message ?? "購入画面を開けませんでした。時間をおいてもう一度お試しください。");
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

  async function copyForNote() {
    if (!selectedGroup) return;
    const pageUrl = `${window.location.origin}/materials?book=${encodeURIComponent(selectedGroup.wordbookId ?? "")}`;
    const text = [
      selectedGroup.title,
      selectedGroup.description,
      `${selectedGroup.variantCount}形式のPDF教材・サンプルを掲載しています。`,
      `全形式セット ${selectedGroup.bundlePriceJpy.toLocaleString()}円`,
      pageUrl,
    ].filter(Boolean).join("\n\n");
    await navigator.clipboard.writeText(text);
    setMessage("noteなどに貼れる紹介文とURLをコピーしました。");
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-9">
      <div className="rounded-xl bg-blue-700 p-5 text-white sm:p-8">
        <p className="text-sm font-black text-blue-100">PDF教材ストア</p>
        <h1 className="mt-2 text-2xl font-black sm:text-3xl">必要な単語帳だけ、すぐ印刷</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-blue-50">単品教材は500円から、1冊分の全形式セットは980円から。サブスクに加入しなくても購入できます。</p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
          <span className="rounded-full bg-white/15 px-3 py-1.5">購入後は再ダウンロード可</span>
          <span className="rounded-full bg-white/15 px-3 py-1.5">編集制限付きPDF</span>
          <span className="rounded-full bg-white/15 px-3 py-1.5">サンプル確認可</span>
        </div>
      </div>

      {message ? <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">{message}</p> : null}
      {busyKey === "verify" ? <p className="mt-4 text-sm font-bold text-blue-700">購入内容を確認しています...</p> : null}

      <section className="mt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block w-full sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="単語帳名で検索" className="w-full rounded-lg border bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-500" />
          </label>
          <div className="flex gap-2 text-xs font-black">
            <Link href="/api/pdf-assets" target="_blank" rel="noreferrer" className="rounded-lg border bg-white px-3 py-2.5 text-slate-700">JSON API</Link>
            <Link href="/api/pdf-assets?format=csv" className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2.5 text-slate-700"><Download size={14} /> CSV一覧</Link>
          </div>
        </div>

        {loading ? <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-lg bg-slate-100" />)}</div>
          : filteredGroups.length === 0 ? <div className="mt-5 rounded-lg border bg-white p-8 text-center"><p className="font-bold text-slate-500">該当する教材がありません。</p><Link href="/wordbooks" className="mt-3 inline-block text-sm font-black text-blue-600">みんなの単語帳を見る</Link></div>
            : <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredGroups.map((group) => (
                <button key={group.id} type="button" onClick={() => void openGroup(group)} aria-expanded={selectedId === group.id} className={`flex min-h-28 items-center gap-3 rounded-lg border bg-white p-3 text-left transition hover:border-blue-300 hover:shadow-sm ${selectedId === group.id ? "border-blue-500 ring-2 ring-blue-100" : ""}`}>
                  <div className="h-20 w-16 shrink-0 overflow-hidden rounded-md border bg-slate-50">
                    {group.sampleImageUrl ? <img src={group.sampleImageUrl} alt="" loading="lazy" className="h-full w-full object-cover object-top" /> : <div className="flex h-full items-center justify-center text-slate-300"><FileImage size={24} /></div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="line-clamp-2 text-sm font-black leading-5 text-slate-950">{group.title}</h2>
                    <p className="mt-1 text-xs font-bold text-blue-600">{group.variantCount}形式・セット ¥{group.bundlePriceJpy.toLocaleString()}</p>
                    <p className="mt-1 line-clamp-1 text-[11px] text-slate-500">完全版 {group.saleCount}件 / サンプル {group.sampleCount}件</p>
                  </div>
                  <ChevronRight size={18} className="shrink-0 text-slate-300" />
                </button>
              ))}
            </div>}
      </section>

      {selectedGroup ? <section id="material-detail" className="mt-7 scroll-mt-4 rounded-xl border bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-slate-50 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <p className="text-xs font-black text-blue-600">選択中の単語帳</p>
            <h2 className="mt-1 text-lg font-black text-slate-950">{selectedGroup.title}</h2>
            <p className="mt-1 text-xs text-slate-500">必要な形式だけ購入するか、全形式セットを選べます。</p>
          </div>
          <button type="button" onClick={closeGroup} className="rounded-lg border bg-white p-2 text-slate-500" aria-label="詳細を閉じる"><X size={18} /></button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 sm:px-5">
          {selectedGroup.wordbookId && purchases.some((purchase) => purchase.purchase_type === "wordbook" && purchase.wordbook_id === selectedGroup.wordbookId)
            ? <span className="inline-flex items-center gap-2 rounded-lg bg-emerald-100 px-4 py-2.5 text-sm font-black text-emerald-800"><PackageCheck size={17} /> セット購入済み</span>
            : selectedGroup.wordbookId ? <button type="button" onClick={() => void startPurchase({ purchaseType: "wordbook", wordbookId: selectedGroup.wordbookId! })} disabled={Boolean(busyKey)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-black text-white disabled:bg-slate-300"><ShoppingCart size={17} /> 全形式セット ¥{selectedGroup.bundlePriceJpy.toLocaleString()}</button> : null}
          <button type="button" onClick={() => void copyForNote()} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-black text-slate-700"><Copy size={15} /> note用紹介文をコピー</button>
          {selectedGroup.wordbookId ? <>
            <a href={`/api/pdf-assets?wordbookId=${encodeURIComponent(selectedGroup.wordbookId)}`} target="_blank" rel="noreferrer" className="rounded-lg border px-3 py-2.5 text-xs font-black text-slate-700">詳細JSON</a>
            <a href={`/api/pdf-assets?wordbookId=${encodeURIComponent(selectedGroup.wordbookId)}&format=csv`} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2.5 text-xs font-black text-slate-700"><Download size={14} /> 詳細CSV</a>
          </> : null}
        </div>

        {detailLoading ? <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 sm:p-5">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-56 animate-pulse rounded-lg bg-slate-100" />)}</div>
          : <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 sm:p-5">
            {products.map((product) => {
              const full = product.assets.find((asset) => asset.visibility === "sale" && asset.outputKind === "full-pdf");
              const sampleImage = product.assets.find((asset) => asset.visibility === "public" && asset.outputKind === "sample-image");
              const samplePdf = product.assets.find((asset) => asset.visibility === "public" && asset.outputKind === "sample-pdf");
              const fallback = full ?? samplePdf ?? sampleImage ?? product.assets[0];
              const unlocked = full ? isUnlocked(full) : false;
              return <div key={product.key} className="flex min-h-60 flex-col overflow-hidden rounded-lg border bg-white">
                {sampleImage?.downloadUrl ? <div className="aspect-[210/125] overflow-hidden border-b bg-slate-100"><img src={sampleImage.downloadUrl} alt={`${fallback.title}のサンプル`} loading="lazy" className="h-full w-full object-cover object-top" /></div> : <div className="flex aspect-[210/125] items-center justify-center border-b bg-slate-50 text-slate-300"><FileImage size={34} /></div>}
                <div className="flex flex-1 flex-col p-3">
                  <div className="flex items-start gap-3"><span className="rounded-lg bg-red-50 p-2.5 text-red-600"><FileText size={20} /></span><div className="min-w-0"><h3 className="line-clamp-2 text-sm font-black text-slate-900">{full?.title ?? fallback.title.replace(/\s+サンプル$/, "")}</h3><p className="mt-1 text-[11px] font-bold text-blue-600">{full ? `単品 ¥${(full.priceJpy ?? 500).toLocaleString()}` : "サンプルのみ"}</p></div></div>
                  {fallback.description ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{fallback.description}</p> : null}
                  <div className="mt-auto grid gap-2 pt-3 sm:grid-cols-2">
                    {samplePdf ? <button type="button" onClick={() => void openAsset(samplePdf)} className="inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-black text-slate-700"><Printer size={15} /> サンプルPDF</button> : <span />}
                    {full ? unlocked ? <button type="button" onClick={() => void openAsset(full)} disabled={busyKey === full.id} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2.5 text-xs font-black text-white"><Printer size={15} /> ダウンロード</button> : <button type="button" onClick={() => void startPurchase({ purchaseType: "asset", assetId: full.id })} disabled={Boolean(busyKey)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs font-black text-blue-700"><LockKeyhole size={15} /> 単品で購入</button> : null}
                  </div>
                </div>
              </div>;
            })}
          </div>}
      </section> : null}

      <p className="mt-5 flex items-center gap-2 text-xs text-slate-500"><Check size={14} className="text-emerald-500" /> 購入権限はログイン中のアカウントに保存されます。</p>
    </main>
  );
}
