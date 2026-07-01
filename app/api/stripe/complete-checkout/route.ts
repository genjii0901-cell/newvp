import { NextResponse } from "next/server";
import {
  getSupabaseAdmin,
  readableError,
} from "@/lib/supabase/admin";

type Plan = "personal" | "teacher";

function isPlan(value: unknown): value is Plan {
  return value === "personal" || value === "teacher";
}

function getString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function getObject(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function getNestedId(value: unknown) {
  if (typeof value === "string") return value;
  const object = getObject(value);
  return object ? getString(object.id) : null;
}

function getNestedNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const object = getObject(value);
  return object ? getNestedNumber(object.id ?? object.value) : null;
}

function checkoutSyncError(error: unknown) {
  const message = readableError(error);
  if (message.includes("row-level security")) {
    return "SupabaseのService Role Keyが正しくない可能性があります。VercelのSUPABASE_SERVICE_ROLE_KEYにはanon keyではなくservice_role keyを設定してください。";
  }
  return message;
}

export async function POST(request: Request) {
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return NextResponse.json(
        { ok: false, error: "STRIPE_SECRET_KEY is not configured." },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const sessionId = getString(body.sessionId);

    if (!sessionId?.startsWith("cs_")) {
      return NextResponse.json({ ok: false, error: "Invalid checkout session." }, { status: 400 });
    }

    const sessionResponse = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${sessionId}?expand[]=subscription`,
      {
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
        },
      }
    );
    const session = (await sessionResponse.json()) as Record<string, unknown>;

    if (!sessionResponse.ok) {
      return NextResponse.json(
        { ok: false, error: getObject(session.error)?.message ?? "Failed to read checkout session." },
        { status: sessionResponse.status }
      );
    }

    const metadata = getObject(session.metadata) ?? {};
    const userId = getString(metadata.user_id) ?? getString(metadata.userId) ?? getString(session.client_reference_id);
    const plan = getString(metadata.plan);

    if (!userId || !isPlan(plan)) {
      return NextResponse.json(
        { ok: false, error: "This checkout session is missing user or plan metadata." },
        { status: 403 }
      );
    }

    const paymentStatus = getString(session.payment_status);
    const subscriptionId = getNestedId(session.subscription);
    let subscription = getObject(session.subscription);

    if (!subscription && subscriptionId?.startsWith("sub_")) {
      const subscriptionResponse = await fetch(
        `https://api.stripe.com/v1/subscriptions/${subscriptionId}`,
        {
          headers: {
            Authorization: `Bearer ${stripeSecretKey}`,
          },
        }
      );

      if (subscriptionResponse.ok) {
        subscription = (await subscriptionResponse.json()) as Record<string, unknown>;
      }
    }

    const subscriptionStatus = getString(subscription?.status);

    if (paymentStatus !== "paid" && subscriptionStatus !== "active" && subscriptionStatus !== "trialing") {
      return NextResponse.json(
        { ok: false, error: "Checkout is not completed yet." },
        { status: 409 }
      );
    }

    const customerId = getNestedId(session.customer);
    const customerDetails = getObject(session.customer_details);
    const email = getString(customerDetails?.email);
    const currentPeriodEndUnix = getNestedNumber(subscription?.current_period_end);
    const currentPeriodEnd = currentPeriodEndUnix
      ? new Date(currentPeriodEndUnix * 1000).toISOString()
      : null;

    const supabase = getSupabaseAdmin();
    const { error: profileError } = await supabase.from("profiles").upsert(
      {
        id: userId,
        email,
        plan,
        stripe_customer_id: customerId,
      },
      { onConflict: "id" }
    );

    if (profileError) throw profileError;

    if (subscriptionId) {
      const { error: subscriptionError } = await supabase.from("subscriptions").upsert(
        {
          user_id: userId,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          status: subscriptionStatus ?? (paymentStatus === "paid" ? "active" : "trialing"),
          plan,
          current_period_end: currentPeriodEnd,
        },
        { onConflict: "stripe_subscription_id" }
      );

      if (subscriptionError) {
        console.error("Failed to save subscription", readableError(subscriptionError));
      }
    }

    return NextResponse.json({
      ok: true,
      profile: {
        id: userId,
        email,
        plan,
        stripe_customer_id: customerId,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: checkoutSyncError(error) },
      { status: 500 }
    );
  }
}
