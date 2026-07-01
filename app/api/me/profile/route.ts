import { NextResponse } from "next/server";
import { ensureProfile, getSupabaseAdmin, readableError, requireSupabaseUser } from "@/lib/supabase/admin";

type Plan = "free" | "personal" | "teacher";

function normalizePlan(value: unknown): Plan {
  return value === "personal" || value === "teacher" ? value : "free";
}

function getString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function getObject(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function planFromPriceId(priceId: string | null): Exclude<Plan, "free"> | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_PERSONAL || priceId === process.env.NEXT_PUBLIC_STRIPE_PRICE_PERSONAL) {
    return "personal";
  }
  if (priceId === process.env.STRIPE_PRICE_TEACHER || priceId === process.env.NEXT_PUBLIC_STRIPE_PRICE_TEACHER) {
    return "teacher";
  }
  return null;
}

async function planFromActiveStripeSubscription(customerId: string | null) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey || !customerId) return null;

  const response = await fetch(
    `https://api.stripe.com/v1/subscriptions?customer=${encodeURIComponent(
      customerId
    )}&status=all&limit=10`,
    {
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
      },
      cache: "no-store",
    }
  );

  if (!response.ok) return null;

  const result = (await response.json()) as { data?: unknown };
  if (!Array.isArray(result.data)) return null;

  for (const subscription of result.data) {
    const subscriptionObject = getObject(subscription);
    const status = getString(subscriptionObject?.status);
    if (status !== "active" && status !== "trialing") continue;

    const items = getObject(subscriptionObject?.items);
    const itemData = items?.data;
    if (!Array.isArray(itemData)) continue;

    for (const item of itemData) {
      const price = getObject(getObject(item)?.price);
      const plan = planFromPriceId(getString(price?.id));
      if (plan) {
        return {
          plan,
          stripeSubscriptionId: getString(subscriptionObject?.id),
          status,
          currentPeriodEnd:
            typeof subscriptionObject?.current_period_end === "number"
              ? new Date(subscriptionObject.current_period_end * 1000).toISOString()
              : null,
        };
      }
    }
  }

  return null;
}

export async function GET(request: Request) {
  const auth = await requireSupabaseUser(request);
  if (auth.response) return auth.response;

  try {
    const profile = await ensureProfile(auth.user);
    let plan = normalizePlan(profile.plan);
    let stripeCustomerId = profile.stripe_customer_id ?? null;

    if (plan === "free") {
      const activeSubscription = await planFromActiveStripeSubscription(stripeCustomerId);
      if (activeSubscription) {
        plan = activeSubscription.plan;
        const supabase = getSupabaseAdmin();

        await supabase
          .from("profiles")
          .update({ plan })
          .eq("id", auth.user.id);

        if (activeSubscription.stripeSubscriptionId) {
          await supabase.from("subscriptions").upsert(
            {
              user_id: auth.user.id,
              stripe_customer_id: stripeCustomerId,
              stripe_subscription_id: activeSubscription.stripeSubscriptionId,
              status: activeSubscription.status,
              plan,
              current_period_end: activeSubscription.currentPeriodEnd,
            },
            { onConflict: "stripe_subscription_id" }
          );
        }
      }
    }

    return NextResponse.json({
      ok: true,
      profile: {
        id: profile.id,
        email: profile.email ?? auth.user.email ?? null,
        plan,
        role: profile.role ?? "user",
        stripe_customer_id: stripeCustomerId,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: readableError(error) },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await requireSupabaseUser(request);
  if (auth.response) return auth.response;

  try {
    const body = (await request.json().catch(() => ({}))) as { plan?: unknown };
    const nextPlan = normalizePlan(body.plan);
    const profile = await ensureProfile(auth.user);

    if ((profile.role ?? "user") !== "admin") {
      return NextResponse.json(
        { ok: false, error: "Only admin users can change preview plan." },
        { status: 403 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("profiles")
      .update({ plan: nextPlan })
      .eq("id", auth.user.id);

    if (error) {
      return NextResponse.json(
        { ok: false, error: readableError(error) },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      profile: {
        id: profile.id,
        email: profile.email ?? auth.user.email ?? null,
        plan: nextPlan,
        role: profile.role ?? "user",
        stripe_customer_id: profile.stripe_customer_id ?? null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: readableError(error) },
      { status: 500 }
    );
  }
}
