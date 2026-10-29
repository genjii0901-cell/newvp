export type StripePriceSpec = {
  lookupKey: string;
  name: string;
  amount: number;
  interval?: "month";
};

type StripePrice = {
  id?: string;
  active?: boolean;
  livemode?: boolean;
  currency?: string;
  unit_amount?: number;
  recurring?: { interval?: string; interval_count?: number } | null;
};

function validatePrice(price: StripePrice, spec: StripePriceSpec, live: boolean) {
  const recurringMatches = spec.interval
    ? price.recurring?.interval === spec.interval && price.recurring.interval_count === 1
    : !price.recurring;
  if (!price.id?.startsWith("price_") || !price.active || price.livemode !== live ||
      price.currency !== "jpy" || price.unit_amount !== spec.amount || !recurringMatches) {
    throw new Error(`Stripeの料金設定が一致しません: ${spec.lookupKey}`);
  }
  return price.id;
}

export async function findStripeCatalogPrice(
  secretKey: string,
  spec: StripePriceSpec,
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  const query = new URLSearchParams({ "lookup_keys[]": spec.lookupKey, limit: "1" });
  const response = await fetcher(`https://api.stripe.com/v1/prices?${query}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Stripeの料金情報を確認できませんでした。");
  const result = await response.json() as { data?: StripePrice[] };
  const price = result.data?.[0];
  return price ? validatePrice(price, spec, secretKey.startsWith("sk_live_")) : null;
}

export async function ensureStripeCatalogPrice(
  secretKey: string,
  spec: StripePriceSpec,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const existing = await findStripeCatalogPrice(secretKey, spec, fetcher);
  if (existing) return existing;

  const body = new URLSearchParams({
    currency: "jpy",
    unit_amount: String(spec.amount),
    lookup_key: spec.lookupKey,
    "product_data[name]": spec.name,
    "product_data[metadata][plan]": "personal",
    "metadata[plan]": "personal",
    "metadata[billing_version]": "personal-380-1580-v1",
  });
  if (spec.interval) body.set("recurring[interval]", spec.interval);
  const response = await fetcher("https://api.stripe.com/v1/prices", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": `vpp-catalog-${spec.lookupKey}`,
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    // A concurrent first checkout may have created the unique lookup key.
    if (response.status === 400 || response.status === 409) {
      const concurrent = await findStripeCatalogPrice(secretKey, spec, fetcher);
      if (concurrent) return concurrent;
    }
    throw new Error("Stripeの料金を準備できませんでした。時間をおいて再度お試しください。");
  }
  return validatePrice(await response.json() as StripePrice, spec, secretKey.startsWith("sk_live_"));
}
