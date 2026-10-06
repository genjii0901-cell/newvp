import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServerConfigured } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  if (!isSupabaseServerConfigured()) return NextResponse.json({ ok: true, skipped: true });
  const body = await request.json().catch(() => ({}));
  const { event, variant, visitorId } = body;
  if ((event !== "view" && event !== "checkout") ||
      (variant !== "choice" && variant !== "personal") ||
      typeof visitorId !== "string" || !/^[0-9a-f-]{36}$/i.test(visitorId)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const key = `pricing_exp:v1:${event}:${visitorId}`;
  const { error } = await getSupabaseAdmin().from("app_settings").upsert(
    { key, value: variant },
    { onConflict: "key", ignoreDuplicates: true },
  );
  if (error) return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: true });
}
