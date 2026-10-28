import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin, requireSupabaseUser } from "@/lib/supabase/admin";

const mimeTypes = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;

function validImage(bytes: Buffer, kind: keyof typeof mimeTypes) {
  if (kind === "jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (kind === "png") return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
}

export async function POST(request: Request) {
  const auth = await requireSupabaseUser(request);
  if (auth.response) return auth.response;
  try {
    const body = await request.json() as { dataUrl?: unknown };
    const value = typeof body.dataUrl === "string" ? body.dataUrl : "";
    const match = value.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!match || match[2].length > 1_400_000) return NextResponse.json({ ok: false, message: "JPEG・PNG・WebPの1MB以下の画像を選んでください。" }, { status: 400 });
    const kind = match[1] as keyof typeof mimeTypes;
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.length > 1_000_000 || !validImage(bytes, kind)) return NextResponse.json({ ok: false, message: "画像形式またはサイズを確認してください。" }, { status: 400 });
    const path = `community/${auth.user.id}/${randomUUID()}.${kind === "jpeg" ? "jpg" : kind}`;
    const supabase = getSupabaseAdmin();
    const result = await supabase.storage.from("wordbook-images").upload(path, bytes, { contentType: mimeTypes[kind], upsert: false });
    if (result.error) throw result.error;
    const url = supabase.storage.from("wordbook-images").getPublicUrl(path).data.publicUrl;
    return NextResponse.json({ ok: true, url });
  } catch {
    return NextResponse.json({ ok: false, message: "画像をアップロードできませんでした。後でもう一度お試しください。" }, { status: 503 });
  }
}
