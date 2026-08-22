import { NextResponse } from "next/server";
import { canAccessMaterial, isMaterialPurchaseSchemaError } from "@/lib/material-purchases";
import { createPdfAssetSignedUrl, readPdfAssetCatalog } from "@/lib/pdf-assets";
import { readableError, requireSupabaseUser } from "@/lib/supabase/admin";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireSupabaseUser(request);
  if (auth.response) return auth.response;
  try {
    const { id } = await context.params;
    const asset = (await readPdfAssetCatalog()).find((item) => item.id === id);
    if (!asset) return NextResponse.json({ ok: false, message: "教材が見つかりません。" }, { status: 404 });
    if (asset.visibility === "public") return NextResponse.json({ ok: true, url: await createPdfAssetSignedUrl(asset.storagePath, 180) });
    if (asset.visibility !== "sale" || !(await canAccessMaterial(auth.user.id, asset.id, asset.wordbookId))) {
      return NextResponse.json({ ok: false, message: "この教材の購入が必要です。" }, { status: 403 });
    }
    return NextResponse.json({ ok: true, url: await createPdfAssetSignedUrl(asset.storagePath, 180) });
  } catch (error) {
    const message = isMaterialPurchaseSchemaError(error) ? "教材購入機能の準備が完了していません。" : readableError(error);
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
