"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, FileImage, FileText, RefreshCw, Search, Trash2, Upload } from "lucide-react";

type Book = { id: string; title: string; wordCount?: number };
export type PdfBatchVariantId =
  | "list"
  | "translation-test"
  | "translation-answer"
  | "spelling-hint-test"
  | "spelling-blank-test"
  | "spelling-answer"
  | "random-list"
  | "random-translation-test"
  | "random-translation-answer"
  | "random-spelling-hint-test"
  | "random-spelling-blank-test"
  | "random-spelling-answer"
  | "red-japanese-list"
  | "red-english-list";
export type PdfBatchOutput = "full-pdf" | "sample-pdf" | "sample-image";
export type PdfBatchRequest = {
  bookIds: string[];
  variants: PdfBatchVariantId[];
  outputs: PdfBatchOutput[];
  visibility: "admin" | "sale";
  lockEditing: boolean;
  ownerPassword: string;
  individualPriceJpy: number;
  bundlePriceJpy: number;
  existingAssetKeys?: string[];
};
export type PdfBatchProgress = { completed: number; total: number; current: string; failed: number };
export type PdfBatchResult = { saved: number; failed: Array<{ key: string; message: string }> };

type Asset = {
  id: string;
  title: string;
  description: string;
  wordbookId: string | null;
  wordbookTitle: string | null;
  kind: "generated" | "uploaded";
  visibility: "public" | "admin" | "sale";
  variant?: string | null;
  outputKind?: PdfBatchOutput | "uploaded";
  priceJpy?: number | null;
  bundlePriceJpy?: number | null;
  isSample?: boolean;
  mimeType?: string;
  fileName: string;
  sizeBytes: number;
  createdAt: string;
  assetKey?: string | null;
  downloadUrl?: string | null;
  storageProvider?: "supabase" | "r2";
};

const VARIANTS: Array<{ id: PdfBatchVariantId; label: string; group: string }> = [
  { id: "list", label: "単語一覧", group: "書籍順" },
  { id: "translation-test", label: "和訳テスト（問題）", group: "書籍順" },
  { id: "translation-answer", label: "和訳テスト（解答）", group: "書籍順" },
  { id: "spelling-hint-test", label: "スペルテスト（頭文字あり）", group: "書籍順" },
  { id: "spelling-blank-test", label: "スペルテスト（頭文字なし）", group: "書籍順" },
  { id: "spelling-answer", label: "スペルテスト（解答）", group: "書籍順" },
  { id: "random-list", label: "ランダム単語一覧", group: "ランダム" },
  { id: "random-translation-test", label: "ランダム和訳テスト（問題）", group: "ランダム" },
  { id: "random-translation-answer", label: "ランダム和訳テスト（解答）", group: "ランダム" },
  { id: "random-spelling-hint-test", label: "ランダムスペル（頭文字あり）", group: "ランダム" },
  { id: "random-spelling-blank-test", label: "ランダムスペル（頭文字なし）", group: "ランダム" },
  { id: "random-spelling-answer", label: "ランダムスペル（解答）", group: "ランダム" },
  { id: "red-japanese-list", label: "赤シート一覧（日本語を赤字）", group: "赤シート" },
  { id: "red-english-list", label: "赤シート一覧（英語を赤字）", group: "赤シート" },
];

const DEFAULT_VARIANTS: PdfBatchVariantId[] = ["list", "translation-test", "translation-answer", "spelling-hint-test", "spelling-answer", "random-translation-test", "red-japanese-list"];
const VARIANT_LABELS = new Map(VARIANTS.map((item) => [item.id, item.label]));
const OUTPUT_LABELS: Record<NonNullable<Asset["outputKind"]>, string> = {
  "full-pdf": "完全版PDF",
  "sample-pdf": "サンプルPDF",
  "sample-image": "サンプル画像",
  uploaded: "登録教材",
};

function createStrongOwnerPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_";
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function downloadOwnerPasswordBackup(password: string) {
  const body = [
    "Vocab Print Pro PDF editing password",
    `Created: ${new Date().toISOString()}`,
    "",
    password,
    "",
    "Keep this file private. Buyers do not need this password to open or print PDFs.",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([body], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `vocab-print-pro-pdf-owner-password-${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export default function AdminPdfLibrary({
  books,
  currentBookId,
  getHeaders,
  onStoreCurrent,
  onStoreBatch,
  busy,
}: {
  books: Book[];
  currentBookId: string;
  getHeaders: () => Promise<Record<string, string>>;
  onStoreCurrent: () => Promise<boolean>;
  onStoreBatch: (request: PdfBatchRequest, onProgress: (progress: PdfBatchProgress) => void) => Promise<PdfBatchResult>;
  busy: boolean;
}) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [variants, setVariants] = useState<PdfBatchVariantId[]>(DEFAULT_VARIANTS);
  const [outputs, setOutputs] = useState<PdfBatchOutput[]>(["full-pdf", "sample-pdf", "sample-image"]);
  const [batchVisibility, setBatchVisibility] = useState<"admin" | "sale">("admin");
  const [lockEditing, setLockEditing] = useState(true);
  const [ownerPassword, setOwnerPassword] = useState("");
  const [individualPriceJpy, setIndividualPriceJpy] = useState(500);
  const [bundlePriceJpy, setBundlePriceJpy] = useState(980);
  const [progress, setProgress] = useState<PdfBatchProgress | null>(null);
  const [lastFailed, setLastFailed] = useState<string[]>([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "admin" | "sale">("admin");
  const [uploadPrice, setUploadPrice] = useState(500);
  const [uploadBundlePrice, setUploadBundlePrice] = useState(980);
  const [uploadBookId, setUploadBookId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [storageProvider, setStorageProvider] = useState<"supabase" | "r2">("supabase");
  const [missingR2Settings, setMissingR2Settings] = useState<string[]>([]);
  const [assetFilter, setAssetFilter] = useState("");
  const sortedBooks = useMemo(() => [...books].sort((a, b) => a.title.localeCompare(b.title, "ja")), [books]);
  const totalJobs = selectedIds.length * variants.length * outputs.length;
  const visibleAssets = useMemo(() => {
    const query = assetFilter.trim().toLocaleLowerCase("ja");
    if (!query) return assets;
    return assets.filter((asset) => [asset.title, asset.wordbookTitle, asset.description, asset.fileName, asset.variant]
      .map((value) => String(value ?? "")).join(" ").toLocaleLowerCase("ja").includes(query));
  }, [assetFilter, assets]);
  const assetGroups = useMemo(() => {
    const groups = new Map<string, { title: string; wordbookId: string | null; assets: Asset[] }>();
    for (const asset of visibleAssets) {
      const key = asset.wordbookId || `standalone:${asset.wordbookTitle || "独自教材"}`;
      const current = groups.get(key) ?? { title: asset.wordbookTitle || "独自教材", wordbookId: asset.wordbookId, assets: [] };
      current.assets.push(asset);
      groups.set(key, current);
    }
    return [...groups.values()]
      .map((group) => ({
        ...group,
        totalBytes: group.assets.reduce((sum, asset) => sum + asset.sizeBytes, 0),
        fullCount: group.assets.filter((asset) => asset.outputKind === "full-pdf").length,
        sampleCount: group.assets.filter((asset) => asset.isSample || asset.outputKind === "sample-pdf" || asset.outputKind === "sample-image").length,
        assets: [...group.assets].sort((a, b) => `${a.variant}:${a.outputKind}`.localeCompare(`${b.variant}:${b.outputKind}`, "ja")),
      }))
      .sort((a, b) => a.title.localeCompare(b.title, "ja"));
  }, [visibleAssets]);

  async function load() {
    setLoading(true);
    const headers = await getHeaders();
    const response = await fetch("/api/admin/pdf-assets", { headers, cache: "no-store" }).catch(() => null);
    const result = await response?.json().catch(() => ({}));
    if (!response?.ok) setMessage(result?.message ?? "保存済み教材を読み込めませんでした。");
    else {
      setAssets(Array.isArray(result.assets) ? result.assets : []);
      setStorageProvider(result.preferredStorageProvider === "r2" ? "r2" : "supabase");
      setMissingR2Settings(Array.isArray(result?.storageConfiguration?.r2?.missing) ? result.storageConfiguration.r2.missing : []);
    }
    setLoading(false);
  }

  useEffect(() => { queueMicrotask(() => void load()); }, []);

  function toggle<T extends string>(value: T, current: T[], setter: (next: T[]) => void) {
    setter(current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  async function upload() {
    if (!file) return;
    setLoading(true);
    setMessage("");
    const headers = await getHeaders();
    const book = sortedBooks.find((item) => item.id === uploadBookId);
    const metadata = {
      title,
      description,
      visibility,
      kind: "uploaded",
      outputKind: "uploaded",
      priceJpy: uploadPrice,
      bundlePriceJpy: uploadBundlePrice,
      wordbookId: book?.id ?? "",
      wordbookTitle: book?.title ?? "",
      mimeType: file.type,
      fileName: file.name,
    };

    if (storageProvider === "r2") {
      const prepareResponse = await fetch("/api/admin/pdf-assets/direct-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ action: "prepare", mimeType: file.type, sizeBytes: file.size }),
      }).catch(() => null);
      const prepared = await prepareResponse?.json().catch(() => ({}));
      if (!prepareResponse?.ok) {
        setMessage(prepared?.message ?? "教材の保存先を準備できませんでした。");
        setLoading(false);
        return;
      }
      const uploadResponse = await fetch(prepared.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file }).catch(() => null);
      if (!uploadResponse?.ok) {
        setMessage("教材ファイルを保存先へ送信できませんでした。");
        setLoading(false);
        return;
      }
      const finalizeResponse = await fetch("/api/admin/pdf-assets/direct-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ action: "finalize", id: prepared.id, storagePath: prepared.storagePath, ...metadata }),
      }).catch(() => null);
      const finalized = await finalizeResponse?.json().catch(() => ({}));
      if (!finalizeResponse?.ok) setMessage(finalized?.message ?? "教材を登録できませんでした。");
      else {
        setMessage("教材を登録しました。");
        setFile(null);
        setTitle("");
        setDescription("");
        await load();
      }
      setLoading(false);
      return;
    }

    const form = new FormData();
    form.set("file", file);
    Object.entries(metadata).forEach(([key, value]) => form.set(key, String(value)));
    const response = await fetch("/api/admin/pdf-assets", { method: "POST", headers, body: form }).catch(() => null);
    const result = await response?.json().catch(() => ({}));
    if (!response?.ok) setMessage(result?.message ?? "教材を登録できませんでした。");
    else {
      setMessage("教材を登録しました。");
      setFile(null);
      setTitle("");
      setDescription("");
      await load();
    }
    setLoading(false);
  }

  async function runBatch(bookIds = selectedIds) {
    if (!bookIds.length || !variants.length || !outputs.length) return;
    if (lockEditing && !ownerPassword.trim()) {
      setMessage("販売用・保護用PDFには変更用パスワードを入力してください。");
      return;
    }
    setMessage("");
    setLastFailed([]);
    const result = await onStoreBatch({
      bookIds,
      variants,
      outputs,
      visibility: batchVisibility,
      lockEditing,
      ownerPassword,
      individualPriceJpy,
      bundlePriceJpy,
      existingAssetKeys: assets.map((asset) => asset.assetKey).filter((key): key is string => Boolean(key)),
    }, setProgress);
    setProgress(null);
    setLastFailed(result.failed.map((item) => item.key));
    setMessage(result.failed.length
      ? `${result.saved}件を保存し、${result.failed.length}件は失敗しました。失敗分だけ再実行できます。`
      : `${result.saved}件をすべて保存しました。`);
    if (result.saved) await load();
  }

  async function runFullCatalog() {
    if (storageProvider !== "r2") {
      setMessage("全冊の一括作成にはCloudflare R2の設定が必要です。設定後は、この画面に「保存先: R2」と表示されます。");
      return;
    }
    const catalogOwnerPassword = ownerPassword.trim() || createStrongOwnerPassword();
    if (!ownerPassword.trim()) {
      setOwnerPassword(catalogOwnerPassword);
      downloadOwnerPasswordBackup(catalogOwnerPassword);
    }
    const allVariants = VARIANTS.map((item) => item.id);
    const allOutputs: PdfBatchOutput[] = ["full-pdf", "sample-pdf", "sample-image"];
    const allBookIds = sortedBooks.map((book) => book.id);
    const possibleJobs = allBookIds.length * allVariants.length * allOutputs.length;
    if (!window.confirm(`${allBookIds.length}冊・${allVariants.length}形式を準備します。最大${possibleJobs.toLocaleString()}件です。作成済みファイルは自動で飛ばします。開始しますか？`)) return;
    setSelectedIds(allBookIds);
    setVariants(allVariants);
    setOutputs(allOutputs);
    setBatchVisibility("sale");
    setMessage("");
    setLastFailed([]);
    const result = await onStoreBatch({
      bookIds: allBookIds,
      variants: allVariants,
      outputs: allOutputs,
      visibility: "sale",
      lockEditing: true,
      ownerPassword: catalogOwnerPassword,
      individualPriceJpy,
      bundlePriceJpy,
      existingAssetKeys: assets.map((asset) => asset.assetKey).filter((key): key is string => Boolean(key)),
    }, setProgress);
    setProgress(null);
    setLastFailed(result.failed.map((item) => item.key));
    setMessage(result.failed.length
      ? `${result.saved}件を保存し、${result.failed.length}件は失敗しました。もう一度実行すると未作成分から再開できます。`
      : `${result.saved}件を保存しました。販売用完全版と公開サンプルの準備が完了しました。`);
    if (result.saved) await load();
  }

  async function remove(asset: Asset) {
    if (!window.confirm(`「${asset.title}」を削除しますか？`)) return;
    const headers = await getHeaders();
    const response = await fetch("/api/admin/pdf-assets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ id: asset.id }),
    });
    const result = await response.json().catch(() => ({}));
    setMessage(response.ok ? "削除しました。" : result?.message ?? "削除できませんでした。");
    if (response.ok) await load();
  }

  function downloadManifest() {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), assets }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `vocab-print-pro-materials-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  function downloadCsvManifest() {
    const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = [
      ["title", "wordbook", "file_name", "format", "visibility", "price_jpy", "size_bytes", "download_url"],
      ...assets.map((asset) => [asset.title, asset.wordbookTitle ?? "", asset.fileName, asset.outputKind ?? "uploaded", asset.visibility, asset.priceJpy ?? "", asset.sizeBytes, asset.downloadUrl ?? ""]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(quote).join(",")).join("\r\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `vocab-print-pro-materials-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  async function downloadAsset(asset: Asset, quiet = false) {
    if (!asset.downloadUrl) return false;
    try {
      const response = await fetch(asset.downloadUrl);
      if (!response.ok) throw new Error("download failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = asset.fileName || `${asset.title}.${asset.mimeType?.startsWith("image/") ? "png" : "pdf"}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2_000);
      if (!quiet) setMessage(`「${asset.title}」をダウンロードしました。`);
      return true;
    } catch {
      window.open(asset.downloadUrl, "_blank", "noopener,noreferrer");
      if (!quiet) setMessage("ブラウザで教材を開きました。表示後に保存してください。");
      return false;
    }
  }

  async function downloadSelectedAssets() {
    const targets = assets.filter((asset) => selectedAssetIds.includes(asset.id) && asset.downloadUrl);
    if (!targets.length) return;
    setLoading(true);
    let completed = 0;
    for (const asset of targets) {
      if (await downloadAsset(asset, true)) completed += 1;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    setMessage(`${completed}/${targets.length}件をダウンロードしました。ブラウザから複数ダウンロードの確認が出た場合は許可してください。`);
    setLoading(false);
  }

  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-blue-700">教材管理</p>
          <h2 className="mt-1 text-xl font-black text-slate-950">PDF・サンプル一括作成</h2>
          <p className="mt-1 text-sm text-slate-500">管理用の保管と、購入者向け教材を分けて作成できます。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/api/admin/batch-token?callback=local" className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black text-slate-600"><Download size={15} /> 高速作成キー</a>
          <button type="button" onClick={downloadManifest} disabled={!assets.length} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black text-slate-600 disabled:text-slate-300"><Download size={15} /> JSON一覧</button>
          <button type="button" onClick={downloadCsvManifest} disabled={!assets.length} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black text-slate-600 disabled:text-slate-300"><Download size={15} /> CSV一覧</button>
          <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black text-slate-600"><RefreshCw size={15} /> 再読み込み</button>
        </div>
      </div>

      <p className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-bold leading-relaxed text-blue-800">
        作成したPDF・画像はここに保存されます。「管理者のみ」はこの画面だけ、「無料公開」「販売」はPDF教材ストアにも表示されます。
      </p>
      <p className={`mt-2 rounded-xl border px-3 py-2 text-xs font-bold ${storageProvider === "r2" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
        保存先: {storageProvider === "r2" ? "Cloudflare R2（全冊の一括作成が可能）" : "Supabase（少量保存のみ・全冊作成はR2設定後に有効）"}
        {storageProvider !== "r2" && missingR2Settings.length > 0 && (
          <span className="mt-1 block font-mono font-semibold">未設定: {missingR2Settings.join(", ")}</span>
        )}
      </p>

      <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
        <div className="grid gap-4 xl:grid-cols-3">
          <div>
            <p className="text-sm font-black text-slate-900">1. 単語帳を選ぶ</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => setSelectedIds(sortedBooks.map((book) => book.id))} className="rounded-lg border bg-white px-2.5 py-1.5 text-xs font-bold">すべて選択</button>
              <button type="button" onClick={() => setSelectedIds([])} className="rounded-lg border bg-white px-2.5 py-1.5 text-xs font-bold">解除</button>
            </div>
            <div className="mt-2 rounded-xl border border-blue-100 bg-white p-2">
              <p className="mb-1.5 text-[11px] font-black text-blue-700">並列作成用に4分割</p>
              <div className="grid grid-cols-4 gap-1.5">
                {[0, 1, 2, 3].map((chunkIndex) => (
                  <button
                    key={chunkIndex}
                    type="button"
                    onClick={() => setSelectedIds(sortedBooks.filter((_, index) => index % 4 === chunkIndex).map((book) => book.id))}
                    className="rounded-lg border bg-slate-50 px-2 py-1.5 text-[11px] font-black text-slate-700 hover:border-blue-300 hover:bg-blue-50"
                  >
                    {chunkIndex + 1}/4
                  </button>
                ))}
              </div>
            </div>
            <details className="mt-2 rounded-xl border bg-white p-3" open={selectedIds.length === 0}>
              <summary className="cursor-pointer text-sm font-black">選択中 {selectedIds.length}冊</summary>
              <div className="mt-2 max-h-56 space-y-1 overflow-auto">
                {sortedBooks.map((book) => <label key={book.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-bold hover:bg-slate-50"><input type="checkbox" checked={selectedIds.includes(book.id)} onChange={() => toggle(book.id, selectedIds, setSelectedIds)} /><span className="min-w-0 flex-1 truncate">{book.title}</span><span className="text-slate-400">{book.wordCount ?? 0}語</span></label>)}
              </div>
            </details>
          </div>

          <div>
            <p className="text-sm font-black text-slate-900">2. 作る形式を選ぶ</p>
            <div className="mt-2 max-h-72 space-y-3 overflow-auto rounded-xl border bg-white p-3">
              {["書籍順", "ランダム", "赤シート"].map((group) => <div key={group}><p className="mb-1 text-[11px] font-black text-slate-400">{group}</p>{VARIANTS.filter((item) => item.group === group).map((item) => <label key={item.id} className="flex cursor-pointer items-center gap-2 py-1 text-xs font-bold"><input type="checkbox" checked={variants.includes(item.id)} onChange={() => toggle(item.id, variants, setVariants)} />{item.label}</label>)}</div>)}
            </div>
          </div>

          <div>
            <p className="text-sm font-black text-slate-900">3. 保存方法を決める</p>
            <div className="mt-2 space-y-3 rounded-xl border bg-white p-3 text-xs">
              <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
                <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={outputs.includes("full-pdf")} onChange={() => toggle("full-pdf", outputs, setOutputs)} /> 完全版PDF</label>
                <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={outputs.includes("sample-pdf")} onChange={() => toggle("sample-pdf", outputs, setOutputs)} /> 先頭1枚PDF</label>
                <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={outputs.includes("sample-image")} onChange={() => toggle("sample-image", outputs, setOutputs)} /> 先頭1枚画像</label>
              </div>
              <label className="block font-bold">用途<select value={batchVisibility} onChange={(event) => setBatchVisibility(event.target.value as "admin" | "sale")} className="mt-1 w-full rounded-lg border px-2 py-2"><option value="admin">管理者だけで保管</option><option value="sale">PDF教材として販売</option></select></label>
              <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={lockEditing} onChange={(event) => setLockEditing(event.target.checked)} /> PDFの変更を制限する</label>
              {lockEditing ? <div><label className="block font-bold">変更用パスワード<input type="password" value={ownerPassword} onChange={(event) => setOwnerPassword(event.target.value)} autoComplete="new-password" placeholder="空欄なら全冊作成時に自動生成" className="mt-1 w-full rounded-lg border px-3 py-2" /></label><button type="button" onClick={() => { const password = createStrongOwnerPassword(); setOwnerPassword(password); downloadOwnerPasswordBackup(password); setMessage("安全な変更用パスワードを作成し、控えを保存しました。"); }} className="mt-2 w-full rounded-lg border bg-slate-50 px-3 py-2 text-[11px] font-black text-slate-600">安全なパスワードを自動生成・控えを保存</button></div> : null}
              {batchVisibility === "sale" ? <div className="grid grid-cols-2 gap-2"><label className="font-bold">単品価格<input type="number" min={50} step={10} value={individualPriceJpy} onChange={(event) => setIndividualPriceJpy(Number(event.target.value))} className="mt-1 w-full rounded-lg border px-2 py-2" /></label><label className="font-bold">1冊セット<input type="number" min={100} step={10} value={bundlePriceJpy} onChange={(event) => setBundlePriceJpy(Number(event.target.value))} className="mt-1 w-full rounded-lg border px-2 py-2" /></label></div> : null}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="font-black text-slate-700">作成予定: {totalJobs}ファイル</span><span className="text-slate-500">1件ずつ保存するため、途中で失敗しても成功分は残ります。</span></div>
          {progress ? <div className="mt-2"><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-blue-600 transition-all" style={{ width: `${Math.round((progress.completed / Math.max(1, progress.total)) * 100)}%` }} /></div><p className="mt-1 truncate text-xs font-bold text-blue-700">{progress.completed}/{progress.total}・失敗 {progress.failed}・{progress.current}</p></div> : null}
          <button type="button" onClick={() => runBatch()} disabled={!totalJobs || busy || Boolean(progress)} className="mt-3 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white disabled:bg-slate-300">選んだ教材を一括作成・保存</button>
          <button type="button" onClick={runFullCatalog} disabled={storageProvider !== "r2" || busy || Boolean(progress) || sortedBooks.length === 0} className="mt-2 w-full rounded-xl border-2 border-blue-600 bg-white px-4 py-3 text-sm font-black text-blue-700 disabled:border-slate-200 disabled:text-slate-300">全{sortedBooks.length}冊・全{VARIANTS.length}形式の販売カタログを作成</button>
          <p className="mt-2 text-[11px] leading-5 text-slate-500">完全版PDFは販売用、先頭1ページのPDF・画像は購入前サンプルとして保存します。管理者はすべてを確認・外部保存できます。再実行時は作成済みを飛ばします。</p>
          {lastFailed.length ? <button type="button" onClick={() => runBatch([...new Set(lastFailed.map((key) => key.split("::")[0]))])} disabled={busy || Boolean(progress)} className="mt-2 w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-black text-amber-800">失敗した単語帳だけ再実行</button> : null}
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-sm font-black text-slate-900">現在の印刷設定を1件保存</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">上の管理者印刷画面で調整したレイアウトを、そのまま保存します。</p>
          <button type="button" onClick={async () => { if (await onStoreCurrent()) { setMessage("現在のPDFを保存しました。"); await load(); } }} disabled={!currentBookId || busy} className="mt-3 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white disabled:bg-slate-300">現在のPDFを保存</button>
        </div>

        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-sm font-black text-slate-900">手元・AIで作った教材を登録</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">PDFのほか、告知やサンプル用のPNG・JPEGも保管できます。</p>
          <input type="file" accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="mt-3 block w-full text-xs" />
          <div className="mt-2 grid gap-2 sm:grid-cols-2"><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="教材名" className="w-full rounded-xl border bg-white px-3 py-2 text-sm" /><select value={uploadBookId} onChange={(event) => setUploadBookId(event.target.value)} className="w-full rounded-xl border bg-white px-3 py-2 text-sm"><option value="">単語帳に紐付けない</option>{sortedBooks.map((book) => <option key={book.id} value={book.id}>{book.title}</option>)}</select></div>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="説明" rows={2} className="mt-2 w-full rounded-xl border bg-white px-3 py-2 text-sm" />
          <div className="mt-2 grid gap-2 sm:grid-cols-3"><label className="text-xs font-bold">公開範囲<select value={visibility} onChange={(event) => setVisibility(event.target.value as "public" | "admin" | "sale")} className="mt-1 w-full rounded-lg border bg-white px-2 py-2"><option value="admin">管理者のみ</option><option value="public">無料公開</option><option value="sale">販売</option></select></label>{visibility === "sale" ? <><label className="text-xs font-bold">単品価格<input type="number" value={uploadPrice} onChange={(event) => setUploadPrice(Number(event.target.value))} className="mt-1 w-full rounded-lg border px-2 py-2" /></label><label className="text-xs font-bold">セット価格<input type="number" value={uploadBundlePrice} onChange={(event) => setUploadBundlePrice(Number(event.target.value))} className="mt-1 w-full rounded-lg border px-2 py-2" /></label></> : null}</div>
          <button type="button" onClick={upload} disabled={!file || loading} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm font-black text-slate-700 disabled:text-slate-300"><Upload size={16} /> 教材を登録</button>
        </div>
      </div>

      {message ? <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">{message}</p> : null}

      {assets.length ? <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border bg-slate-50 p-3">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={assetFilter} onChange={(event) => setAssetFilter(event.target.value)} placeholder="単語帳名・形式・ファイル名で検索" className="w-full rounded-lg border bg-white py-2 pl-9 pr-3 text-xs font-bold" /></div>
        <button type="button" onClick={() => setSelectedAssetIds(visibleAssets.map((asset) => asset.id))} className="rounded-lg border bg-white px-3 py-2 text-xs font-black text-slate-600">表示中を選択</button>
        <button type="button" onClick={() => setSelectedAssetIds([])} className="rounded-lg border bg-white px-3 py-2 text-xs font-black text-slate-600">選択解除</button>
        <button type="button" onClick={downloadSelectedAssets} disabled={!selectedAssetIds.length || loading} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-black text-white disabled:bg-slate-300"><Download size={15} /> 選択した{selectedAssetIds.length || ""}件を外部保存</button>
        <span className="w-full text-[11px] text-slate-500">{assetGroups.length}冊・{visibleAssets.length}件を表示中。AIや別サービスへ渡す場合は、ダウンロードしたPDF・画像とCSV一覧を使用できます。</span>
      </div> : null}

      <div className="mt-3 space-y-2">
        {assets.length === 0 ? <p className="text-sm text-slate-400">保存済み教材はまだありません。</p> : null}
        {assets.length > 0 && assetGroups.length === 0 ? <p className="rounded-xl border border-dashed p-4 text-sm text-slate-400">検索に一致する教材はありません。</p> : null}
        {assetGroups.map((group) => (
          <details key={`${group.wordbookId}:${group.title}`} className="group rounded-2xl border bg-white" open={assetGroups.length === 1}>
            <summary className="flex cursor-pointer list-none items-center gap-3 p-3 sm:p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-sm font-black text-blue-700">{group.title.slice(0, 1)}</span>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-slate-900 sm:text-base">{group.title}</p><p className="mt-0.5 text-[11px] text-slate-500">完全版 {group.fullCount}件・サンプル {group.sampleCount}件・合計 {(group.totalBytes / 1024 / 1024).toFixed(1)}MB</p></div>
              <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setSelectedAssetIds((current) => [...new Set([...current, ...group.assets.map((asset) => asset.id)])]); }} className="rounded-lg border px-2.5 py-1.5 text-[11px] font-black text-slate-600">この単語帳を選択</button>
              <span className="text-slate-400 transition group-open:rotate-180">⌄</span>
            </summary>
            <div className="border-t p-2 sm:p-3">
              <div className="grid gap-2 lg:grid-cols-2">
                {group.assets.map((asset) => (
                  <article key={asset.id} className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/60 p-2.5">
                    <input type="checkbox" aria-label={`${asset.title}を選択`} checked={selectedAssetIds.includes(asset.id)} onChange={() => toggle(asset.id, selectedAssetIds, setSelectedAssetIds)} className="shrink-0" />
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${asset.mimeType?.startsWith("image/") ? "bg-violet-50 text-violet-600" : "bg-red-50 text-red-600"}`}>{asset.mimeType?.startsWith("image/") ? <FileImage size={18} /> : <FileText size={18} />}</span>
                    <div className="min-w-0 flex-1"><p className="truncate text-xs font-black text-slate-900">{VARIANT_LABELS.get(asset.variant as PdfBatchVariantId) || asset.title}</p><div className="mt-1 flex flex-wrap gap-1"><span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-600">{OUTPUT_LABELS[asset.outputKind ?? "uploaded"]}</span><span className="rounded bg-white px-1.5 py-0.5 text-[10px] text-slate-400">{(asset.sizeBytes / 1024 / 1024).toFixed(1)}MB</span><span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-600">{asset.visibility === "sale" ? `販売 ¥${asset.priceJpy ?? 500}` : asset.visibility === "public" ? "無料公開" : "管理者のみ"}</span></div></div>
                    {asset.downloadUrl ? <button type="button" onClick={() => downloadAsset(asset)} title="ダウンロード" className="rounded-lg p-2 text-blue-600 hover:bg-blue-50"><Download size={16} /></button> : null}
                    <button type="button" onClick={() => remove(asset)} title="削除" className="rounded-lg p-2 text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>
                  </article>
                ))}
              </div>
            </div>
          </details>
        ))}
      </div>
      <p className="mt-4 flex items-center gap-2 text-xs text-slate-500"><CheckCircle2 size={14} className="text-emerald-500" /> 販売用完全版は購入者だけが開けます。サンプルは購入前に確認できます。</p>
    </section>
  );
}
