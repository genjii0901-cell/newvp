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
  visibility: "public" | "admin";
  storagePath: string;
  fileName: string;
  sizeBytes: number;
  createdAt: string;
};

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
  if (buckets?.some((bucket) => bucket.name === PDF_ASSET_BUCKET)) return;
  const { error } = await supabase.storage.createBucket(PDF_ASSET_BUCKET, {
    public: false,
    fileSizeLimit: 30 * 1024 * 1024,
    allowedMimeTypes: ["application/pdf"],
  });
  if (error && !/already exists/i.test(error.message)) throw error;
}

export async function readPdfAssetCatalog(): Promise<PdfAsset[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", PDF_ASSET_CATALOG_KEY)
    .maybeSingle();
  if (error) throw error;
  return parseCatalog((data as { value?: unknown } | null)?.value)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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

