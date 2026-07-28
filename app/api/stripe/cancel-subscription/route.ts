import { NextResponse } from "next/server";
import { ensureProfile, getSupabaseAdmin, readableError, requireSupabaseUser } from "@/lib/supabase/admin";

type Plan = "personal" | "teacher";

function getString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function getObject(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function getUnixDate(value: unknown) {
  return typeof value === "number" ? new Date(value * 1000).toISOString() : null;
}

function formatJapaneseDate(isoDate: string | null) {
  if (!isoDate) return null;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(isoDate));
}

function planFromPriceId(priceId: string | null): Plan | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_PERSONAL || priceId === process.env.NEXT_PUBLIC_STRIPE_PRICE_PERSONAL) {
    return "personal";
  }
  if (priceId === process.env.STRIPE_PRICE_TEACHER || priceId === process.env.NEXT_PUBLIC_STRIPE_PRICE_TEACHER) {
    return "teacher";
  }
  return null;
}

function planFromSubscription(subscription: Record<string, unknown>): Plan | null {
  const items = getObject(subscription.items);
  const data = items?.data;
  if (!Array.isArray(data)) return null;

  for (const item of data) {
    const price = getObject(getObject(item)?.price);
    const plan = planFromPriceId(getString(price?.id));
    if (plan) return plan;
  }

  return null;
}

async function findCurrentStripeSubscription(stripeSecretKey: string, customerId: string) {
  const response = await fetch(
    `https://api.stripe.com/v1/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=10`,
    {
      headers: { Authorization: `Bearer ${stripeSecretKey}` },
      cache: "no-store",
    }
  );

  const result = (await response.json()) as { data?: unknown; error?: { message?: string } };
  if (!response.ok) {
    throw new Error(result.error?.message ?? "Stripe subscription lookup failed.");
  }
  if (!Array.isArray(result.data)) return null;

  return (
    result.data
      .map(getObject)
      .filter((subscription): subscription is Record<string, unknown> => Boolean(subscription))
      .find((subscription) => {
        const status = getString(subscription.status);
        return status === "trialing" || status === "active";
      }) ?? null
  );
}

async function updateLocalSubscription({
  userId,
  customerId,
  subscriptionId,
  status,
  plan,
  currentPeriodEnd,
}: {
  userId: string;
  customerId: string | null;
  subscriptionId: string | null;
  status: string;
  plan: "free" | Plan;
  currentPeriodEnd: string | null;
}) {
  const supabase = getSupabaseAdmin();

  await supabase.from("profiles").update({ plan }).eq("id", userId);

  if (subscriptionId) {
    await supabase.from("subscriptions").upsert(
      {
        user_id: userId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        status,
        plan,
        current_period_end: currentPeriodEnd,
      },
      { onConflict: "stripe_subscription_id" }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireSupabaseUser(request);
  if (auth.response) return auth.response;

  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return NextResponse.json(
        { ok: false, error: "STRIPE_SECRET_KEY is not configured." },
        { status: 500 }
      );
    }

    const profile = await ensureProfile(auth.user);
    const customerId = getString(profile.stripe_customer_id);
    if (!customerId) {
      return NextResponse.json(
        { ok: false, error: "このアカウントには有効なStripe契約がありません。" },
        { status: 404 }
      );
    }

    const subscription = await findCurrentStripeSubscription(stripeSecretKey, customerId);
    if (!subscription) {
      await updateLocalSubscription({
        userId: auth.user.id,
        customerId,
        subscriptionId: null,
        status: "not_found",
        plan: "free",
        currentPeriodEnd: null,
      });
      return NextResponse.json({
        ok: true,
        action: "already_free",
        profile: { plan: "free" },
        message: "有効な契約が見つからなかったため、Freeプランに戻しました。",
      });
    }

    const subscriptionId = getString(subscription.id);
    if (!subscriptionId) {
      return NextResponse.json(
        { ok: false, error: "Stripeの契約IDを確認できませんでした。" },
        { status: 500 }
      );
    }

    const status = getString(subscription.status);
    const plan = planFromSubscription(subscription) ?? "personal";
    const currentPeriodEnd = getUnixDate(subscription.current_period_end);

    if (status === "trialing") {
      const response = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${stripeSecretKey}` },
      });
      const result = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        return NextResponse.json(
          { ok: false, error: result.error?.message ?? "無料トライアルの解約に失敗しました。" },
          { status: response.status }
        );
      }

      await updateLocalSubscription({
        userId: auth.user.id,
        customerId,
        subscriptionId,
        status: "canceled",
        plan: "free",
        currentPeriodEnd: null,
      });

      return NextResponse.json({
        ok: true,
        action: "trial_canceled_now",
        profile: { plan: "free" },
        message: "無料トライアルを解約しました。Personal機能はこの時点で使えなくなり、Freeプランに戻りました。",
      });
    }

    if (status === "active") {
      const response = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ cancel_at_period_end: "true" }),
      });
      const result = (await response.json()) as Record<string, unknown> & { error?: { message?: string } };
      if (!response.ok) {
        return NextResponse.json(
          { ok: false, error: result.error?.message ?? "契約の解約予約に失敗しました。" },
          { status: response.status }
        );
      }

      const nextPeriodEnd = getUnixDate(result.current_period_end) ?? currentPeriodEnd;
      await updateLocalSubscription({
        userId: auth.user.id,
        customerId,
        subscriptionId,
        status: "active",
        plan,
        currentPeriodEnd: nextPeriodEnd,
      });

      const dateLabel = formatJapaneseDate(nextPeriodEnd);
      return NextResponse.json({
        ok: true,
        action: "paid_cancel_at_period_end",
        profile: { plan },
        currentPeriodEnd: nextPeriodEnd,
        message: dateLabel
          ? `解約予約を受け付けました。支払い済み期間のため、${dateLabel}までは現在のプランを利用できます。`
          : "解約予約を受け付けました。支払い済み期間の終了までは現在のプランを利用できます。",
      });
    }

    await updateLocalSubscription({
      userId: auth.user.id,
      customerId,
      subscriptionId,
      status: status ?? "canceled",
      plan: "free",
      currentPeriodEnd: null,
    });

    return NextResponse.json({
      ok: true,
      action: "inactive",
      profile: { plan: "free" },
      message: "契約が有効ではないため、Freeプランに戻しました。",
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: readableError(error) },
      { status: 500 }
    );
  }
}
