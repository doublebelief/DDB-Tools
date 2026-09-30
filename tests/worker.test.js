import test from "node:test";
import assert from "node:assert/strict";
import { runWorker } from "./worker-helper.js";
import { evaluateRegex } from "../src/regex-engine.js";
import { LIMITS } from "../src/limits.js";
const run = (type, args) =>
  runWorker(new URL("../src/compute.worker.js", import.meta.url), {
    type,
    args,
  });
test("module worker preserves JSON precision and rejects depth, nodes and size", async () => {
  const r = await run("json", { input: '{"id":90071992547409931234}' });
  assert.match(r.result.text, /90071992547409931234/);
  for (const input of [
    " ".repeat(LIMITS.input + 1),
    "[".repeat(65) + "0" + "]".repeat(65),
    "[" + Array(10001).fill("0").join(",") + "]",
  ])
    assert.ok((await run("json", { input })).error);
  const tree = await run("json", {
    input: "[" + Array(2001).fill("0").join(",") + "]",
  });
  assert.equal(tree.result.treeAvailable, false);
});
test("module worker bounds format conversions, diff and markdown", async () => {
  assert.match(
    (await run("yaml", { input: "name: DDB", direction: "toJson" })).result,
    /DDB/,
  );
  assert.match(
    (await run("sql", { input: "select 1", language: "sql" })).result,
    /SELECT/,
  );
  assert.ok((await run("sql", { input: " ".repeat(LIMITS.sql + 1) })).error);
  assert.ok((await run("diff", { left: "x".repeat(100001), right: "" })).error);
  assert.ok(
    (await run("markdown", { input: "x".repeat(LIMITS.markdown + 1) })).error,
  );
  assert.match(
    (await run("markdown", { input: "# DDB" })).result,
    /<h1>DDB<\/h1>/,
  );
});
test("regex stops output amplification before allocating the complete result", () => {
  assert.throws(
    () =>
      evaluateRegex({
        pattern: "a",
        flags: "g",
        text: "a".repeat(2000),
        replacement: "$'",
      }),
    /替换结果超过/,
  );
  assert.throws(
    () =>
      evaluateRegex({
        pattern: "a",
        flags: "g",
        text: "a",
        replacement: "x".repeat(10001),
      }),
    /替换内容上限/,
  );
  assert.throws(
    () =>
      evaluateRegex({
        pattern: "[ab]",
        flags: "g",
        text: "a".repeat(10001),
        replacement: "",
      }),
    /替换次数/,
  );
});
test("bounded regex replacement matches JS token and Unicode semantics", () => {
  const samples = [
    ["(a)(b)?", "g", "a ab", "$$ $& $` $' $1 $2 $10 $01 $99 $00"],
    ["(?<letter>a)", "g", "ab a", "$<letter> $<missing> $1"],
    ["(?:)", "gu", "😀", "-"],
    ["a", "y", "ba", "x"],
    ["a", "i", "Aa", "!"],
    ["(a)", "g", "a", "$<name>"],
  ];
  for (const [pattern, flags, text, replacement] of samples)
    assert.equal(
      evaluateRegex({ pattern, flags, text, replacement }).replaced,
      text.replace(new RegExp(pattern, flags), replacement),
    );
});
