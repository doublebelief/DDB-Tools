import { Worker } from "node:worker_threads";
import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
const source = readFileSync(
  new URL("../src/regex.worker.js", import.meta.url),
  "utf8",
);
function run(data, timeout = 1000) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      `const {parentPort}=require('node:worker_threads');global.self=global;global.postMessage=x=>parentPort.postMessage(x);${source};parentPort.on('message',data=>self.onmessage({data}));`,
      { eval: true },
    );
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error("timeout"));
    }, timeout);
    worker.on("message", (v) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(v);
    });
    worker.on("error", reject);
    worker.postMessage(data);
  });
}
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
