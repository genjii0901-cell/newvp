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

test("admin trial is only for the confirmed owner account", async () => {
  const { isAdminOwnerAccount, adminOwnerEmails } = await import("../lib/plan-access.ts");
  const owners = adminOwnerEmails("owner@example.com");
  assert.equal(isAdminOwnerAccount({ email: "Owner@Example.com", email_confirmed_at: "2026-01-01" }, owners), true);
  assert.equal(isAdminOwnerAccount({ email: "owner@example.com", email_confirmed_at: null }, owners), false);
  assert.equal(isAdminOwnerAccount({ email: "customer@example.com", email_confirmed_at: "2026-01-01" }, owners), false);
  assert.equal(isAdminOwnerAccount(null, owners), false);
});
