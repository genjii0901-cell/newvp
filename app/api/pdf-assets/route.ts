import { NextResponse } from "next/server";
import { readPdfAssetCatalog } from "@/lib/pdf-assets";
import { isSupabaseServerConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseServerConfigured()) return NextResponse.json({ ok: true, assets: [] });
  try {
    const assets = (await readPdfAssetCatalog())
      .filter((asset) => asset.visibility === "public")
      .map(({ storagePath: _storagePath, ...asset }) => ({ ...asset, downloadUrl: `/api/pdf-assets/${asset.id}` }));
    return NextResponse.json({ ok: true, assets }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: true, assets: [] });
  }
}
