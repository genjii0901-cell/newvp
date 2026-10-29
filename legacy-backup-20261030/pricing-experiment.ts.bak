export type PricingVariant = "choice" | "personal";

const VARIANT_KEY = "vpp-pricing-v1-variant";
const VISITOR_KEY = "vpp-pricing-v1-visitor";

export function getPricingVariant(): PricingVariant {
  try {
    const override = new URLSearchParams(window.location.search).get("offer");
    if (override === "choice" || override === "personal") {
      window.localStorage.setItem(VARIANT_KEY, override);
      return override;
    }
    const saved = window.localStorage.getItem(VARIANT_KEY);
    if (saved === "choice" || saved === "personal") return saved;
    const variant: PricingVariant = crypto.getRandomValues(new Uint8Array(1))[0] < 128 ? "choice" : "personal";
    window.localStorage.setItem(VARIANT_KEY, variant);
    return variant;
  } catch {
    return "choice";
  }
}

export function trackPricingEvent(event: "view" | "checkout", variant: PricingVariant) {
  try {
    let visitorId = window.localStorage.getItem(VISITOR_KEY);
    if (!visitorId) {
      visitorId = crypto.randomUUID();
      window.localStorage.setItem(VISITOR_KEY, visitorId);
    }
    void fetch("/api/analytics/pricing-experiment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, variant, visitorId }),
      keepalive: true,
    });
  } catch {
    // Analytics must never block the purchase flow.
  }
}
