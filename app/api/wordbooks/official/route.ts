import { NextResponse } from "next/server";
import { fallbackOfficialWordbooksForApi } from "@/lib/official-wordbooks";
import { loadOfficialWordbooks } from "@/lib/server-wordbooks";
import { isSupabaseServerConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function fallbackResponse(message?: string) {
  return NextResponse.json({
    ok: true,
    wordbooks: fallbackOfficialWordbooksForApi(),
    ...(message ? { message } : {}),
  });
}

export async function GET() {
  if (!isSupabaseServerConfigured()) {
    return fallbackResponse();
  }

  try {
    const result = await loadOfficialWordbooks();
    if (!result.ok || result.wordbooks.length === 0) {
      return fallbackResponse(result.error ?? undefined);
    }

    return NextResponse.json({
      ok: true,
      wordbooks: result.wordbooks,
    });
  } catch (error) {
    return fallbackResponse(error instanceof Error ? error.message : "Unknown error");
  }
}
