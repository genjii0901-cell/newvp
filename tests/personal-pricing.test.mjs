import assert from "node:assert/strict";
import test from "node:test";
import {
  appendPersonalCheckoutPrices,
  PERSONAL_INTRO_JPY,
  PERSONAL_MONTHLY_JPY,
  PERSONAL_INTRO_DAYS,
} from "../lib/personal-pricing.ts";

test("first-time Personal bills the introductory week now and the monthly amount later", () => {
  const body = new URLSearchParams();
  appendPersonalCheckoutPrices(body, true);
  assert.equal(body.get("line_items[0][price_data][unit_amount]"), String(PERSONAL_MONTHLY_JPY));
  assert.equal(body.get("line_items[0][price_data][recurring][interval]"), "month");
  assert.equal(body.get("line_items[1][price_data][unit_amount]"), String(PERSONAL_INTRO_JPY));
  assert.equal(body.get("subscription_data[trial_period_days]"), String(PERSONAL_INTRO_DAYS));
  assert.equal(body.get("metadata[intro_paid_week]"), "1");
});

test("returning Personal starts at the monthly amount without an introductory week", () => {
  const body = new URLSearchParams();
  appendPersonalCheckoutPrices(body, false);
  assert.equal(body.get("line_items[0][price_data][unit_amount]"), String(PERSONAL_MONTHLY_JPY));
  assert.equal(body.get("line_items[1][price_data][unit_amount]"), null);
  assert.equal(body.get("subscription_data[trial_period_days]"), null);
});
