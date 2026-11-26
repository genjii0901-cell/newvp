import { NextResponse } from "next/server";
import { isPersonalEmailOfferEligible } from "@/lib/personal-email-offer";
import { requireSupabaseUser, tryEnsureProfile } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const auth = await requireSupabaseUser(request);
  if (auth.response) return auth.response;

  const { offer } = await request.json().catch(() => ({}));
  const profile = await tryEnsureProfile(auth.user);
  if (!profile) return NextResponse.json({ eligible: false }, { status: 503 });
  return NextResponse.json({ eligible: isPersonalEmailOfferEligible(offer, auth.user, profile) });
}
