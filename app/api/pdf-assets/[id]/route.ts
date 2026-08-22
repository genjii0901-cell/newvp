import { NextResponse } from "next/server";
import { createPdfAssetSignedUrl, readPdfAssetCatalog } from "@/lib/pdf-assets";
import { isSupabaseServerConfigured } from "@/lib/supabase/admin";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isSupabaseServerConfigured()) return NextResponse.json({ ok: false, message: "PDF教材は準備中です。" }, { status: 503 });
  const { id } = await context.params;
  const asset = (await readPdfAssetCatalog()).find((item) => item.id === id && item.visibility === "public");
  if (!asset) return NextResponse.json({ ok: false, message: "PDF教材が見つかりません。" }, { status: 404 });
  const url = await createPdfAssetSignedUrl(asset.storagePath, 120);
  return NextResponse.redirect(url, { status: 302 });
}

