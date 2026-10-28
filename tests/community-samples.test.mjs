import assert from "node:assert/strict";
import test from "node:test";
import { communitySamples } from "../data/community-samples.ts";
import { embedWordbookMeta, parseEmbeddedWordbookMeta, stripEmbeddedWordbookMeta } from "../lib/wordbook-meta.ts";

test("community samples cover English, Japanese and another language", () => {
  assert.deepEqual(communitySamples.map((book) => book.subject), ["英語", "国語", "多言語"]);
  assert.equal(communitySamples.reduce((sum, book) => sum + book.wordCount, 0), 300);
});

test("sample word counts, numbering and meanings stay consistent", () => {
  for (const book of communitySamples) {
    assert.equal(book.wordCount, book.words.length);
    assert.equal(book.words.length, 100);
    assert.equal(new Set(book.words.map((word) => word.english.toLocaleLowerCase())).size, book.words.length);
    for (const [index, word] of book.words.entries()) {
      assert.equal(word.no, index + 1);
      assert.ok(word.english && word.japanese);
    }
  }
});

test("community metadata round-trips without leaking into visible description", () => {
  const description = embedWordbookMeta("自作の単語帳", {
    visibility: "public", subject: "国語", creatorName: "学習者", anonymous: false,
  });
  assert.equal(stripEmbeddedWordbookMeta(description), "自作の単語帳");
  assert.deepEqual(parseEmbeddedWordbookMeta(description), {
    coverImage: null, visibility: "public", creatorName: "学習者", subject: "国語", anonymous: false,
  });
});
