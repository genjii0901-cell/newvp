import { NextResponse } from "next/server";
import { getMaterialPurchases, isMaterialPurchaseSchemaError } from "@/lib/material-purchases";
import { readableError, requireSupabaseUser } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const auth = await requireSupabaseUser(request);
  if (auth.response) return auth.response;
  try {
    return NextResponse.json({ ok: true, configured: true, purchases: await getMaterialPurchases(auth.user.id) });
  } catch (error) {
    if (isMaterialPurchaseSchemaError(error)) return NextResponse.json({ ok: true, configured: false, purchases: [] });
    return NextResponse.json({ ok: false, message: readableError(error) }, { status: 500 });
  }
}

