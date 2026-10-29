import assert from "node:assert/strict";
import test from "node:test";
import {
  appendPersonalCheckoutPrices,
  PERSONAL_INTRO_JPY,
  PERSONAL_MONTHLY_JPY,
  PERSONAL_INTRO_DAYS,
  PERSONAL_MONTHLY_PRICE,
  PERSONAL_INTRO_PRICE,
} from "../lib/personal-pricing.ts";

test("first-time Personal bills the introductory week now and the monthly amount later", () => {
  const body = new URLSearchParams();
  appendPersonalCheckoutPrices(body, true, { monthly: "price_monthly", intro: "price_intro" });
  assert.equal(body.get("line_items[0][price]"), "price_monthly");
  assert.equal(body.get("line_items[1][price]"), "price_intro");
  assert.equal(PERSONAL_MONTHLY_PRICE.amount, 1580);
  assert.equal(PERSONAL_INTRO_PRICE.amount, 380);
  assert.equal(PERSONAL_MONTHLY_PRICE.interval, "month");
  assert.equal(body.get("subscription_data[trial_period_days]"), String(PERSONAL_INTRO_DAYS));
  assert.equal(body.get("metadata[intro_paid_week]"), "1");
  assert.equal(body.get("payment_method_collection"), "always");
  assert.match(body.get("custom_text[submit][message]"), /380円/);
  assert.match(body.get("custom_text[submit][message]"), /1,580円/);
});

test("returning Personal starts at the monthly amount without an introductory week", () => {
  const body = new URLSearchParams();
  appendPersonalCheckoutPrices(body, false, { monthly: "price_monthly" });
  assert.equal(body.get("line_items[0][price]"), "price_monthly");
  assert.equal(body.get("line_items[1][price]"), null);
  assert.equal(body.get("subscription_data[trial_period_days]"), null);
});

test("unresolved price IDs are never sent to Checkout", () => {
  assert.throws(() => appendPersonalCheckoutPrices(new URLSearchParams(), true, { monthly: "price_monthly" }));
  assert.throws(() => appendPersonalCheckoutPrices(new URLSearchParams(), false, { monthly: "prod_wrong" }));
  assert.equal(PERSONAL_INTRO_JPY, 380);
  assert.equal(PERSONAL_MONTHLY_JPY, 1580);
});
