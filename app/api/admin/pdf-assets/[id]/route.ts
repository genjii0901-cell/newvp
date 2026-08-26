import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createPdfAssetSignedUrl, readPdfAssetCatalog } from "@/lib/pdf-assets";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const { id } = await context.params;
  const asset = (await readPdfAssetCatalog()).find((item) => item.id === id);
  if (!asset) {
    return NextResponse.json({ ok: false, message: "教材が見つかりません。" }, { status: 404 });
  }

  const url = await createPdfAssetSignedUrl(asset.storagePath, 300, asset.storageProvider ?? "supabase");
  return NextResponse.redirect(url, { status: 302 });
}
