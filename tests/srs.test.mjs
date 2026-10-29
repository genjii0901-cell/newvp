import assert from "node:assert/strict";
import test from "node:test";
import { applyAnswer, dueWords, forecast, retention, statusOf, summarize, wordKey } from "../lib/srs.ts";

const DAY = 86_400_000;
const words = [
  { no: 1, english: "apple" },
  { no: 2, english: "book" },
  { no: 3, english: "cat" },
];

test("correct answers move up a box and lengthen the interval", () => {
  const t0 = 1_000_000_000_000;
  const a = applyAnswer(undefined, true, t0);
  assert.equal(a.box, 1);
  assert.equal(a.due, t0 + 1 * DAY);
  const b = applyAnswer(a, true, t0 + DAY);
  assert.equal(b.box, 2);
  assert.equal(b.due, t0 + DAY + 2 * DAY);
});

test("a wrong answer resets to box 0 and is due within minutes", () => {
  const t0 = 1_000_000_000_000;
  let r = undefined;
  for (let i = 0; i < 5; i += 1) r = applyAnswer(r, true, t0 + i * DAY);
  const wrong = applyAnswer(r, false, t0 + 6 * DAY);
  assert.equal(wrong.box, 0);
  assert.ok(wrong.due - (t0 + 6 * DAY) <= 15 * 60_000);
  assert.equal(wrong.wrong, 1);
});

test("retention decays with time and is about 90% when the interval elapses", () => {
  const t0 = 1_000_000_000_000;
  const r = applyAnswer(undefined, true, t0);
  assert.ok(Math.abs(retention(r, t0) - 1) < 1e-9);
  assert.ok(Math.abs(retention(r, t0 + DAY) - 0.9) < 0.01);
  assert.ok(retention(r, t0 + 10 * DAY) < retention(r, t0 + DAY));
  assert.equal(retention(undefined, t0), 0);
});

test("summary counts unseen, learning, mastered and due words", () => {
  const t0 = 1_000_000_000_000;
  const progress = {};
  let r = undefined;
  for (let i = 0; i < 5; i += 1) r = applyAnswer(r, true, t0 + i * DAY);
  progress[wordKey(words[0])] = r; // box 5 = 定着
  progress[wordKey(words[1])] = applyAnswer(undefined, false, t0 + 4 * DAY); // 学習中
  const now = t0 + 4 * DAY + 3_600_000;
  const s = summarize(words, progress, now);
  assert.equal(s.total, 3);
  assert.equal(s.newCount, 1);
  assert.equal(statusOf(progress[wordKey(words[0])], now), "mastered");
  assert.equal(s.masteredCount, 1);
  assert.equal(s.learningCount, 1);
  assert.equal(s.dueCount, 1); // 間違えた語だけ期限切れ
  assert.deepEqual(dueWords(words, progress, now).map((w) => w.english), ["book"]);
});

test("forecast starts near current memory and falls over time", () => {
  const t0 = 1_000_000_000_000;
  const progress = { [wordKey(words[0])]: applyAnswer(undefined, true, t0) };
  const points = forecast(words, progress, 30, t0);
  assert.equal(points.length, 31);
  assert.equal(points[0].percent, 100);
  assert.ok(points[30].percent < points[7].percent);
  assert.equal(forecast(words, {}, 5, t0)[0].percent, 0);
});
