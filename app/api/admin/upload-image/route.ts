import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServerConfigured } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-auth";

export async function POST(request: Request) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;

  if (!isSupabaseServerConfigured()) {
    return NextResponse.json({ ok: false, message: "Supabase未設定のためアップロードできません。画像URLを直接入力してください。" }, { status: 503 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ ok: false, message: "ファイルが見つかりません。" }, { status: 400 });

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const allowed = ["jpg", "jpeg", "png", "webp", "gif", "avif"];
    if (!allowed.includes(ext)) {
      return NextResponse.json({ ok: false, message: `対応形式: ${allowed.join(", ")}` }, { status: 400 });
    }
    // 拡張子だけでなくMIMEタイプも画像であることを確認（偽装アップロード対策）
    if (file.type && !file.type.startsWith("image/")) {
      return NextResponse.json({ ok: false, message: "画像ファイルのみアップロードできます。" }, { status: 400 });
    }

    const maxMb = 5;
    if (file.size > maxMb * 1024 * 1024) {
      return NextResponse.json({ ok: false, message: `ファイルサイズは${maxMb}MB以下にしてください。` }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const path = `covers/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const bytes = await file.arrayBuffer();

    const { data, error } = await supabase.storage
      .from("wordbook-images")
      .upload(path, bytes, { contentType: file.type, upsert: false });

    if (error) {
      // バケットが存在しない場合のわかりやすいメッセージ
      if (error.message.includes("Bucket not found") || error.message.includes("bucket")) {
        return NextResponse.json({
          ok: false,
          message: 'Supabase Storageに「wordbook-images」バケットを作成してください（Public設定）。',
        }, { status: 503 });
      }
      return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from("wordbook-images").getPublicUrl(data.path);
    return NextResponse.json({ ok: true, url: urlData.publicUrl });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
