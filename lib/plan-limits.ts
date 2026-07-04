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
  free: { period: "day", maxGenerations: 2, maxPages: 1, maxWords: 50, maxTotalGenerations: 10 },
  personal: { period: "month", maxGenerations: 300, maxPages: 5 },
  teacher: { period: "month", maxGenerations: 5000, maxWords: 1900 },
};

export function getPageCount(wordCount: number, wordsPerPage = WORDS_PER_PAGE) {
  if (!Number.isFinite(wordCount) || wordCount <= 0) return 0;
  return Math.ceil(wordCount / wordsPerPage);
}

export function getPlanLimitLabel(plan: Plan, rule: PlanLimit) {
  if (typeof rule.maxPages === "number") {
    return `${rule.maxPages}ページ`;
  }
  if (typeof rule.maxWords === "number") {
    return `${rule.maxWords}語`;
  }
  return "制限あり";
}
