import assert from "node:assert/strict";
import test from "node:test";
import { effectiveAccessPlan, hasAdminFeatureAccess } from "../lib/plan-access.ts";

test("admin benefits require both the server role and verified browser session", () => {
  assert.equal(hasAdminFeatureAccess("admin", true), true);
  assert.equal(hasAdminFeatureAccess("admin", false), false);
  assert.equal(hasAdminFeatureAccess("user", true), false);
  assert.equal(hasAdminFeatureAccess("teacher", true), false);
  assert.equal(hasAdminFeatureAccess(null, true), false);
});

test("admin access unlocks Teacher features without changing the billing plan", () => {
  assert.equal(effectiveAccessPlan("free", true), "teacher");
  assert.equal(effectiveAccessPlan("personal", true), "teacher");
  assert.equal(effectiveAccessPlan("free", false), "free");
  assert.equal(effectiveAccessPlan("personal", false), "personal");
});
