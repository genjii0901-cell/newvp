import assert from "node:assert/strict";
import test from "node:test";
import { csvCell, toCsv } from "../lib/csv.ts";

test("CSV quotes commas, quotes and newlines", () => {
  assert.equal(csvCell('a,"b"\nc'), '"a,""b""\nc"');
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(12), "12");
});

test("CSV neutralizes spreadsheet formulas but keeps English suffixes", () => {
  assert.equal(csvCell("=HYPERLINK(\"x\")"), "\"'=HYPERLINK(\"\"x\"\")\"");
  assert.equal(csvCell("+1"), "'+1");
  assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(csvCell("-1+2"), "'-1+2");
  assert.equal(csvCell("-ful"), "-ful");
  assert.equal(csvCell("〜を食べる"), "〜を食べる");
});

test("CSV output has BOM and CRLF", () => {
  assert.equal(toCsv([["番号", "単語"], [1, "apple"]]), "﻿番号,単語\r\n1,apple\r\n");
});
