export type RevenueCatEntitlement = { expires_date?: string | null };
export type WebSubscription = {
  status?: string;
  cancel_at_period_end?: boolean;
  metadata?: Record<string, string>;
  items?: { data?: Array<{ price?: { id?: string } }> };
};

export function hasActiveRevenueCatEntitlement(entitlement: RevenueCatEntitlement | undefined, now = Date.now()) {
  if (!entitlement) return false;
  if (entitlement.expires_date === null) return true;
  const expires = Date.parse(entitlement.expires_date ?? "");
  return Number.isFinite(expires) && expires > now;
}

export function hasActiveWebSubscription(subscriptions: WebSubscription[], introVerified: boolean, priceIds: Array<string | undefined>) {
  return subscriptions.some((subscription) => {
    if (subscription.status !== "active" && subscription.status !== "trialing") return false;
    if (subscription.status === "trialing" && subscription.cancel_at_period_end) return false;
    if (subscription.status === "trialing" && subscription.metadata?.intro_paid_week === "1" && !introVerified) return false;
    if (subscription.metadata?.plan === "personal" || subscription.metadata?.plan === "teacher") return true;
    return (subscription.items?.data ?? []).some(({ price }) => Boolean(price?.id) && priceIds.includes(price?.id));
  });
}
