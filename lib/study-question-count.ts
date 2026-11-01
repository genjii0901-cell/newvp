export type StudyQuestionCount = "10" | "20" | "50" | "all";

// Study size depends on the chosen range, not on the printing or membership cap.
export function getStudyQuestionCount(available: number, selection: StudyQuestionCount, customCount = 0) {
  const total = Number.isSafeInteger(available) && available > 0 ? available : 0;
  const requested = Number.isSafeInteger(customCount) && customCount > 0
    ? customCount
    : selection === "all" ? total : Number(selection);
  return Math.min(total, Number.isSafeInteger(requested) && requested > 0 ? requested : total);
}
