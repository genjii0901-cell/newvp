import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { getStudyQuestionCount } from "../lib/study-question-count.ts";
import { registrationIntentForPlan, FREE_ACCOUNT_LABEL, FREE_STUDY_DESCRIPTION } from "../lib/registration-plans.ts";
import { getPricingVariant } from "../lib/pricing-experiment.ts";
import { normalizeLocalRedirectPath } from "../lib/safe-redirect.ts";

test("all selected words remain available for study beyond old membership caps", () => {
  for (const count of [0, 20, 25, 100, 315, 1900, 4500]) {
    assert.equal(getStudyQuestionCount(count, "all"), count);
  }
  assert.equal(getStudyQuestionCount(4500, "50"), 50);
  assert.equal(getStudyQuestionCount(12, "20"), 12);
  assert.equal(getStudyQuestionCount(4500, "all", 1234), 1234);
  assert.equal(getStudyQuestionCount(-1, "all"), 0);
});

test("registration always offers the choice flow, independent of old experiment assignment", () => {
  assert.equal(getPricingVariant(), "choice");
  assert.match(FREE_ACCOUNT_LABEL, /無料会員.*都度課金/);
  assert.match(FREE_STUDY_DESCRIPTION, /語数制限なしで無料/);
  assert.match(FREE_STUDY_DESCRIPTION, /1ページ50円/);
});

test("switching to the free account cannot retain a Personal checkout intent", () => {
  assert.equal(registrationIntentForPlan("free", "personal"), "free");
  assert.equal(registrationIntentForPlan("free", "login"), "free");
  assert.equal(registrationIntentForPlan("free", "purchase"), "purchase");
  assert.equal(registrationIntentForPlan("personal", "purchase"), "personal");
  assert.equal(registrationIntentForPlan("personal", "free"), "personal");
  assert.equal(registrationIntentForPlan("free", null), null);
});

test("registration return paths retain the study tab and reject external redirects", () => {
  assert.equal(normalizeLocalRedirectPath("/wordbooks/70?tab=listen"), "/wordbooks/70?tab=listen");
  assert.equal(normalizeLocalRedirectPath("//example.com"), "/");
  assert.equal(normalizeLocalRedirectPath("/\\example.com"), "/");
});

test("public registration entry points share one chooser and study signup links are handled", () => {
  const home = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.equal((home.match(/<RegistrationPlanPicker\b/g) ?? []).length, 2);
  assert.match(home, /printAuth === "free"/);
  assert.match(home, /const pricingVariant = getPricingVariant\(\)/);
});

test("study panels have no old count caps while retaining paid feature clamps", () => {
  const listen = fs.readFileSync(new URL("../app/wordbooks/[id]/listen-panel.tsx", import.meta.url), "utf8");
  const quiz = fs.readFileSync(new URL("../app/wordbooks/[id]/quiz-panel.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(listen, /FREE_WORD_LIMIT/);
  assert.doesNotMatch(quiz, /FREE_MAX_QUESTIONS/);
  for (const panel of [listen, quiz]) assert.match(panel, /isPaid \? saved : clampForFree\(saved\)/);
  assert.match(listen, /innerGapMs\}.*locked=\{!isPaid\}/);
  assert.match(quiz, /locked=\{!isPaid\} onChange=\{\(autoSpeak\)/);
});
