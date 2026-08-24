import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const PDF_ASSET_BUCKET = "pdf-assets";
const PDF_ASSET_CATALOG_KEY = "pdf_asset_catalog_v1";

export type PdfAsset = {
  id: string;
  title: string;
  description: string;
  wordbookId: string | null;
  wordbookTitle: string | null;
  kind: "generated" | "uploaded";
  visibility: "public" | "admin" | "sale";
  assetKey?: string | null;
  variant?: string | null;
  outputKind?: "full-pdf" | "sample-pdf" | "sample-image" | "uploaded";
  priceJpy?: number | null;
  bundlePriceJpy?: number | null;
  isSample?: boolean;
  mimeType?: "application/pdf" | "image/png" | "image/jpeg";
  storagePath: string;
  fileName: string;
  sizeBytes: number;
  createdAt: string;
};

type PdfAssetRow = {
  id: string;
  asset_key: string | null;
  title: string;
  description: string;
  wordbook_id: string | null;
  wordbook_title: string | null;
  kind: PdfAsset["kind"];
  visibility: PdfAsset["visibility"];
  variant: string | null;
  output_kind: NonNullable<PdfAsset["outputKind"]>;
  price_jpy: number | null;
  bundle_price_jpy: number | null;
  is_sample: boolean;
  mime_type: NonNullable<PdfAsset["mimeType"]>;
  storage_path: string;
  file_name: string;
  size_bytes: number;
  created_at: string;
};

function isMissingPdfAssetsTable(error: unknown) {
  const message = error instanceof Error ? error.message : String((error as { message?: unknown } | null)?.message ?? "");
  return /pdf_assets|schema cache|relation .* does not exist/i.test(message);
}

function fromRow(row: PdfAssetRow): PdfAsset {
  return {
    id: row.id,
    assetKey: row.asset_key,
    title: row.title,
    description: row.description,
    wordbookId: row.wordbook_id,
    wordbookTitle: row.wordbook_title,
    kind: row.kind,
    visibility: row.visibility,
    variant: row.variant,
    outputKind: row.output_kind,
    priceJpy: row.price_jpy,
    bundlePriceJpy: row.bundle_price_jpy,
    isSample: row.is_sample,
    mimeType: row.mime_type,
    storagePath: row.storage_path,
    fileName: row.file_name,
    sizeBytes: Number(row.size_bytes),
    createdAt: row.created_at,
  };
}

function toRow(asset: PdfAsset): PdfAssetRow {
  return {
    id: asset.id,
    asset_key: asset.assetKey ?? null,
    title: asset.title,
    description: asset.description,
    wordbook_id: asset.wordbookId,
    wordbook_title: asset.wordbookTitle,
    kind: asset.kind,
    visibility: asset.visibility,
    variant: asset.variant ?? null,
    output_kind: asset.outputKind ?? "uploaded",
    price_jpy: asset.priceJpy ?? null,
    bundle_price_jpy: asset.bundlePriceJpy ?? null,
    is_sample: Boolean(asset.isSample),
    mime_type: asset.mimeType ?? "application/pdf",
    storage_path: asset.storagePath,
    file_name: asset.fileName,
    size_bytes: asset.sizeBytes,
    created_at: asset.createdAt,
  };
}

function parseCatalog(value: unknown): PdfAsset[] {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is PdfAsset => Boolean(item && typeof item.id === "string" && typeof item.storagePath === "string"))
      : [];
  } catch {
    return [];
  }
}

export async function ensurePdfAssetBucket() {
  const supabase = getSupabaseAdmin();
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw listError;
  if (buckets?.some((bucket) => bucket.name === PDF_ASSET_BUCKET)) {
    const { error } = await supabase.storage.updateBucket(PDF_ASSET_BUCKET, {
      public: false,
      fileSizeLimit: 30 * 1024 * 1024,
      allowedMimeTypes: ["application/pdf", "image/png", "image/jpeg"],
    });
    if (error) throw error;
    return;
  }
  const { error } = await supabase.storage.createBucket(PDF_ASSET_BUCKET, {
    public: false,
    fileSizeLimit: 30 * 1024 * 1024,
    allowedMimeTypes: ["application/pdf", "image/png", "image/jpeg"],
  });
  if (error && !/already exists/i.test(error.message)) throw error;
}

export async function readPdfAssetCatalog(): Promise<PdfAsset[]> {
  const supabase = getSupabaseAdmin();
  const { data: rows, error: tableError } = await supabase
    .from("pdf_assets")
    .select("*")
    .order("created_at", { ascending: false });
  if (!tableError) return ((rows ?? []) as PdfAssetRow[]).map(fromRow);
  if (!isMissingPdfAssetsTable(tableError)) throw tableError;

  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", PDF_ASSET_CATALOG_KEY)
    .maybeSingle();
  if (error) throw error;
  return parseCatalog((data as { value?: unknown } | null)?.value)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function upsertPdfAsset(asset: PdfAsset): Promise<PdfAsset | undefined> {
  const supabase = getSupabaseAdmin();
  const existingResult = asset.assetKey
    ? await supabase.from("pdf_assets").select("*").eq("asset_key", asset.assetKey).maybeSingle()
    : await supabase.from("pdf_assets").select("*").eq("id", asset.id).maybeSingle();
  if (!existingResult.error) {
    const replaced = existingResult.data ? fromRow(existingResult.data as PdfAssetRow) : undefined;
    const normalized = replaced ? { ...asset, id: replaced.id } : asset;
    const { error } = await supabase
      .from("pdf_assets")
      .upsert(toRow(normalized), { onConflict: asset.assetKey ? "asset_key" : "id" });
    if (error) throw error;
    return replaced;
  }
  if (!isMissingPdfAssetsTable(existingResult.error)) throw existingResult.error;

  const catalog = await readPdfAssetCatalog();
  const replaced = asset.assetKey ? catalog.find((item) => item.assetKey === asset.assetKey) : undefined;
  const normalized = replaced ? { ...asset, id: replaced.id } : asset;
  const next = replaced
    ? [normalized, ...catalog.filter((item) => item.id !== replaced.id)]
    : [normalized, ...catalog];
  await writePdfAssetCatalog(next);
  return replaced;
}

export async function deletePdfAsset(id: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("pdf_assets").delete().eq("id", id);
  if (!error) return;
  if (!isMissingPdfAssetsTable(error)) throw error;
  const catalog = await readPdfAssetCatalog();
  await writePdfAssetCatalog(catalog.filter((asset) => asset.id !== id));
}

export async function writePdfAssetCatalog(assets: PdfAsset[]) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("app_settings").upsert(
    { key: PDF_ASSET_CATALOG_KEY, value: JSON.stringify(assets) },
    { onConflict: "key" },
  );
  if (error) throw error;
}

export async function createPdfAssetSignedUrl(storagePath: string, expiresIn = 300) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage.from(PDF_ASSET_BUCKET).createSignedUrl(storagePath, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}
