import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { loadOfficialWordbooks } from "@/lib/server-wordbooks";
import { isSupabaseServerConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;
  const includeWords = new URL(request.url).searchParams.get("includeWords") === "1";

  if (!isSupabaseServerConfigured()) {
    const fallback = await loadOfficialWordbooks({ includeAdmin: true, includeFallback: true, dedupeByTitle: true, includeWords }).catch(() => ({
      wordbooks: [],
    }));
    return NextResponse.json({
      ok: false,
      supabaseConfigured: false,
      wordbooks: fallback.wordbooks ?? [],
      message:
        "Supabase server environment variables are not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel.",
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  }

  try {
    const result = await loadOfficialWordbooks({ includeAdmin: true, includeFallback: true, dedupeByTitle: true, includeWords });
    return NextResponse.json({
      ok: result.ok,
      supabaseConfigured: true,
      wordbooks: result.wordbooks,
      ...(result.error ? { message: result.error } : {}),
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      supabaseConfigured: true,
      wordbooks: [],
      message: error instanceof Error ? error.message : "Unknown error",
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
