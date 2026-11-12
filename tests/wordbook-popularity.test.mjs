import assert from "node:assert/strict";
import test from "node:test";
import { estimateWordbookPopularity } from "../lib/wordbook-popularity.ts";

test("counts distinct users per wordbook", () => {
  const result = estimateWordbookPopularity([
    { user_id: "a", wordbook_id: "b1" },
    { user_id: "a", wordbook_id: "b1" },
    { user_id: "b", wordbook_id: "b1" },
    { user_id: "a", wordbook_id: "b2" },
  ]);
  assert.deepEqual(result, { b1: { actual: 2, estimated: 2 }, b2: { actual: 1, estimated: 1 } });
});

test("spreads unattributed users by each book's share", () => {
  const rows = [];
  for (let i = 0; i < 6; i += 1) rows.push({ user_id: `p${i}`, wordbook_id: "popular" });
  for (let i = 0; i < 2; i += 1) rows.push({ user_id: `q${i}`, wordbook_id: "small" });
  for (let i = 0; i < 4; i += 1) rows.push({ user_id: `u${i}`, wordbook_id: null });
  // 不明の印刷をしたが、別の単語帳で数えられている人は足さない
  rows.push({ user_id: "p0", wordbook_id: null });
  const result = estimateWordbookPopularity(rows);
  assert.deepEqual(result.popular, { actual: 6, estimated: 9 }); // 6 + 4×6/8
  assert.deepEqual(result.small, { actual: 2, estimated: 3 }); // 2 + 4×2/8
});

test("ignores rows without a user", () => {
  assert.deepEqual(estimateWordbookPopularity([{ user_id: null, wordbook_id: "x" }]), {});
});
