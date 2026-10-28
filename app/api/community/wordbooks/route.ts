import { NextResponse } from "next/server";
import { defaultCreatorName, loadCommunityWordbooks } from "@/lib/community-wordbooks";
import { normalizeCommunitySubject } from "@/lib/community-wordbook-types";
import { getSupabaseAdmin, isSupabaseServerConfigured, requireSupabaseUser } from "@/lib/supabase/admin";
import { embedWordbookMeta, parseEmbeddedWordbookMeta, stripEmbeddedWordbookMeta } from "@/lib/wordbook-meta";
import { communitySamples } from "@/data/community-samples";

export const dynamic = "force-dynamic";

function validId(value: unknown) {
  return typeof value === "string" && (/^\d+$/.test(value) || /^[0-9a-f-]{36}$/i.test(value));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id") || undefined;
  if (id && !validId(id) && !communitySamples.some((book) => book.id === id)) return NextResponse.json({ ok: false, message: "単語帳が見つかりません。" }, { status: 404 });
  if (!isSupabaseServerConfigured()) {
    const books = communitySamples.filter((book) => !id || book.id === id).map((book) => ({ ...book, words: url.searchParams.get("includeWords") === "1" ? book.words : [] }));
    return NextResponse.json({ ok: true, wordbooks: books });
  }
  try {
    const books = await loadCommunityWordbooks({
      id,
      includeWords: url.searchParams.get("includeWords") === "1",
      page: Number(url.searchParams.get("page") || 0),
    });
    return NextResponse.json({ ok: true, wordbooks: books }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, message: "共有単語帳を読み込めませんでした。" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const auth = await requireSupabaseUser(request);
  if (auth.response) return auth.response;
  try {
    const body = await request.json() as Record<string, unknown>;
    const id = body.id;
    if (!validId(id)) return NextResponse.json({ ok: false, message: "保存済みの単語帳を選んでください。" }, { status: 400 });
    if (body.originalWork !== true) return NextResponse.json({ ok: false, message: "自分で作った内容であることを確認してください。" }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { data: book, error } = await supabase.from("wordbooks")
      .select("id,title,description,cover_image,visibility")
      .eq("id", id).eq("owner_id", auth.user.id).eq("is_official", false).maybeSingle();
    if (error) throw error;
    if (!book) return NextResponse.json({ ok: false, message: "自分の単語帳が見つかりません。" }, { status: 404 });
    const cleanDescription = stripEmbeddedWordbookMeta(book.description);
    if (!book.title?.trim() || book.title.length > 100 || cleanDescription.length > 500) {
      return NextResponse.json({ ok: false, message: "タイトルは100文字以内、説明は500文字以内にしてください。" }, { status: 400 });
    }
    if (cleanDescription.includes("をみんなの単語帳から追加しました")) {
      return NextResponse.json({ ok: false, message: "既存教材をコピーした単語帳は公開できません。自作の内容を登録してください。" }, { status: 400 });
    }
    if (book.visibility !== "public") {
      const { count: publicCount, error: limitError } = await supabase.from("wordbooks")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", auth.user.id).eq("is_official", false).eq("visibility", "public");
      if (limitError) throw limitError;
      if ((publicCount ?? 0) >= 20) return NextResponse.json({ ok: false, message: "公開できる単語帳は20冊までです。不要な公開を停止してから再度お試しください。" }, { status: 429 });
    }
    const { count, error: countError } = await supabase.from("words").select("id", { count: "exact", head: true }).eq("wordbook_id", id);
    if (countError) throw countError;
    if (!count || count < 3 || count > 5000) return NextResponse.json({ ok: false, message: "公開には3語以上、5000語以下の単語が必要です。" }, { status: 400 });

    const subject = normalizeCommunitySubject(body.subject);
    const anonymous = body.anonymous === true;
    const creatorName = anonymous ? "匿名" : typeof body.creatorName === "string" && body.creatorName.trim()
      ? body.creatorName.trim().slice(0, 30) : defaultCreatorName(auth.user.id);
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") || "";
    const allowedCoverPrefix = `${baseUrl}/storage/v1/object/public/wordbook-images/community/${auth.user.id}/`;
    const requestedCover = typeof body.coverImage === "string" ? body.coverImage : "";
    if (requestedCover && !requestedCover.startsWith(allowedCoverPrefix)) {
      return NextResponse.json({ ok: false, message: "この画像は公開用に登録できません。画像をアップロードし直してください。" }, { status: 400 });
    }
    const existingMeta = parseEmbeddedWordbookMeta(book.description);
    const coverImage = requestedCover || (existingMeta.coverImage?.startsWith(allowedCoverPrefix) ? existingMeta.coverImage : "");
    const description = embedWordbookMeta(cleanDescription.slice(0, 500), {
      visibility: "public", subject, creatorName, anonymous, coverImage,
    });
    const updated = await supabase.from("wordbooks")
      .update({ visibility: "public", description, cover_image: coverImage || null })
      .eq("id", id).eq("owner_id", auth.user.id).eq("is_official", false).select("id").single();
    if (updated.error) throw updated.error;
    return NextResponse.json({ ok: true, id: String(id) });
  } catch {
    return NextResponse.json({ ok: false, message: "公開できませんでした。時間をおいて再試行してください。" }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireSupabaseUser(request);
  if (auth.response) return auth.response;
  try {
    const body = await request.json() as { id?: unknown };
    if (!validId(body.id)) return NextResponse.json({ ok: false, message: "単語帳を選んでください。" }, { status: 400 });
    const supabase = getSupabaseAdmin();
    const { data: book, error } = await supabase.from("wordbooks")
      .select("id,description").eq("id", body.id).eq("owner_id", auth.user.id).eq("is_official", false).maybeSingle();
    if (error) throw error;
    if (!book) return NextResponse.json({ ok: false, message: "単語帳が見つかりません。" }, { status: 404 });
    const description = embedWordbookMeta(stripEmbeddedWordbookMeta(book.description), { ...parseEmbeddedWordbookMeta(book.description), visibility: "private" });
    const updated = await supabase.from("wordbooks").update({ visibility: "private", description })
      .eq("id", body.id).eq("owner_id", auth.user.id).eq("is_official", false);
    if (updated.error) throw updated.error;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, message: "公開を停止できませんでした。" }, { status: 503 });
  }
}
