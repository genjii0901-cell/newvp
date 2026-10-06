import { NextResponse } from "next/server";
import { isMaterialPurchaseSchemaError, recordMaterialPurchase } from "@/lib/material-purchases";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getWinbackEligibleAt } from "@/lib/trial-offers";
import { recordPricingPurchase } from "@/lib/pricing-experiment-server";

export const dynamic = "force-dynamic";

type StripeEvent = {
  type: string;
  data: {
    object: Record<string, unknown>;
  };
};

function parseStripeSignature(signature: string) {
  const parts = Object.fromEntries(
    signature.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key, value];
    })
  );

  return {
    timestamp: parts.t,
    signature: parts.v1,
  };
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
}

async function hmacSha256Hex(secret: string, value: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyStripeWebhook(body: string, signatureHeader: string, secret: string) {
  const parsed = parseStripeSignature(signatureHeader);
  if (!parsed.timestamp || !parsed.signature) return false;

  const expected = await hmacSha256Hex(secret, `${parsed.timestamp}.${body}`);
  return timingSafeEqual(expected, parsed.signature);
}

function getString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function getNestedString(object: Record<string, unknown>, key: string) {
  const value = object[key];
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) {
    return getString((value as { id?: unknown }).id);
  }
  return null;
}

function planFromPriceId(priceId: string | null) {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_PERSONAL || priceId === process.env.NEXT_PUBLIC_STRIPE_PRICE_PERSONAL) {
    return "personal";
  }
  if (priceId === process.env.STRIPE_PRICE_TEACHER || priceId === process.env.NEXT_PUBLIC_STRIPE_PRICE_TEACHER) {
    return "teacher";
  }
  return null;
}

function planFromSubscriptionObject(object: Record<string, unknown>) {
  const items = object.items;
  if (!items || typeof items !== "object") return null;

  const data = (items as { data?: unknown }).data;
  if (!Array.isArray(data)) return null;

  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const price = (item as { price?: unknown }).price;
    if (!price || typeof price !== "object") continue;
    const plan = planFromPriceId(getString((price as { id?: unknown }).id));
    if (plan) return plan;
  }

  return null;
}

function isCanceledDuringTrial(object: Record<string, unknown>) {
  const status = getString(object.status);
  const cancelAtPeriodEnd = object.cancel_at_period_end === true;
  return status === "trialing" && cancelAtPeriodEnd;
}

async function findUserIdByCustomer(stripeCustomerId: string | null) {
  if (!stripeCustomerId) return null;

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();

  return data?.id ?? null;
}

async function findPlanByUserId(userId: string | null) {
  if (!userId) return null;

  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("profiles").select("plan").eq("id", userId).maybeSingle();
  const plan = getString(data?.plan);
  return plan === "personal" || plan === "teacher" ? plan : null;
}

