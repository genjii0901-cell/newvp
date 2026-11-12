import { NextResponse } from "next/server";
import { ensureProfile, getSupabaseAdmin, readableError, requireSupabaseUser } from "@/lib/supabase/admin";
import { getTrialOffer } from "@/lib/trial-offers";
import { CUSTOMER_VIEW_COOKIE, hasOwnerMfaSession, hasVerifiedAdminBrowserSession, isCustomerViewRequest } from "@/lib/admin-auth";
import { hasAdminFeatureAccess, isAdminOwnerAccount } from "@/lib/plan-access";

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

function isCanceledDuringTrial(subscriptionObject: Record<string, unknown>) {
  const status = getString(subscriptionObject.status);
  const cancelAtPeriodEnd = subscriptionObject.cancel_at_period_end === true;
  return status === "trialing" && cancelAtPeriodEnd;
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

async function planFromActiveStripeSubscription(customerId: string | null, introPaymentVerified: boolean) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey || !customerId) return undefined;

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

  if (!response.ok) throw new Error("Stripe subscription lookup failed.");

  const result = (await response.json()) as { data?: unknown };
  if (!Array.isArray(result.data)) throw new Error("Stripe subscription response is invalid.");

  for (const subscription of result.data) {
    const subscriptionObject = getObject(subscription);
    const status = getString(subscriptionObject?.status);
    if (status !== "active" && status !== "trialing") continue;
    if (subscriptionObject && isCanceledDuringTrial(subscriptionObject)) continue;

    const metadataPlan = getString(getObject(subscriptionObject?.metadata)?.plan);
    const introPaymentPending = status === "trialing" &&
      getString(getObject(subscriptionObject?.metadata)?.intro_paid_week) === "1" &&
      !introPaymentVerified;
    if (introPaymentPending) continue;
    if (metadataPlan === "personal" || metadataPlan === "teacher") {
      const activePlan: Exclude<Plan, "free"> = metadataPlan;
      return {
        plan: activePlan,
        stripeSubscriptionId: getString(subscriptionObject?.id),
        status,
        currentPeriodEnd:
          typeof subscriptionObject?.current_period_end === "number"
            ? new Date(subscriptionObject.current_period_end * 1000).toISOString()
            : null,
      };
    }

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
    // 管理者としての全機能開放（従来どおり role=admin ＋ 管理者セッション）。
    const roleAdmin = hasAdminFeatureAccess(profile.role, await hasVerifiedAdminBrowserSession(request, auth.user.id));
    // 「管理者の試用」は運営者本人のアカウントだけ。さらに2段階認証済みのときだけ使える。
    const adminOwner = isAdminOwnerAccount(auth.user);
    const adminCapable = adminOwner && (await hasOwnerMfaSession(request, auth.user.id));
    const customerView = (roleAdmin || adminCapable) && isCustomerViewRequest(request);
    const adminAccess = roleAdmin && !customerView;
    let plan = normalizePlan(profile.plan);
    const stripeCustomerId = profile.stripe_customer_id ?? null;

    const activeSubscription = await planFromActiveStripeSubscription(stripeCustomerId, profile.trial_used === true);
    const supabase = getSupabaseAdmin();

    if (activeSubscription) {
      plan = activeSubscription.plan;

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
    } else if (activeSubscription === null && plan !== "free" && !adminCapable && !roleAdmin) {
      // 管理者の試用プランは、Stripe契約がなくてもfreeへ戻さない。
      plan = "free";
      await supabase
        .from("profiles")
        .update({ plan: "free" })
        .eq("id", auth.user.id);
    }

    return NextResponse.json({
      ok: true,
      profile: {
        id: profile.id,
        email: profile.email ?? auth.user.email ?? null,
        plan,
        role: profile.role ?? "user",
        adminAccess,
        adminCapable,
        adminOwner,
        customerView,
        stripe_customer_id: stripeCustomerId,
        trialOffer: getTrialOffer(profile),
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
    const body = (await request.json().catch(() => ({}))) as { plan?: unknown; trialUsed?: unknown; customerView?: unknown };
    const profile = await ensureProfile(auth.user);
    const nextPlan = body.plan === undefined ? normalizePlan(profile.plan) : normalizePlan(body.plan);

    // 運営者本人のアカウント かつ 2段階認証済みのときだけ、試用のプラン切り替えを許す。
    if (!isAdminOwnerAccount(auth.user) || !(await hasOwnerMfaSession(request, auth.user.id))) {
      return NextResponse.json(
        { ok: false, error: "管理者の試用は、運営者のアカウントで2段階認証をしたときだけ使えます。" },
        { status: 403 }
      );
    }
    const roleAdmin = hasAdminFeatureAccess(profile.role, await hasVerifiedAdminBrowserSession(request, auth.user.id));

    const supabase = getSupabaseAdmin();
    // 購入者と同じDB項目（plan / trial_used）だけを書き換える。専用の特別処理は持たない。
    const update: Record<string, unknown> = {};
    if (body.plan !== undefined) update.plan = nextPlan;
    if (typeof body.trialUsed === "boolean") update.trial_used = body.trialUsed;
    if (Object.keys(update).length > 0) {
      const { error } = await supabase.from("profiles").update(update).eq("id", auth.user.id);
      if (error) {
        return NextResponse.json(
          { ok: false, error: readableError(error) },
          { status: 500 }
        );
      }
    }

    const customerView = typeof body.customerView === "boolean" ? body.customerView : isCustomerViewRequest(request);
    const trialUsed = typeof body.trialUsed === "boolean" ? body.trialUsed : profile.trial_used === true;
    const response = NextResponse.json({
      ok: true,
      profile: {
        id: profile.id,
        email: profile.email ?? auth.user.email ?? null,
        plan: nextPlan,
        role: profile.role ?? "user",
        adminAccess: roleAdmin && !customerView,
        adminCapable: true,
        adminOwner: true,
        customerView,
        trialOffer: getTrialOffer({ ...profile, trial_used: trialUsed }),
        stripe_customer_id: profile.stripe_customer_id ?? null,
      },
    });
    if (typeof body.customerView === "boolean") {
      response.cookies.set(CUSTOMER_VIEW_COOKIE, body.customerView ? "1" : "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: body.customerView ? 7 * 24 * 60 * 60 : 0,
      });
    }
    return response;
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: readableError(error) },
      { status: 500 }
    );
  }
}
