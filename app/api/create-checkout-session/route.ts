import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "Use /api/stripe/create-checkout-session with a Supabase bearer token.",
    },
    { status: 410 }
  );
}
