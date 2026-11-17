import assert from "node:assert/strict";
import test from "node:test";
import { parseDelimited, parseExamples, parseQuestions } from "../lib/content-import.ts";

test("セル内改行を含むExcel貼り付けを壊さず読む", () => {
  const t = parseDelimited('番号\t例文\n1\t"A.\nB."\n2\tC.');
  assert.deepEqual(t.rows, [["1", "A.\nB."], ["2", "C."]]);
});

test("例文: 縦並び（同じ番号を繰り返す）で複数付く", () => {
  const r = parseExamples("番号\t英語\t例文\t訳\n1\tapple\tI eat an apple.\t私はりんごを食べる。\n1\tapple\tApples are red.\tりんごは赤い。\n2\tbook\tRead a book.\t本を読む。");
  assert.equal(r.examples.length, 3);
  assert.equal(r.wordCount, 2);
  assert.deepEqual(r.errors, []);
  assert.equal(r.examples[1].sentenceJa, "りんごは赤い。");
});

test("例文: 横並び（例文1・訳1・例文2・訳2）", () => {
  const r = parseExamples("番号,例文1,訳1,例文2,訳2\n1,A cat.,猫。,Two cats.,猫2匹。\n2,A dog.,犬。,,");
  assert.equal(r.examples.length, 3);
  assert.equal(r.examples[1].sentenceEn, "Two cats.");
  assert.equal(r.examples[1].sentenceJa, "猫2匹。");
});

test("例文: 1セルに複数行は例文と訳を同じ順番で対応させ、数が違えば訳を空にして警告", () => {
  const ok = parseExamples('番号\t例文\t訳\n1\t"A.\nB."\t"あ。\nい。"');
  assert.deepEqual(ok.examples.map((e) => e.sentenceJa), ["あ。", "い。"]);
  const bad = parseExamples('番号\t例文\t訳\n1\t"A.\nB."\t"あ。"');
  assert.equal(bad.examples.length, 2);
  assert.equal(bad.examples[0].sentenceJa, "");
  assert.equal(bad.errors.length, 1);
});

test("例文: 必須の列がなければエラー、同じ例文は重複させない", () => {
  assert.ok(parseExamples("foo\tbar\n1\t2").errors.length > 0);
  assert.equal(parseExamples("番号\t例文\n1\tX.\n1\tX.").examples.length, 1);
});

test("問題: 4択は誤答列でも選択肢列でも書ける。方式は自動で決まる", () => {
  const r = parseQuestions(
    "種類\t問題\t答え\t誤答1\t誤答2\t誤答3\t解説\n4択\tHe ( ) tennis.\tplays\tplay\tplaying\tplayed\t三単現\n" +
      "穴埋め\tShe ___ a book.\treads\t\t\t\t\n" +
      "一問一答\t日本の首都は？\t東京\t\t\t\t"
  );
  assert.equal(r.items.length, 3);
  assert.equal(r.items[0].choiceMode, "fixed");
  assert.deepEqual(r.items[0].wrongChoices, ["play", "playing", "played"]);
  assert.equal(r.items[1].choiceMode, "random");
  assert.deepEqual(r.errors, []);
  const c = parseQuestions("問題\t答え\t選択肢\tタグ\nI ( ) here.\tam\tis / are / be\tbe動詞");
  assert.deepEqual(c.items[0].wrongChoices, ["is", "are", "be"]);
  assert.equal(c.items[0].choiceMode, "fixed");
});

test("問題: タグ方式、下線・穴埋めの書式ミス、固定なのに誤答不足を指摘", () => {
  const r = parseQuestions("種類\t問題\t答え\t方式\t誤答1\t タグ\n下線\tHe <u>go</u> home.\tgoes\tタグ\t\t三単現\n下線\tHe go home.\tgoes\t\t\t\n穴埋め\tNo blank\tx\t固定\ta\t");
  assert.equal(r.items[0].choiceMode, "pool");
  assert.equal(r.items[0].poolTag, "三単現");
  assert.equal(r.errors.length, 3);
});
