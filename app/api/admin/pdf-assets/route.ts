import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import {
  deletePdfAsset,
  ensurePdfAssetBucket,
  pdfAssetStorageConfigurationStatus,
  preferredPdfAssetStorageProvider,
  readPdfAssetCatalog,
  removePdfAssetFile,
  uploadPdfAssetFile,
  upsertPdfAsset,
  type PdfAsset,
} from "@/lib/pdf-assets";
import { isSupabaseServerConfigured, supabaseServerConfigResponse } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 30 * 1024 * 1024;
const ACCEPTED_TYPES = new Map([
  ["application/pdf", { extension: "pdf", signature: "%PDF-" }],
  ["image/png", { extension: "png", signature: "\u0089PNG" }],
  ["image/jpeg", { extension: "jpg", signature: "\u00ff\u00d8\u00ff" }],
] as const);

function formString(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

function positivePrice(value: string, fallback: number | null) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function validateFile(file: File) {
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
    throw new Error("ファイルは30MB以下にしてください。");
  }
  const configured = ACCEPTED_TYPES.get(file.type as "application/pdf" | "image/png" | "image/jpeg");
  if (!configured) throw new Error("PDF、PNG、JPEGのみ登録できます。");
  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (file.type === "application/pdf" && new TextDecoder().decode(header.slice(0, 5)) !== configured.signature) {
    throw new Error("正しいPDFファイルを選択してください。");
  }
  if (file.type === "image/png" && !(header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47)) {
    throw new Error("正しいPNG画像を選択してください。");
  }
  if (file.type === "image/jpeg" && !(header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff)) {
    throw new Error("正しいJPEG画像を選択してください。");
  }
  return configured.extension;
}

export async function GET(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  if (!isSupabaseServerConfigured()) return supabaseServerConfigResponse();
  try {
    const assets = await readPdfAssetCatalog();
    const withUrls = assets.map((asset) => ({
      ...asset,
      downloadUrl: `/api/admin/pdf-assets/${asset.id}`,
    }));
    return NextResponse.json({
      ok: true,
      assets: withUrls,
      preferredStorageProvider: preferredPdfAssetStorageProvider(),
      storageConfiguration: {
        r2: pdfAssetStorageConfigurationStatus(),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "教材を読み込めませんでした。" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  if (!isSupabaseServerConfigured()) return supabaseServerConfigResponse();
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, message: "登録するファイルが見つかりません。" }, { status: 400 });
    }
    const extension = await validateFile(file);
    await ensurePdfAssetBucket();

    const id = randomUUID();
    const storagePath = `materials/${id}.${extension}`;
    const storageProvider = await uploadPdfAssetFile(storagePath, await file.arrayBuffer(), file.type);

    const visibilityValue = formString(form, "visibility");
    const visibility: PdfAsset["visibility"] = visibilityValue === "admin" || visibilityValue === "sale" ? visibilityValue : "public";
    const outputValue = formString(form, "outputKind");
    const outputKind: PdfAsset["outputKind"] = outputValue === "full-pdf" || outputValue === "sample-pdf" || outputValue === "sample-image"
      ? outputValue
      : "uploaded";
    const assetKey = formString(form, "assetKey") || null;
    const asset: PdfAsset = {
      id,
      title: formString(form, "title") || file.name.replace(/\.(pdf|png|jpe?g)$/i, ""),
      description: formString(form, "description"),
      wordbookId: formString(form, "wordbookId") || null,
      wordbookTitle: formString(form, "wordbookTitle") || null,
      kind: formString(form, "kind") === "generated" ? "generated" : "uploaded",
      visibility,
      assetKey,
      variant: formString(form, "variant") || null,
      outputKind,
      priceJpy: visibility === "sale" ? positivePrice(formString(form, "priceJpy"), 500) : null,
      bundlePriceJpy: positivePrice(formString(form, "bundlePriceJpy"), 980),
      isSample: outputKind === "sample-pdf" || outputKind === "sample-image",
      mimeType: file.type as PdfAsset["mimeType"],
      storagePath,
      storageProvider,
      fileName: file.name,
      sizeBytes: file.size,
      createdAt: new Date().toISOString(),
    };

    let replaced: PdfAsset | undefined;
    try {
      replaced = await upsertPdfAsset(asset);
    } catch (error) {
      await removePdfAssetFile(storagePath, storageProvider).catch(() => null);
      throw error;
    }
    if (replaced) {
      await removePdfAssetFile(replaced.storagePath, replaced.storageProvider ?? "supabase").catch(() => null);
    }
    return NextResponse.json({ ok: true, asset, replaced: Boolean(replaced) });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "教材を保存できませんでした。" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  if (!isSupabaseServerConfigured()) return supabaseServerConfigResponse();
  try {
    const id = String((await request.json().catch(() => ({})))?.id ?? "");
    const catalog = await readPdfAssetCatalog();
    const target = catalog.find((asset) => asset.id === id);
    if (!target) return NextResponse.json({ ok: false, message: "教材が見つかりません。" }, { status: 404 });
    await removePdfAssetFile(target.storagePath, target.storageProvider ?? "supabase");
    await deletePdfAsset(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "教材を削除できませんでした。" }, { status: 500 });
  }
}
