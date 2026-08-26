import { NextResponse } from "next/server";
import { createPdfAssetSignedUrl, readPdfAssetById } from "@/lib/pdf-assets";
import { isSupabaseServerConfigured } from "@/lib/supabase/admin";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isSupabaseServerConfigured()) return NextResponse.json({ ok: false, message: "教材は準備中です。" }, { status: 503 });
  const { id } = await context.params;
  const asset = await readPdfAssetById(id);
  if (asset?.visibility !== "public") return NextResponse.json({ ok: false, message: "教材が見つかりません。" }, { status: 404 });
  const url = await createPdfAssetSignedUrl(asset.storagePath, 120, asset.storageProvider ?? "supabase");
  return NextResponse.redirect(url, { status: 302 });
}
