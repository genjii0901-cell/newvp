import assert from "node:assert/strict";
import test from "node:test";
import { ensureStripeCatalogPrice, findStripeCatalogPrice } from "../lib/stripe-price-catalog.ts";
import { PERSONAL_MONTHLY_PRICE, PERSONAL_INTRO_PRICE } from "../lib/personal-pricing.ts";

const monthly = { id: "price_monthly", active: true, livemode: true, currency: "jpy", unit_amount: 1580, recurring: { interval: "month", interval_count: 1 } };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });

test("an existing matching live monthly price is reused without any write", async () => {
  const calls = [];
  const id = await ensureStripeCatalogPrice("sk_live_fixture", PERSONAL_MONTHLY_PRICE, async (url, init) => {
    calls.push({ url, init });
    return json({ data: [monthly] });
  });
  assert.equal(id, "price_monthly");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, undefined);
});

for (const [label, wrong] of [
  ["legacy 780 yen", { unit_amount: 780 }],
  ["test price", { livemode: false }],
  ["inactive price", { active: false }],
  ["yearly interval", { recurring: { interval: "year", interval_count: 1 } }],
]) {
  test(`a mismatched ${label} price is rejected, never changed`, async () => {
    let calls = 0;
    await assert.rejects(ensureStripeCatalogPrice("sk_live_fixture", PERSONAL_MONTHLY_PRICE, async () => {
      calls += 1;
      return json({ data: [{ ...monthly, ...wrong }] });
    }), /Stripe/);
    assert.equal(calls, 1);
  });
}

test("a missing intro price is created as a one-time 380 yen catalog price", async () => {
  let body;
  const id = await ensureStripeCatalogPrice("sk_live_fixture", PERSONAL_INTRO_PRICE, async (_url, init) => {
    if (!init.method) return json({ data: [] });
    body = init.body;
    assert.equal(init.headers["Idempotency-Key"], `vpp-catalog-${PERSONAL_INTRO_PRICE.lookupKey}`);
    return json({ ...monthly, id: "price_intro", unit_amount: 380, recurring: null });
  });
  assert.equal(id, "price_intro");
  assert.equal(body.get("unit_amount"), "380");
  assert.equal(body.get("recurring[interval]"), null);
  assert.equal(body.get("lookup_key"), PERSONAL_INTRO_PRICE.lookupKey);
});

test("a concurrent creator reuses the winning price instead of duplicating it", async () => {
  let calls = 0;
  const id = await ensureStripeCatalogPrice("sk_live_fixture", PERSONAL_MONTHLY_PRICE, async () => {
    calls += 1;
    if (calls === 1) return json({ data: [] });
    if (calls === 2) return json({}, 400);
    return json({ data: [monthly] });
  });
  assert.equal(id, "price_monthly");
  assert.equal(calls, 3);
});

test("a failed Stripe lookup fails closed", async () => {
  await assert.rejects(findStripeCatalogPrice("sk_live_fixture", PERSONAL_MONTHLY_PRICE, async () => json({}, 401)));
});
