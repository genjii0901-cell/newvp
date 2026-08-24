import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import {
  createPdfAssetUploadUrl,
  inspectR2PdfAsset,
  preferredPdfAssetStorageProvider,
  removePdfAssetFile,
  upsertPdfAsset,
  type PdfAsset,
} from "@/lib/pdf-assets";
import { isSupabaseServerConfigured, supabaseServerConfigResponse } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
};

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function positivePrice(value: unknown, fallback: number | null) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function POST(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  if (!isSupabaseServerConfigured()) return supabaseServerConfigResponse();
  if (preferredPdfAssetStorageProvider() !== "r2") {
    return NextResponse.json({ ok: false, message: "Cloudflare R2が設定されていません。" }, { status: 503 });
  }

  try {
    const body = await request.json();
    if (body?.action === "prepare") {
      const mimeType = stringValue(body.mimeType);
      const sizeBytes = Number(body.sizeBytes);
      const extension = EXTENSIONS[mimeType];
      if (!extension) return NextResponse.json({ ok: false, message: "PDF、PNG、JPEGのみ登録できます。" }, { status: 400 });
      if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_FILE_SIZE) {
        return NextResponse.json({ ok: false, message: "ファイルは100MB以下にしてください。" }, { status: 400 });
      }
      const id = randomUUID();
      const storagePath = `materials/${id}.${extension}`;
      const uploadUrl = await createPdfAssetUploadUrl(storagePath, mimeType);
      return NextResponse.json({ ok: true, id, storagePath, uploadUrl });
    }

    if (body?.action !== "finalize") {
      return NextResponse.json({ ok: false, message: "操作を確認できませんでした。" }, { status: 400 });
    }

    const id = stringValue(body.id);
    const storagePath = stringValue(body.storagePath);
    const mimeType = stringValue(body.mimeType) as PdfAsset["mimeType"];
    const expectedExtension = EXTENSIONS[mimeType ?? ""];
    if (!/^[0-9a-f-]{36}$/i.test(id) || !expectedExtension || storagePath !== `materials/${id}.${expectedExtension}`) {
      return NextResponse.json({ ok: false, message: "保存先情報が正しくありません。" }, { status: 400 });
    }

    const stored = await inspectR2PdfAsset(storagePath);
    if (stored.sizeBytes <= 0 || stored.sizeBytes > MAX_FILE_SIZE || stored.contentType !== mimeType) {
      await removePdfAssetFile(storagePath, "r2").catch(() => null);
      return NextResponse.json({ ok: false, message: "アップロードしたファイルを確認できませんでした。" }, { status: 400 });
    }

    const visibilityValue = stringValue(body.visibility);
    const visibility: PdfAsset["visibility"] = visibilityValue === "admin" || visibilityValue === "sale" ? visibilityValue : "public";
    const outputValue = stringValue(body.outputKind);
    const outputKind: PdfAsset["outputKind"] = outputValue === "full-pdf" || outputValue === "sample-pdf" || outputValue === "sample-image"
      ? outputValue
      : "uploaded";
    const asset: PdfAsset = {
      id,
      title: stringValue(body.title) || "PDF教材",
      description: stringValue(body.description),
      wordbookId: stringValue(body.wordbookId) || null,
      wordbookTitle: stringValue(body.wordbookTitle) || null,
      kind: stringValue(body.kind) === "uploaded" ? "uploaded" : "generated",
      visibility,
      assetKey: stringValue(body.assetKey) || null,
      variant: stringValue(body.variant) || null,
      outputKind,
      priceJpy: visibility === "sale" ? positivePrice(body.priceJpy, 500) : null,
      bundlePriceJpy: positivePrice(body.bundlePriceJpy, 980),
      isSample: outputKind === "sample-pdf" || outputKind === "sample-image",
      mimeType,
      storagePath,
      storageProvider: "r2",
      fileName: stringValue(body.fileName) || `material.${expectedExtension}`,
      sizeBytes: stored.sizeBytes,
      createdAt: new Date().toISOString(),
    };

    let replaced: PdfAsset | undefined;
    try {
      replaced = await upsertPdfAsset(asset);
    } catch (error) {
      await removePdfAssetFile(storagePath, "r2").catch(() => null);
      throw error;
    }
    if (replaced) await removePdfAssetFile(replaced.storagePath, replaced.storageProvider ?? "supabase").catch(() => null);
    return NextResponse.json({ ok: true, asset, replaced: Boolean(replaced) });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "教材を保存できませんでした。" }, { status: 500 });
  }
}
