import { NextResponse } from "next/server";
import {
  getSupabaseAdmin,
  readableError,
  requireSupabaseUser,
  tryEnsureProfile,
} from "@/lib/supabase/admin";

type CheckoutPlan = "personal" | "teacher";

function isCheckoutPlan(value: unknown): value is CheckoutPlan {
  return value === "personal" || value === "teacher";
}

function getPriceId(plan: CheckoutPlan) {
  if (plan === "personal") {
    return process.env.STRIPE_PRICE_PERSONAL ?? process.env.NEXT_PUBLIC_STRIPE_PRICE_PERSONAL;
  }

  return process.env.STRIPE_PRICE_TEACHER ?? process.env.NEXT_PUBLIC_STRIPE_PRICE_TEACHER;
}

export async function POST(request: Request) {
  try {
    const auth = await requireSupabaseUser(request);
    if (auth.response) return auth.response;

    const { plan } = (await request.json()) as { plan?: unknown };
    if (!isCheckoutPlan(plan)) {
      return NextResponse.json({ ok: false, error: "Invalid plan." }, { status: 400 });
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
    const priceId = getPriceId(plan);

    if (!stripeSecretKey || !priceId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Stripe設定が未完了です。Vercelまたは.env.localに STRIPE_SECRET_KEY / STRIPE_PRICE_PERSONAL / STRIPE_PRICE_TEACHER を設定してください。",
        },
        { status: 500 }
      );
    }

    if (!priceId.startsWith("price_")) {
      return NextResponse.json(
        {
          ok: false,
          error: "Stripeの価格IDが正しくありません。商品IDではなく price_ で始まる価格IDを設定してください。",
        },
        { status: 400 }
      );
    }

    const profile = await tryEnsureProfile(auth.user);
    const body = new URLSearchParams({
      mode: "subscription",
      success_url: `${appUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/pricing?checkout=cancel`,
      client_reference_id: auth.user.id,
    });

    body.append("payment_method_types[]", "card");
    body.append("line_items[0][price]", priceId);
    body.append("line_items[0][quantity]", "1");
    body.append("metadata[user_id]", auth.user.id);
    body.append("metadata[plan]", plan);
    body.append("subscription_data[metadata][user_id]", auth.user.id);
    body.append("subscription_data[metadata][plan]", plan);

    if (profile?.stripe_customer_id) {
      body.append("customer", profile.stripe_customer_id);
    } else if (auth.user.email) {
      body.append("customer_email", auth.user.email);
    }

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("Stripe checkout session failed", data.error?.message ?? data);
      return NextResponse.json(
        { ok: false, error: data.error?.message ?? "Failed to create checkout session." },
        { status: response.status }
      );
    }

    try {
      const supabase = getSupabaseAdmin();
      await supabase.from("profiles").upsert(
        {
          id: auth.user.id,
          email: auth.user.email ?? null,
          stripe_customer_id:
            typeof data.customer === "string" ? data.customer : profile?.stripe_customer_id ?? null,
        },
        { onConflict: "id" }
      );
    } catch (error) {
      console.error("Checkout profile update failed", readableError(error));
    }

    return NextResponse.json({ ok: true, url: data.url });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: readableError(error) },
      { status: 500 }
    );
  }
}
