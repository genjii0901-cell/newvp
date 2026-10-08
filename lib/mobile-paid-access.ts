import { ensureProfile } from "@/lib/supabase/admin";
import { hasActiveRevenueCatEntitlement, hasActiveWebSubscription, type WebSubscription } from "@/lib/mobile-entitlement-core";
import type { User } from "@supabase/supabase-js";

export async function hasMobilePurchase(userId: string) {
  const key = process.env.REVENUECAT_SECRET_API_KEY;
  if (!key) return false;
  const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (response.status === 404) return false;
  if (!response.ok) throw new Error("Store purchase verification failed.");
  const data = await response.json() as { subscriber?: { entitlements?: Record<string, RevenueCatEntitlement> } };
  return hasActiveRevenueCatEntitlement(data.subscriber?.entitlements?.personal)
    || hasActiveRevenueCatEntitlement(data.subscriber?.entitlements?.teacher);
}

async function hasWebSubscription(customerId: string | null, introVerified: boolean) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !customerId) return false;
  const response = await fetch(`https://api.stripe.com/v1/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=20`, {
    headers: { Authorization: `Bearer ${key}` }, cache: "no-store",
  });
  if (!response.ok) throw new Error("Web subscription verification failed.");
  const data = await response.json() as { data?: WebSubscription[] };
  return hasActiveWebSubscription(data.data ?? [], introVerified, [
    process.env.STRIPE_PRICE_PERSONAL, process.env.STRIPE_PRICE_TEACHER,
    process.env.NEXT_PUBLIC_STRIPE_PRICE_PERSONAL, process.env.NEXT_PUBLIC_STRIPE_PRICE_TEACHER,
  ]);
}

export async function hasPaidMobileAccess(user: User) {
  const profile = await ensureProfile(user);
  const [mobile, web] = await Promise.allSettled([
    hasMobilePurchase(user.id),
    hasWebSubscription(profile.stripe_customer_id ?? null, profile.trial_used === true),
  ]);
  if (mobile.status === "fulfilled" && mobile.value) return true;
  if (web.status === "fulfilled" && web.value) return true;
  if (mobile.status === "rejected" && web.status === "rejected") throw new Error("Purchase verification unavailable.");
  if (mobile.status === "rejected" && !profile.stripe_customer_id) throw new Error("Store purchase verification unavailable.");
  return false;
}
