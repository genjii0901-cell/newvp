import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { loadOfficialWordbooks } from "@/lib/server-wordbooks";
import { isSupabaseServerConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;

  if (!isSupabaseServerConfigured()) {
    const fallback = await loadOfficialWordbooks({ includeAdmin: true, includeFallback: false, dedupeByTitle: false }).catch(() => ({
      wordbooks: [],
    }));
    return NextResponse.json({
      ok: false,
      supabaseConfigured: false,
      wordbooks: fallback.wordbooks ?? [],
      message:
        "Supabase server environment variables are not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel.",
    });
  }

  try {
    const result = await loadOfficialWordbooks({ includeAdmin: true, includeFallback: false, dedupeByTitle: false });
    return NextResponse.json({
      ok: result.ok,
      supabaseConfigured: true,
      wordbooks: result.wordbooks,
      ...(result.error ? { message: result.error } : {}),
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      supabaseConfigured: true,
      wordbooks: [],
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
