import { NextResponse } from "next/server";
import {
  getSupabaseAdmin,
  isSupabaseServerConfigured,
  requireSupabaseUser,
  supabaseServerConfigResponse,
} from "@/lib/supabase/admin";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

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
    const wordbookId =
      typeof body.wordbookId === "string" && isUuid(body.wordbookId) ? body.wordbookId : null;

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
