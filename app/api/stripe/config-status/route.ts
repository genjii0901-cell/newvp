import { NextResponse } from "next/server";

export async function GET() {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const personalPrice = process.env.STRIPE_PRICE_PERSONAL ?? process.env.NEXT_PUBLIC_STRIPE_PRICE_PERSONAL;
  const teacherPrice = process.env.STRIPE_PRICE_TEACHER ?? process.env.NEXT_PUBLIC_STRIPE_PRICE_TEACHER;
  const invalid = [
    ["STRIPE_PRICE_PERSONAL", personalPrice],
    ["STRIPE_PRICE_TEACHER", teacherPrice],
  ]
    .filter(([, value]) => value && !String(value).startsWith("price_"))
    .map(([name]) => `${name} must start with price_`);
  const missing = [
    ["STRIPE_SECRET_KEY", stripeSecretKey],
    ["STRIPE_PRICE_PERSONAL or NEXT_PUBLIC_STRIPE_PRICE_PERSONAL", personalPrice],
    ["STRIPE_PRICE_TEACHER or NEXT_PUBLIC_STRIPE_PRICE_TEACHER", teacherPrice],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  return NextResponse.json({
    ok: true,
    stripeConfigured: missing.length === 0,
    stripeSecretConfigured: Boolean(stripeSecretKey),
    personalConfigured: Boolean(stripeSecretKey && personalPrice && String(personalPrice).startsWith("price_")),
    teacherConfigured: Boolean(stripeSecretKey && teacherPrice && String(teacherPrice).startsWith("price_")),
    missing,
    invalid,
  });
}
