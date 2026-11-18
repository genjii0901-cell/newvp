import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { validateContent, emptyContent, SEARCH_FIELDS } from "../lib/content-editor.ts";

const req = createRequire(import.meta.url);
const example = { ...emptyContent("example"), word_number: "1", word_english: "apple", sentence_en: "I eat an apple.", sentence_ja: "私はりんごを食べる。" };
const question = { ...emptyContent("question"), prompt: "He ( ) tennis.", answer: "plays", wrong_choices: ["play", "playing", "played"] };
const itemId = "11111111-1111-4111-8111-111111111111";

function routeHarness(results = [], authorized = true) {
  const calls = [];
  const db = { from(table) {
    const result = results.shift();
    assert.ok(result, `Unexpected DB access: ${table}`);
    const call = { table, operations: [] }; calls.push(call);
    const chain = { then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); } };
    for (const method of ["select", "eq", "ilike", "order", "range", "limit", "insert", "update", "delete", "maybeSingle", "single"]) {
      chain[method] = (...args) => { call.operations.push([method, ...args]); return chain; };
    }
    return chain;
  } };
  const source = readFileSync(new URL("../app/api/admin/content-editor/route.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, URL, Request, Response, console, require(name) {
    if (name === "@/lib/admin-auth") return { requireAdmin: async () => authorized ? null : Response.json({ ok: false }, { status: 401 }) };
    if (name === "@/lib/supabase/admin") return { getSupabaseAdmin: () => db, isSupabaseServerConfigured: () => true };
    if (name === "@/lib/content-editor") return { validateContent, SEARCH_FIELDS };
    return req(name);
  } });
  return { route: module.exports, calls };
}
const request = (method, body) => new Request("http://localhost/api/admin/content-editor", { method, body: JSON.stringify(body) });

test("例文は必須・上限を検査し、未知の公開状態を除外する", () => {
  assert.equal(validateContent("example", example).errors.length, 0);
  assert.ok(validateContent("example", {}).errors.length >= 2);
  assert.ok(validateContent("example", { ...example, sentence_en: "x".repeat(5001) }).errors.length);
  assert.equal(validateContent("example", { ...example, status: "published", source: "hacked" }).row.status, undefined);
  assert.equal(validateContent("example", { ...example, word_number: 1 }).errors.length, 1);
});
test("4択は重複する誤答、正解と同じ誤答、タグ不足、書式の不備を検出する", () => {
  assert.deepEqual(validateContent("question", question).errors, []);
  assert.ok(validateContent("question", { ...question, wrong_choices: ["play", "play", "played"] }).errors.length);
  assert.ok(validateContent("question", { ...question, wrong_choices: ["play", "playing", "plays"] }).errors.length);
  assert.ok(validateContent("question", { ...question, choice_mode: "pool", pool_tag: "" }).errors.length);
  assert.ok(validateContent("question", { ...question, item_kind: "constructor" }).errors.length);
  assert.ok(validateContent("question", { ...question, item_kind: "blank", prompt: "No blank" }).errors.length);
  assert.ok(validateContent("question", { ...question, item_kind: "underline", prompt: "No underline" }).errors.length);
  assert.deepEqual(validateContent("question", { ...question, item_kind: "underline", prompt: "He <u>go</u> home." }).errors, []);
});
test("すべてのHTTPメソッドで、未認証ならDBを読む前に拒否する", async () => {
  for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
    const { route, calls } = routeHarness([], false);
    const response = await route[method](method === "GET" ? new Request("http://localhost/api/admin/content-editor") : request(method, { kind: "example", parentId: "book" }));
    assert.equal(response.status, 401); assert.equal(calls.length, 0);
  }
});
test("一覧は指定単語帳だけをページ取得し、ワイルドカードを文字として検索する", async () => {
  const { route, calls } = routeHarness([{ data: [], count: 42, error: null }]);
  const response = await route.GET(new Request("http://localhost/api/admin/content-editor?kind=example&parentId=book-A&page=2&field=sentence_en&query=100%25"));
  assert.equal(response.headers.get("cache-control"), "no-store");
  const data = await response.json(); assert.equal(data.count, 42);
  assert.ok(calls[0].operations.some((op) => JSON.stringify(op) === JSON.stringify(["eq", "wordbook_id", "book-A"])));
  assert.ok(calls[0].operations.some((op) => JSON.stringify(op) === JSON.stringify(["range", 20, 39])));
  assert.ok(calls[0].operations.some((op) => op[0] === "ilike" && op[2] === "%100\\%%"));
});
test("検索対象の任意列指定を拒否する", async () => {
  const { route, calls } = routeHarness();
  assert.equal((await route.GET(new Request("http://localhost/api/admin/content-editor?kind=example&parentId=book&field=status"))).status, 400);
  assert.equal(calls.length, 0);
});
test("例文を追加すると単語帳の番号と英語を照合し、下書きで末尾へ保存する", async () => {
  const { route, calls } = routeHarness([{ data: [{ number: "1", english: "apple" }], error: null }, { data: [{ sort_order: 7 }], error: null }, { data: { id: itemId }, error: null }]);
  const response = await route.POST(request("POST", { kind: "example", parentId: "book-A", item: { ...example, status: "published" } }));
  assert.equal(response.status, 200);
  const row = calls[2].operations.find((op) => op[0] === "insert")[1];
  assert.equal(row.wordbook_id, "book-A"); assert.equal(row.status, "draft"); assert.equal(row.source, "manual"); assert.equal(row.sort_order, 8);
});
test("番号と英語の組み合わせが違えば、書き込まずに止める", async () => {
  const { route, calls } = routeHarness([{ data: [{ number: "1", english: "book" }], error: null }]);
  assert.equal((await route.POST(request("POST", { kind: "example", parentId: "book", item: example }))).status, 400);
  assert.equal(calls.length, 1); assert.ok(!calls[0].operations.some((op) => ["insert", "update"].includes(op[0])));
});
test("別セットの問題IDでは更新できず404になる。セットIDと問題IDを両方指定する", async () => {
  const { route, calls } = routeHarness([{ data: null, error: null }]);
  assert.equal((await route.PATCH(request("PATCH", { kind: "question", parentId: "set-A", id: itemId, item: question }))).status, 404);
  const filters = calls[0].operations.filter((op) => op[0] === "eq");
  assert.equal(JSON.stringify(filters), JSON.stringify([["eq", "set_id", "set-A"], ["eq", "id", itemId]]));
});
test("削除も単語帳IDと例文IDで範囲を制限する", async () => {
  const { route, calls } = routeHarness([{ data: { id: itemId }, error: null }]);
  assert.equal((await route.DELETE(request("DELETE", { kind: "example", parentId: "book-A", id: itemId }))).status, 200);
  assert.equal(JSON.stringify(calls[0].operations.filter((op) => op[0] === "eq")), JSON.stringify([["eq", "wordbook_id", "book-A"], ["eq", "id", itemId]]));
});
test("重複例文を上書きせず、409で利用者向けメッセージを返す", async () => {
  const { route } = routeHarness([{ data: [{ number: "1", english: "apple" }], error: null }, { data: null, error: { code: "23505", message: "DB internal details" } }]);
  const response = await route.PATCH(request("PATCH", { kind: "example", parentId: "book", id: itemId, item: example }));
  assert.equal(response.status, 409); assert.ok(!(await response.text()).includes("DB internal details"));
});
