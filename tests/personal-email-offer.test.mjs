import assert from "node:assert/strict";
import test from "node:test";
import { createPersonalEmailOfferUrl, isPersonalEmailOfferEligible } from "../lib/personal-email-offer.ts";
import { appendPersonalCheckoutPrices } from "../lib/personal-pricing.ts";
import { buildMarketingEmailHtml } from "../lib/marketing-email.ts";

process.env.PERSONAL_OFFER_SECRET = "test-only-signing-secret";
delete process.env.PERSONAL_OFFER_END_AT;

const recipient = { id: "first-user", email: "recipient@example.com" };
const profile = { plan: "free", trial_used: false };
const link = createPersonalEmailOfferUrl("https://www.vocabprint.com", recipient);
const token = new URL(link).searchParams.get("offer");

test("the emailed token is only accepted for the exact eligible account", () => {
  assert.match(link, /^https:\/\/www\.vocabprint\.com\/pricing\?offer=/);
  assert.ok(!link.includes(recipient.id) && !link.includes(recipient.email));
  assert.equal(isPersonalEmailOfferEligible(token, recipient, profile), true);
  assert.equal(isPersonalEmailOfferEligible(token, { ...recipient, email: "RECIPIENT@EXAMPLE.COM" }, profile), true);
  assert.equal(isPersonalEmailOfferEligible(token, { ...recipient, id: "another-user" }, profile), false);
  assert.equal(isPersonalEmailOfferEligible(token, { ...recipient, email: "new@example.com" }, profile), false);
  assert.equal(isPersonalEmailOfferEligible(token, recipient, { ...profile, trial_used: true }), false);
  assert.equal(isPersonalEmailOfferEligible(token, recipient, { ...profile, plan: "personal" }), false);
  assert.equal(isPersonalEmailOfferEligible(token, recipient, null), false);
  assert.equal(isPersonalEmailOfferEligible(token, recipient, { trial_used: false }), false);
  assert.equal(isPersonalEmailOfferEligible("x" + token, recipient, profile), false);
  assert.equal(isPersonalEmailOfferEligible(null, recipient, profile), false);
});

test("a configured end date closes link issuing and redemption", () => {
  process.env.PERSONAL_OFFER_END_AT = "2026-01-01T00:00:00+09:00";
  try {
    assert.equal(createPersonalEmailOfferUrl("https://www.vocabprint.com", recipient), null);
    assert.equal(isPersonalEmailOfferEligible(token, recipient, profile), false);
  } finally {
    delete process.env.PERSONAL_OFFER_END_AT;
  }
});

test("email HTML renders the real link as the dedicated application button", () => {
  const html = buildMarketingEmailHtml(`下の専用リンクからお申し込みください。\n\n${link}`, { kind: "marketing", personalOfferUrl: link });
  assert.ok(html.includes(`href="${link}"`));
  assert.ok(html.includes("専用リンクで初回7日間0円を申し込む"));
});

test("verified email checkout bills zero today with the existing trial lifecycle", () => {
  const params = new URLSearchParams();
  appendPersonalCheckoutPrices(params, true, { monthly: null }, true);
  assert.equal(params.get("line_items[0][price_data][unit_amount]"), "1580");
  assert.equal(params.get("line_items[1][quantity]"), null);
  assert.equal(params.get("subscription_data[trial_period_days]"), "7");
  assert.equal(params.get("payment_method_collection"), "always");
  assert.equal(params.get("metadata[trial_offer]"), "first");
  assert.equal(params.get("subscription_data[metadata][trial]"), "1");
  assert.match(params.get("custom_text[submit][message]"), /申込時に0円/);
  assert.match(params.get("custom_text[submit][message]"), /1,580円で自動更新/);
});
