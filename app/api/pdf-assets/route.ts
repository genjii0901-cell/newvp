import { NextResponse } from "next/server";
import { readPdfAssetGroupCatalog, readPdfAssetsByWordbookId, type PdfAsset } from "@/lib/pdf-assets";
import { isSupabaseServerConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type PublicAsset = Omit<PdfAsset, "storagePath" | "storageProvider"> & {
  locked: boolean;
  downloadUrl: string | null;
};

function toPublicAsset(asset: PdfAsset): PublicAsset {
  const { storagePath: _storagePath, storageProvider: _storageProvider, ...publicAsset } = asset;
  void _storagePath;
  void _storageProvider;
  return {
    ...publicAsset,
    locked: asset.visibility === "sale",
    downloadUrl: asset.visibility === "public" ? `/api/pdf-assets/${asset.id}` : null,
  };
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function buildGroups(assets: PdfAsset[]) {
  const groups = new Map<string, {
    id: string;
    wordbookId: string | null;
    title: string;
    description: string;
    saleCount: number;
    sampleCount: number;
    variantCount: number;
    bundlePriceJpy: number;
    fromPriceJpy: number;
    sampleImageUrl: string | null;
  }>();
  const variants = new Map<string, Set<string>>();

  for (const asset of assets) {
    if (asset.visibility !== "public" && asset.visibility !== "sale") continue;
    const id = asset.wordbookId || `asset:${asset.id}`;
    const group = groups.get(id) ?? {
      id,
      wordbookId: asset.wordbookId,
      title: asset.wordbookTitle || asset.title,
      description: asset.description || "",
      saleCount: 0,
      sampleCount: 0,
      variantCount: 0,
      bundlePriceJpy: asset.bundlePriceJpy ?? 980,
      fromPriceJpy: asset.priceJpy ?? 500,
      sampleImageUrl: null,
    };
    if (!group.description && asset.description) group.description = asset.description;
    if (asset.visibility === "sale") {
      group.saleCount += 1;
      group.fromPriceJpy = Math.min(group.fromPriceJpy, asset.priceJpy ?? 500);
      group.bundlePriceJpy = asset.bundlePriceJpy ?? group.bundlePriceJpy;
    } else {
      group.sampleCount += 1;
    }
    if (!group.sampleImageUrl && asset.visibility === "public" && asset.outputKind === "sample-image") {
      group.sampleImageUrl = `/api/pdf-assets/${asset.id}`;
    }
    const groupVariants = variants.get(id) ?? new Set<string>();
    groupVariants.add(asset.variant || asset.id);
    variants.set(id, groupVariants);
    groups.set(id, group);
  }

  return [...groups.values()]
    .map((group) => ({ ...group, variantCount: variants.get(group.id)?.size ?? 0 }))
    .sort((a, b) => a.title.localeCompare(b.title, "ja"));
}

export async function GET(request: Request) {
  if (!isSupabaseServerConfigured()) return NextResponse.json({ ok: true, groups: [], assets: [] });
  try {
    const url = new URL(request.url);
    const wordbookId = url.searchParams.get("wordbookId")?.trim() || "";
    const format = url.searchParams.get("format")?.toLowerCase();

    if (wordbookId) {
      const assets = (await readPdfAssetsByWordbookId(wordbookId))
        .filter((asset) => asset.visibility === "public" || asset.visibility === "sale");
      const group = buildGroups(assets)[0] ?? null;
      if (format === "csv") {
        const rows = [
          ["wordbook", "variant", "title", "type", "price_jpy", "sample_url"],
          ...assets.map((asset) => [
            asset.wordbookTitle || "",
            asset.variant || "",
            asset.title,
            asset.outputKind || "",
            asset.visibility === "sale" ? asset.priceJpy ?? 500 : 0,
            asset.visibility === "public" ? `${url.origin}/api/pdf-assets/${asset.id}` : "",
          ]),
        ];
        return new NextResponse(rows.map((row) => row.map(csvCell).join(",")).join("\r\n"), {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="vocabprint-${wordbookId}.csv"`,
          },
        });
      }
      return NextResponse.json({ ok: true, group, assets: assets.map(toPublicAsset) }, {
        headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
      });
    }

    const groups = buildGroups(await readPdfAssetGroupCatalog());
    if (format === "csv") {
      const rows = [
        ["wordbook_id", "wordbook", "formats", "full_pdf", "samples", "bundle_price_jpy", "detail_api"],
        ...groups.map((group) => [
          group.wordbookId || "",
          group.title,
          group.variantCount,
          group.saleCount,
          group.sampleCount,
          group.bundlePriceJpy,
          group.wordbookId ? `${url.origin}/api/pdf-assets?wordbookId=${encodeURIComponent(group.wordbookId)}` : "",
        ]),
      ];
      return new NextResponse(rows.map((row) => row.map(csvCell).join(",")).join("\r\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="vocabprint-materials.csv"',
        },
      });
    }
    return NextResponse.json({ ok: true, groups }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      groups: [],
      assets: [],
      message: error instanceof Error ? error.message : "教材を読み込めませんでした。",
    }, { status: 500 });
  }
}
