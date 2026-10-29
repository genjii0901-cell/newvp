import { NextResponse } from "next/server";
import { findStripeCatalogPrice } from "@/lib/stripe-price-catalog";
import { PERSONAL_MONTHLY_PRICE, PERSONAL_INTRO_PRICE, PERSONAL_INTRO_DAYS } from "@/lib/personal-pricing";

const TEACHER_PUBLIC_ENABLED = false;
let catalogCache: { key: string; expires: number; ready: boolean; verified: boolean } | undefined;

async function checkPersonalCatalog(key: string) {
  if (catalogCache?.key === key && catalogCache.expires > Date.now()) return catalogCache;
  try {
    const [monthly, intro] = await Promise.all([
      findStripeCatalogPrice(key, PERSONAL_MONTHLY_PRICE),
      findStripeCatalogPrice(key, PERSONAL_INTRO_PRICE),
    ]);
    catalogCache = { key, expires: Date.now() + 30_000, ready: Boolean(monthly && intro), verified: true };
  } catch {
    catalogCache = { key, expires: Date.now() + 5_000, ready: false, verified: false };
  }
  return catalogCache;
}

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
    ["STRIPE_WEBHOOK_SECRET", process.env.STRIPE_WEBHOOK_SECRET],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  const liveMode = isLiveStripeKey(stripeSecretKey);
  const catalog = liveMode && stripeSecretKey ? await checkPersonalCatalog(stripeSecretKey) : null;
  const personalConfigured = Boolean(liveMode && catalog?.verified && process.env.STRIPE_WEBHOOK_SECRET);
  const teacherConfigured = Boolean(
    TEACHER_PUBLIC_ENABLED &&
      liveMode &&
      (!teacherPrice || String(teacherPrice).startsWith("price_")),
  );

  return NextResponse.json({
    ok: true,
    liveMode,
    stripeConfigured: personalConfigured,
    stripeSecretConfigured: Boolean(stripeSecretKey),
    personalConfigured,
    personalCatalogReady: Boolean(catalog?.ready),
    personalCatalogAutoProvision: personalConfigured && !catalog?.ready,
    personalOffer: {
      introductoryDays: PERSONAL_INTRO_DAYS,
      introductoryJpy: PERSONAL_INTRO_PRICE.amount,
      monthlyJpy: PERSONAL_MONTHLY_PRICE.amount,
    },
    teacherConfigured,
    teacherAutoProvisioned: teacherConfigured && !teacherPrice,
    teacherPublicEnabled: TEACHER_PUBLIC_ENABLED,
    missing,
    invalid,
  }, { headers: { "Cache-Control": "no-store" } });
}
