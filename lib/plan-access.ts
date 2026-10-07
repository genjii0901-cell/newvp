import type { Plan } from "./plan-limits";

export function hasAdminFeatureAccess(role: unknown, verifiedBrowserSession: boolean): boolean {
  return role === "admin" && verifiedBrowserSession;
}

export function effectiveAccessPlan(plan: Plan, adminAccess: boolean): Plan {
  return adminAccess ? "teacher" : plan;
}
