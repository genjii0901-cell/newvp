import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import {
  PDF_ASSET_BUCKET,
  createPdfAssetSignedUrl,
  ensurePdfAssetBucket,
  readPdfAssetCatalog,
  writePdfAssetCatalog,
  type PdfAsset,
} from "@/lib/pdf-assets";
import { getSupabaseAdmin, isSupabaseServerConfigured, supabaseServerConfigResponse } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  if (!isSupabaseServerConfigured()) return supabaseServerConfigResponse();
  try {
    const assets = await readPdfAssetCatalog();
    const withUrls = await Promise.all(assets.map(async (asset) => ({
      ...asset,
      downloadUrl: await createPdfAssetSignedUrl(asset.storagePath).catch(() => null),
    })));
    return NextResponse.json({ ok: true, assets: withUrls }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "PDF教材を読み込めませんでした。" }, { status: 500 });
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
      return NextResponse.json({ ok: false, message: "PDFファイルが見つかりません。" }, { status: 400 });
    }
    if (file.size <= 0 || file.size > 30 * 1024 * 1024) {
      return NextResponse.json({ ok: false, message: "PDFは30MB以下にしてください。" }, { status: 400 });
    }
    const header = new Uint8Array((await file.slice(0, 5).arrayBuffer()));
    if (new TextDecoder().decode(header) !== "%PDF-") {
      return NextResponse.json({ ok: false, message: "正しいPDFファイルを選択してください。" }, { status: 400 });
    }

    await ensurePdfAssetBucket();
    const id = randomUUID();
    const storagePath = `materials/${id}.pdf`;
    const supabase = getSupabaseAdmin();
    const { error: uploadError } = await supabase.storage
      .from(PDF_ASSET_BUCKET)
      .upload(storagePath, await file.arrayBuffer(), { contentType: "application/pdf", upsert: false });
    if (uploadError) throw uploadError;

    const title = String(form.get("title") ?? "").trim() || file.name.replace(/\.pdf$/i, "");
    const asset: PdfAsset = {
      id,
      title,
      description: String(form.get("description") ?? "").trim(),
      wordbookId: String(form.get("wordbookId") ?? "").trim() || null,
      wordbookTitle: String(form.get("wordbookTitle") ?? "").trim() || null,
      kind: form.get("kind") === "generated" ? "generated" : "uploaded",
      visibility: form.get("visibility") === "admin" ? "admin" : "public",
      storagePath,
      fileName: file.name,
      sizeBytes: file.size,
      createdAt: new Date().toISOString(),
    };
    try {
      const catalog = await readPdfAssetCatalog();
      await writePdfAssetCatalog([asset, ...catalog]);
    } catch (error) {
      await supabase.storage.from(PDF_ASSET_BUCKET).remove([storagePath]);
      throw error;
    }
    return NextResponse.json({ ok: true, asset });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "PDF教材を保存できませんでした。" }, { status: 500 });
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
    if (!target) return NextResponse.json({ ok: false, message: "PDF教材が見つかりません。" }, { status: 404 });
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.storage.from(PDF_ASSET_BUCKET).remove([target.storagePath]);
    if (error) throw error;
    await writePdfAssetCatalog(catalog.filter((asset) => asset.id !== id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "PDF教材を削除できませんでした。" }, { status: 500 });
  }
}

