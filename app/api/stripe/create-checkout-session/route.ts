import { NextResponse } from "next/server";
import {
  getSupabaseAdmin,
  readableError,
  requireSupabaseUser,
  tryEnsureProfile,
} from "@/lib/supabase/admin";
import { getTrialOffer, TRIAL_DAYS } from "@/lib/trial-offers";

type CheckoutPlan = "personal" | "teacher";
const TEACHER_PUBLIC_ENABLED = true;
const TEACHER_LOOKUP_KEY = "vocab_print_pro_teacher_monthly_2980";

function isCheckoutPlan(value: unknown): value is CheckoutPlan {
  return value === "personal" || value === "teacher";
}

function isLiveStripeKey(value: string | undefined) {
  return Boolean(value && value.startsWith("sk_live_"));
}

function isProductionHost(appUrl: string) {
  try {
    const host = new URL(appUrl).hostname.toLowerCase();
    return host === "vocabprint.com" || host === "www.vocabprint.com";
  } catch {
    return false;
  }
}

function getPriceId(plan: CheckoutPlan) {
  if (plan === "personal") {
    return process.env.STRIPE_PRICE_PERSONAL ?? process.env.NEXT_PUBLIC_STRIPE_PRICE_PERSONAL;
  }

  return process.env.STRIPE_PRICE_TEACHER ?? process.env.NEXT_PUBLIC_STRIPE_PRICE_TEACHER;
}

async function resolveTeacherPriceId(stripeSecretKey: string) {
  const configured = getPriceId("teacher");
  if (configured?.startsWith("price_")) return configured;

  const pricesResponse = await fetch(
    `https://api.stripe.com/v1/prices?active=true&limit=1&lookup_keys[]=${encodeURIComponent(TEACHER_LOOKUP_KEY)}`,
    { headers: { Authorization: `Bearer ${stripeSecretKey}` }, cache: "no-store" },
  );
  const prices = await pricesResponse.json();
  const existingPrice = Array.isArray(prices?.data) ? prices.data[0]?.id : null;
  if (typeof existingPrice === "string" && existingPrice.startsWith("price_")) return existingPrice;

  const productBody = new URLSearchParams({
    name: "Vocab Print Pro Teacher",
    description: "学校・塾・教材作成者向けプラン",
    "metadata[plan]": "teacher",
  });
  const productResponse = await fetch("https://api.stripe.com/v1/products", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": "vpp-teacher-product-v1",
    },
    body: productBody,
  });
  const product = await productResponse.json();
  if (!productResponse.ok || typeof product?.id !== "string") {
    throw new Error(product?.error?.message ?? "Teacher商品の作成に失敗しました。");
  }

  const priceBody = new URLSearchParams({
    currency: "jpy",
    unit_amount: "2980",
    product: product.id,
    lookup_key: TEACHER_LOOKUP_KEY,
    "recurring[interval]": "month",
    "metadata[plan]": "teacher",
  });
  const priceResponse = await fetch("https://api.stripe.com/v1/prices", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": "vpp-teacher-price-2980-v1",
    },
    body: priceBody,
  });
  const price = await priceResponse.json();
  if (!priceResponse.ok || typeof price?.id !== "string") {
    throw new Error(price?.error?.message ?? "Teacher価格の作成に失敗しました。");
  }
  return price.id as string;
}

function isNoSuchCustomerError(value: unknown) {
  return typeof value === "string" && value.includes("No such customer");
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
    let priceId = getPriceId(plan);

    if (plan === "teacher" && !TEACHER_PUBLIC_ENABLED) {
      return NextResponse.json(
        { ok: false, error: "Teacher plan is not publicly available yet." },
        { status: 503 }
      );
    }

    if (!stripeSecretKey) {
      return NextResponse.json(
        {
          ok: false,
          error: "Stripe設定が未完了です。Vercelに STRIPE_SECRET_KEY を設定してください。",
        },
        { status: 500 }
      );
    }

    if (isProductionHost(appUrl) && !isLiveStripeKey(stripeSecretKey)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "本番ドメインでは live Stripe key が必要です。テストキーでは課金を開始できません。",
        },
        { status: 503 }
      );
    }

    if (plan === "teacher" && !priceId) {
      priceId = await resolveTeacherPriceId(stripeSecretKey);
    }

    if (!priceId) {
      return NextResponse.json(
        { ok: false, error: "Stripeの価格設定が見つかりません。" },
        { status: 500 },
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

    // 初回は1回だけ。解約から90日以上経過した人には、生涯1回だけ再体験を付与する。
    const trialOffer = plan === "personal" ? getTrialOffer(profile) : null;
    const grantTrial = trialOffer !== null;

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

    if (grantTrial) {
      body.append("subscription_data[trial_period_days]", String(TRIAL_DAYS));
      // カード登録は必須（デフォルト）。7日間は無料、その後 自動で課金開始。
      // 解約すれば次回課金されず、webhookでFreeに戻る。
      body.append("metadata[trial]", "1");
      body.append("metadata[trial_offer]", trialOffer);
      body.append("subscription_data[metadata][trial]", "1");
      body.append("subscription_data[metadata][trial_offer]", trialOffer);
    }

    let fallbackToEmailCustomer = false;

    if (profile?.stripe_customer_id) {
      body.append("customer", profile.stripe_customer_id);
    } else if (auth.user.email) {
      body.append("customer_email", auth.user.email);
    }

    const checkoutAttemptId = crypto.randomUUID();
    const checkoutHeaders = {
      Authorization: `Bearer ${stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": `vpp-checkout-${checkoutAttemptId}`,
    };

    let response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: checkoutHeaders,
      body,
    });

    let data = await response.json();

    if (!response.ok && isNoSuchCustomerError(data.error?.message) && auth.user.email) {
      fallbackToEmailCustomer = true;
      body.delete("customer");
      body.set("customer_email", auth.user.email);

      response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: { ...checkoutHeaders, "Idempotency-Key": `vpp-checkout-${checkoutAttemptId}-email` },
        body,
      });

      data = await response.json();
    }

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
            typeof data.customer === "string"
              ? data.customer
              : fallbackToEmailCustomer
                ? null
                : profile?.stripe_customer_id ?? null,
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
