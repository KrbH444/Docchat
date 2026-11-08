import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeArabic, tokenize, isMostlyArabic } from "../lib/text.ts";
import { chunkPages } from "../lib/chunk.ts";
import { Bm25Index } from "../lib/bm25.ts";

test("normalizes Arabic letter variants and diacritics", () => {
  assert.equal(normalizeArabic("إجازة"), "اجازه");
  assert.equal(normalizeArabic("مُسْتَشْفَى"), "مستشفي");
});

test("tokenize strips the Arabic definite article and stopwords", () => {
  assert.deepEqual(tokenize("ما هي الإجازة السنوية؟"), ["اجازه", "سنويه"]);
  assert.deepEqual(tokenize("What is the meal allowance?"), ["meal", "allowance"]);
});

test("detects Arabic vs English text", () => {
  assert.equal(isMostlyArabic("كم مدة إجازة الحج"), true);
  assert.equal(isMostlyArabic("How long is Hajj leave"), false);
});

test("chunks keep page numbers and respect size", () => {
  const long = "Sentence number one is here. ".repeat(100);
  const chunks = chunkPages("d1", "doc.pdf", [
    { page: 1, text: long },
    { page: 2, text: "Short page." },
  ]);
  assert.ok(chunks.length >= 3);
  assert.ok(chunks.every((c) => c.text.length <= 900));
  assert.equal(chunks.at(-1)?.page, 2);
});

function sampleIndex(): Bm25Index {
  const index = new Bm25Index();
  for (const name of ["handbook-en.md", "leave-policy-ar.md"]) {
    const text = readFileSync(new URL(`../samples/${name}`, import.meta.url), "utf-8");
    const pages = text.split(/\n(?=## )/).map((t, i) => ({ page: i + 1, text: t }));
    index.add(chunkPages(name, name, pages));
  }
  return index;
}

test("BM25 finds the right English section", () => {
  const top = sampleIndex().search("How many remote days per week?", 3);
  assert.match(top[0].chunk.text, /Remote work/);
});

test("BM25 finds the right Arabic section despite spelling variants", () => {
  const index = sampleIndex();
  assert.match(index.search("كم مدة اجازة الحج؟", 3)[0].chunk.text, /الحج/);
  assert.match(index.search("هل يمكن ترحيل رصيد الإجازة السنوية", 3)[0].chunk.text, /ترحيل/);
});

test("removing a document drops its chunks", () => {
  const index = sampleIndex();
  const before = index.size;
  index.removeDoc("leave-policy-ar.md");
  assert.ok(index.size < before);
  assert.equal(index.search("الحج").length, 0);
});