async function updatePlan({
  userId,
  plan,
  stripeCustomerId,
  stripeSubscriptionId,
  status,
  currentPeriodEnd,
}: {
  userId: string;
  plan: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: string | null;
  currentPeriodEnd: string | null;
}) {
  const supabase = getSupabaseAdmin();

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: userId,
      plan,
    },
    { onConflict: "id" }
  );

  if (profileError) throw profileError;

  if (stripeCustomerId) {
    const { error: customerError } = await supabase
      .from("profiles")
      .update({ stripe_customer_id: stripeCustomerId })
      .eq("id", userId);

    if (customerError) {
      console.error("Failed to save Stripe customer id", customerError.message);
    }
  }

  if (stripeSubscriptionId) {
    const { error: subscriptionError } = await supabase.from("subscriptions").upsert(
      {
        user_id: userId,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
        status,
        plan,
        current_period_end: currentPeriodEnd,
      },
      { onConflict: "stripe_subscription_id" }
    );

    if (subscriptionError) {
      console.error("Failed to save subscription", subscriptionError.message);
    }
  }
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");

  if (!webhookSecret) {
    return NextResponse.json(
      { ok: false, error: "STRIPE_WEBHOOK_SECRET is not configured." },
      { status: 500 }
    );
  }

  if (!signature) {
    return NextResponse.json({ ok: false, error: "Missing stripe-signature." }, { status: 400 });
  }

  const body = await request.text();
  const verified = await verifyStripeWebhook(body, signature, webhookSecret);

  if (!verified) {
    return NextResponse.json({ ok: false, error: "Invalid Stripe signature." }, { status: 400 });
  }

  try {
    const event = JSON.parse(body) as StripeEvent;
    const object = event.data.object;
    const metadata = (object.metadata ?? {}) as Record<string, unknown>;

    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const userId = getString(metadata.user_id) ?? getString(metadata.userId);
      const plan = getString(metadata.plan);
      const customerId = getNestedString(object, "customer");
      const subscriptionId = getNestedString(object, "subscription");

      const introPaymentRequired = getString(metadata.intro_paid_week) === "1";
      const checkoutPaid = getString(object.payment_status) === "paid";
      const legacyFreeTrial = !introPaymentRequired && getString(metadata.trial) === "1";
      if (userId && plan && (checkoutPaid || legacyFreeTrial)) {
        await updatePlan({
          userId,
          plan,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          status: "active",
          currentPeriodEnd: null,
        });

        // 初回割引や旧無料トライアルの再利用を防ぐ。
        if (introPaymentRequired || getString(metadata.trial) === "1") {
          try {
            const supabase = getSupabaseAdmin();
            const trialOffer = getString(metadata.trial_offer);
            await supabase
              .from("profiles")
              .update(
                trialOffer === "winback"
                  ? { winback_trial_used: true, winback_trial_eligible_at: null }
                  : { trial_used: true }
              )
              .eq("id", userId);
          } catch (error) {
            console.error("Failed to mark trial_used", error);
          }
        }
        const pricingVariant = getString(metadata.pricing_variant);
        const sessionId = getString(object.id);
        if (plan === "personal" && sessionId &&
            (pricingVariant === "choice" || pricingVariant === "personal")) {
          await recordPricingPurchase(sessionId, pricingVariant, object.amount_total);
        }
      }

      if (userId && getString(metadata.kind) === "print_purchase" && checkoutPaid) {
        await recordPricingPurchase(getString(object.id) ?? "", metadata.pricing_variant, object.amount_total);
      }

      if (userId && getString(metadata.kind) === "pdf_material" && getString(object.payment_status) === "paid") {
        const sessionId = getString(object.id);
        const purchaseType = getString(metadata.purchase_type) === "wordbook" ? "wordbook" : "asset";
        if (sessionId) {
          try {
            await recordMaterialPurchase({
              userId,
              stripeSessionId: sessionId,
              purchaseType,
              assetId: getString(metadata.asset_id),
              wordbookId: getString(metadata.wordbook_id),
              amountJpy: Math.max(1, Math.floor(Number(metadata.amount_jpy) || Number(object.amount_total) || 0)),
            });
          } catch (error) {
            if (!isMaterialPurchaseSchemaError(error)) throw error;
            console.error("material_purchases table is not configured yet");
          }
        }
      }
    }

    if (event.type === "customer.subscription.updated") {
      const customerId = getNestedString(object, "customer");
      const userId =
        getString(metadata.user_id) ?? getString(metadata.userId) ?? (await findUserIdByCustomer(customerId));
      const rawPlan = getString(metadata.plan) ?? planFromSubscriptionObject(object);
      const status = getString(object.status);
      const subscriptionId = getString(object.id);
      const currentPeriodEnd =
        typeof object.current_period_end === "number"
          ? new Date(object.current_period_end * 1000).toISOString()
          : null;
      const introPaymentPending = getString(metadata.intro_paid_week) === "1" &&
        status === "trialing" &&
        !(await getSupabaseAdmin().from("profiles").select("trial_used").eq("id", userId ?? "").maybeSingle()).data?.trial_used;
      const plan = introPaymentPending || isCanceledDuringTrial(object)
        ? "free"
        : status && !["active", "trialing"].includes(status)
        ? "free"
        : rawPlan ?? (await findPlanByUserId(userId));

      if (userId && plan) {
        await updatePlan({
          userId,
          plan,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          status,
          currentPeriodEnd,
        });
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const customerId = getNestedString(object, "customer");
      const userId =
        getString(metadata.user_id) ?? getString(metadata.userId) ?? (await findUserIdByCustomer(customerId));
      const subscriptionId = getString(object.id);

      if (userId) {
        await updatePlan({
          userId,
          plan: "free",
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          status: "deleted",
          currentPeriodEnd: null,
        });
        await getSupabaseAdmin()
          .from("profiles")
          .update({ winback_trial_eligible_at: getWinbackEligibleAt() })
          .eq("id", userId);
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
