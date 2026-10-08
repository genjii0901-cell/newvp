import assert from "node:assert/strict";
import test from "node:test";
import { hasActiveRevenueCatEntitlement, hasActiveWebSubscription } from "../lib/mobile-entitlement-core.ts";

test("store entitlement requires an unexpired date or lifetime grant", () => {
  const now = Date.parse("2026-10-08T00:00:00Z");
  assert.equal(hasActiveRevenueCatEntitlement(undefined, now), false);
  assert.equal(hasActiveRevenueCatEntitlement({ expires_date: "bad-date" }, now), false);
  assert.equal(hasActiveRevenueCatEntitlement({ expires_date: "2026-10-07T23:59:59Z" }, now), false);
  assert.equal(hasActiveRevenueCatEntitlement({ expires_date: "2026-10-09T00:00:00Z" }, now), true);
  assert.equal(hasActiveRevenueCatEntitlement({ expires_date: null }, now), true);
});

test("web subscription rejects canceled trials and unrelated prices", () => {
  const prices = ["price_personal"];
  assert.equal(hasActiveWebSubscription([{ status: "trialing", cancel_at_period_end: true, metadata: { plan: "personal" } }], true, prices), false);
  assert.equal(hasActiveWebSubscription([{ status: "trialing", metadata: { plan: "personal", intro_paid_week: "1" } }], false, prices), false);
  assert.equal(hasActiveWebSubscription([{ status: "canceled", metadata: { plan: "personal" } }], true, prices), false);
  assert.equal(hasActiveWebSubscription([{ status: "active", items: { data: [{ price: { id: "different" } }] } }], true, prices), false);
  assert.equal(hasActiveWebSubscription([{ status: "active", items: { data: [{ price: { id: "price_personal" } }] } }], true, prices), true);
});
