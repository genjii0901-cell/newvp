export type SignupPlan = "free" | "personal";
export type RegistrationIntent = "login" | "free" | "personal" | "purchase" | null;

export const FREE_ACCOUNT_LABEL = "無料会員（印刷は都度課金）";
export const FREE_STUDY_DESCRIPTION = "聞き流し・四択は語数制限なしで無料。印刷するときだけ1ページ50円。月額料金はかかりません。";

export function registrationIntentForPlan(plan: SignupPlan, current: RegistrationIntent): RegistrationIntent {
  if (!current) return null;
  if (plan === "personal") return "personal";
  return current === "purchase" ? "purchase" : "free";
}
