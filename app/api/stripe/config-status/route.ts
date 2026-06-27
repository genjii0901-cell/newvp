import { NextResponse } from "next/server";

const TEACHER_PUBLIC_ENABLED = false;

function isLiveStripeKey(value: string | undefined) {
  return Boolean(value && value.startsWith("sk_live_"));
}

export async function GET() {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const personalPrice =
    process.env.STRIPE_PRICE_PERSONAL ?? process.env.NEXT_PUBLIC_STRIPE_PRICE_PERSONAL;
  const teacherPrice =
    process.env.STRIPE_PRICE_TEACHER ?? process.env.NEXT_PUBLIC_STRIPE_PRICE_TEACHER;

  const invalid = [
    ["STRIPE_PRICE_PERSONAL", personalPrice],
    ["STRIPE_PRICE_TEACHER", teacherPrice],
  ]
    .filter(([, value]) => value && !String(value).startsWith("price_"))
    .map(([name]) => `${name} must start with price_`);

  const missing = [
    ["STRIPE_SECRET_KEY", stripeSecretKey],
    ["STRIPE_PRICE_PERSONAL or NEXT_PUBLIC_STRIPE_PRICE_PERSONAL", personalPrice],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  const liveMode = isLiveStripeKey(stripeSecretKey);
  const personalConfigured = Boolean(
    liveMode && personalPrice && String(personalPrice).startsWith("price_"),
  );
  const teacherConfigured = Boolean(
    TEACHER_PUBLIC_ENABLED &&
      liveMode &&
      teacherPrice &&
      String(teacherPrice).startsWith("price_"),
  );

  return NextResponse.json({
    ok: true,
    liveMode,
    stripeConfigured: personalConfigured,
    stripeSecretConfigured: Boolean(stripeSecretKey),
    personalConfigured,
    teacherConfigured,
    teacherPublicEnabled: TEACHER_PUBLIC_ENABLED,
    missing,
    invalid,
  });
}
