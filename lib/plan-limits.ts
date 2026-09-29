export type Plan = "free" | "personal" | "teacher";

export type PlanLimit = {
  period: "day" | "month";
  maxGenerations: number;
  maxPages?: number;
  maxWords?: number;
  maxTotalGenerations?: number;
};

export const WORDS_PER_PAGE = 50;

export const planLimits: Record<Plan, PlanLimit> = {
  free: { period: "month", maxGenerations: 5, maxPages: 1, maxWords: 50 },
  personal: { period: "month", maxGenerations: 300, maxPages: 20 },
  teacher: { period: "month", maxGenerations: 5000, maxWords: 1900 },
};

export function getPageCount(wordCount: number, wordsPerPage = WORDS_PER_PAGE) {
  if (!Number.isFinite(wordCount) || wordCount <= 0) return 0;
  return Math.ceil(wordCount / wordsPerPage);
}

export function getPlanLimitLabel(plan: Plan, rule: PlanLimit) {
  if (typeof rule.maxWords === "number") {
    return `${rule.maxWords}語`;
  }
  if (plan === "personal") {
    return "1回20ページまで";
  }
  return "制限なし";
}
