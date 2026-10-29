export type PricingVariant = "choice" | "personal";

const VISITOR_KEY = "vpp-pricing-v1-visitor";

// 料金は「都度購入」と「Personal」の2択で固定（A/Bテストは終了）。旧実装は legacy-backup-20261030 に保存。
export function getPricingVariant(): PricingVariant {
  return "choice";
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
