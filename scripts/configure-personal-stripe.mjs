import assert from "node:assert/strict";
import { ensureStripeCatalogPrice, findStripeCatalogPrice } from "../lib/stripe-price-catalog.ts";
import { appendPersonalCheckoutPrices, PERSONAL_MONTHLY_PRICE, PERSONAL_INTRO_PRICE } from "../lib/personal-pricing.ts";

// No credentials or Checkout URLs are written to disk or logged.
const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey?.startsWith("sk_live_")) throw new Error("本番のSTRIPE_SECRET_KEYを環境変数で設定してください。値をチャットや引数には貼らないでください。");
const apply = process.argv.includes("--apply");
const verifyCheckout = process.argv.includes("--verify-checkout");
if (verifyCheckout && !apply) throw new Error("--verify-checkoutには--applyが必要です。");
const headers = { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded" };
const resolve = apply ? ensureStripeCatalogPrice : findStripeCatalogPrice;
const monthly = await resolve(secretKey, PERSONAL_MONTHLY_PRICE);
const intro = await resolve(secretKey, PERSONAL_INTRO_PRICE);
console.log(JSON.stringify({ mode: "live", monthly: { configured: Boolean(monthly), yen: 1580 }, intro: { configured: Boolean(intro), yen: 380, days: 7 } }));

const hooksResponse = await fetch("https://api.stripe.com/v1/webhook_endpoints?limit=100", { headers });
if (!hooksResponse.ok) throw new Error("Webhook設定を読み取れませんでした。");
const hooks = await hooksResponse.json();
const requiredEvents = ["checkout.session.completed", "customer.subscription.updated", "customer.subscription.deleted"];
const hook = hooks.data?.find((item) => item.status === "enabled" && item.url === "https://www.vocabprint.com/api/stripe/webhook" &&
  requiredEvents.every((event) => item.enabled_events.includes(event) || item.enabled_events.includes("*")));
console.log(JSON.stringify({ productionWebhookConfigured: Boolean(hook) }));

if (verifyCheckout) {
  assert.ok(monthly && intro);
  for (const first of [true, false]) {
    const body = new URLSearchParams({ mode: "subscription", success_url: "https://www.vocabprint.com/?billing-check=complete", cancel_url: "https://www.vocabprint.com/pricing" });
    appendPersonalCheckoutPrices(body, first, { monthly, intro });
    body.set("payment_method_types[0]", "card");
    body.set("metadata[configuration_check]", "1");
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers, body });
    if (!response.ok) throw new Error(`Checkout検証を作成できませんでした（HTTP ${response.status}）。`);
    const session = await response.json();
    try {
      assert.equal(session.livemode, true);
      assert.equal(session.amount_total, first ? 380 : 1580);
      assert.equal(session.payment_status, "unpaid");
      assert.equal(session.subscription, null);
      console.log(JSON.stringify({ introductory: first, amountDueNow: session.amount_total, verified: true, charged: false }));
    } finally {
      const expired = await fetch(`https://api.stripe.com/v1/checkout/sessions/${session.id}/expire`, { method: "POST", headers });
      if (!expired.ok) throw new Error("検証用Checkoutの失効を確認できませんでした。Stripeで未決済セッションを確認してください。");
    }
  }
}

if (!hook) process.exitCode = 1;
