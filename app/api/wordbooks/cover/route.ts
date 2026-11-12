import { NextResponse } from "next/server";
import { loadCachedCoverImage } from "@/lib/cached-wordbooks";

export const revalidate = 86400;

function dataImageResponse(value: string) {
  const match = value.match(/^data:(image\/(?:png|jpe?g|webp|gif));base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return null;

  return new NextResponse(Buffer.from(match[2].replace(/\s/g, ""), "base64"), {
    headers: {
      "Content-Type": match[1],
      "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
    },
  });
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return new NextResponse("Not found", {
      status: 404,
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
    });
  }

  // 表紙1枚のためにDBへ毎回取りに行かないよう、1日キャッシュする（Supabaseの通信量対策）。
  const coverImage = await loadCachedCoverImage(id).catch(() => null);
  if (!coverImage) {
    return new NextResponse("Not found", {
      status: 404,
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
    });
  }

  const dataResponse = dataImageResponse(coverImage);
  if (dataResponse) return dataResponse;
  return NextResponse.redirect(coverImage, 307);
}
