import type { Plan } from "./plan-limits";

export function hasAdminFeatureAccess(role: unknown, verifiedBrowserSession: boolean): boolean {
  return role === "admin" && verifiedBrowserSession;
}

export function effectiveAccessPlan(plan: Plan, adminAccess: boolean): Plan {
  return adminAccess ? "teacher" : plan;
}

// 「管理者の試用」（自分のプランを切り替えて試す）を使えるのは、サイト運営者本人のアカウントだけ。
// お客さんのアカウントには絶対に出さないため、ロールではなくメールアドレス（確認済み）で判定する。
// ADMIN_OWNER_EMAILS（カンマ区切り）で上書きできる。
const DEFAULT_ADMIN_OWNER_EMAILS = ["genjii0901@gmail.com"];

export function adminOwnerEmails(raw: string | undefined = process.env.ADMIN_OWNER_EMAILS): string[] {
  const list = (raw ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return list.length > 0 ? list : DEFAULT_ADMIN_OWNER_EMAILS;
}

export function isAdminOwnerAccount(
  user: { email?: string | null; email_confirmed_at?: string | null } | null | undefined,
  owners: string[] = adminOwnerEmails(),
): boolean {
  const email = user?.email?.trim().toLowerCase();
  if (!email || !user?.email_confirmed_at) return false;
  return owners.includes(email);
}
