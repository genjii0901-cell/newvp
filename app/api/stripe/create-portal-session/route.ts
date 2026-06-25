import { NextResponse } from "next/server";
import { ensureProfile, readableError, requireSupabaseUser } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const auth = await requireSupabaseUser(request);
    if (auth.response) return auth.response;

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    if (!stripeSecretKey) {
      return NextResponse.json(
        { ok: false, error: "STRIPE_SECRET_KEY is not configured." },
        { status: 500 }
      );
    }

    const profile = await ensureProfile(auth.user);
    if (!profile?.stripe_customer_id) {
      return NextResponse.json(
        { ok: false, error: "No Stripe customer is linked to this account yet." },
        { status: 400 }
      );
    }

    const body = new URLSearchParams({
      customer: profile.stripe_customer_id,
      return_url: `${appUrl}/pricing`,
    });

    const response = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json(
        { ok: false, error: data.error?.message ?? "Failed to create billing portal session." },
        { status: response.status }
      );
    }

    return NextResponse.json({ ok: true, url: data.url });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: readableError(error) },
      { status: 500 }
    );
  }
}
