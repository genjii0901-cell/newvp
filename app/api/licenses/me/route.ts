import { NextResponse } from "next/server";
import { getLicenseEntitlements, isLicenseSchemaError } from "@/lib/licenses";
import { requireSupabaseUser } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSupabaseUser(request);
  if (auth.response) return auth.response;

  try {
    const entitlements = await getLicenseEntitlements(auth.user.id);
    return NextResponse.json({ ok: true, entitlements });
  } catch (error) {
    if (isLicenseSchemaError(error)) {
      return NextResponse.json({ ok: true, configured: false, entitlements: [] });
    }
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "ライセンス情報を取得できませんでした。" }, { status: 500 });
  }
}
