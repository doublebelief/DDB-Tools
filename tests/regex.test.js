import test from "node:test";
import assert from "node:assert/strict";
import { runWorker } from "./worker-helper.js";
const run = (data, timeout) =>
  runWorker(new URL("../src/regex.worker.js", import.meta.url), data, timeout);
test("regex worker matches captures and replacement", async () => {
  const r = await run({
    pattern: "(foo)",
    flags: "g",
    text: "foo foo",
    replacement: "[$1]",
  });
  assert.equal(r.matches.length, 2);
  assert.deepEqual(r.matches[0].groups, ["foo"]);
  assert.equal(r.replaced, "[foo] [foo]");
});
test("regex handles zero length unicode matches without an infinite loop", async () => {
  const r = await run({
    pattern: "(?:)",
    flags: "gu",
    text: "😀",
    replacement: "-",
  });
  assert.deepEqual(
    r.matches.map((m) => m.index),
    [0, 2],
  );
});
test("regex errors are returned safely and pathological patterns can be terminated", async () => {
  assert.ok(
    (await run({ pattern: "[", flags: "g", text: "x", replacement: "" })).error,
  );
  await assert.rejects(
    run(
      {
        pattern: "(a+)+$",
        flags: "g",
        text: "a".repeat(100) + "!",
        replacement: "",
      },
      200,
    ),
    /timeout/,
  );
});
