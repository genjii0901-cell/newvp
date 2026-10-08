import { NextResponse } from "next/server";
import { hasPaidMobileAccess } from "@/lib/mobile-paid-access";
import { requireSupabaseUser } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const auth = await requireSupabaseUser(request);
  if (auth.response) return auth.response;
  try {
    const paid = await hasPaidMobileAccess(auth.user);
    return NextResponse.json({ ok: true, paid }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ ok: false, message: "購入状態を確認できませんでした。もう一度お試しください。" }, { status: 503 });
  }
}
