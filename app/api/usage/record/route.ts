import { NextResponse } from "next/server";
import {
  getSupabaseAdmin,
  isSupabaseServerConfigured,
  requireSupabaseUser,
  supabaseServerConfigResponse,
} from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const auth = await requireSupabaseUser(request);
  if (auth.response) return auth.response;

  if (!isSupabaseServerConfigured()) {
    return supabaseServerConfigResponse();
  }

  try {
    const body = await request.json().catch(() => ({}));
    const type = typeof body.type === "string" ? body.type : "pdf";
    const wordCount = Number(body.wordCount ?? 0);
    // 公式単語帳は整数ID、マイ単語帳はUUID。どちらも記録できるよう文字列としてそのまま保存する。
    const rawWordbookId =
      typeof body.wordbookId === "string" || typeof body.wordbookId === "number"
        ? String(body.wordbookId).trim()
        : "";
    const wordbookId = rawWordbookId && rawWordbookId.length <= 64 ? rawWordbookId : null;

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("pdf_generations").insert({
      user_id: auth.user.id,
      wordbook_id: wordbookId,
      type,
      word_count: wordCount,
    });

    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
