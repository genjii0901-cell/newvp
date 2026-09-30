import assert from "node:assert/strict";
import test from "node:test";
import { planLimits } from "../lib/plan-limits.ts";

test("Free keeps the monthly allowance and one-page limit", () => {
  assert.equal(planLimits.free.maxGenerations, 5);
  assert.equal(planLimits.free.maxPages, 1);
});

test("paid plans do not have a monthly generation cap", () => {
  assert.equal(planLimits.personal.maxGenerations, undefined);
  assert.equal(planLimits.teacher.maxGenerations, undefined);
  assert.equal(planLimits.personal.maxPages, 20);
});
