import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { request } from "node:http";
import { createHash } from "node:crypto";
import {
  parseNovel,
  importNovel,
  libraryResponse,
} from "../server/library.mjs";
import { createAiServer } from "../server/ai.mjs";
async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "ddb-library-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, "private"),
    file = path.join(directory, "example.txt");
  await writeFile(
    file,
    "\uFEFF序章\r\n仅供测试的开头。\r\n第一章 相遇\r\n这是原创测试正文。\n第二章 继续\n<script>alert(1)</script>",
  );
  return { root, file };
}
test("TXT import detects chapters, stays private, supports metadata and per-chapter reads", async (t) => {
  const f = await fixture(t);
  const imported = await importNovel({
    ...f,
    title: "测试小说",
    author: "测试作者",
  });
  assert.equal(imported.chapters, 3);
  const list = await libraryResponse(f.root, "/api/ai/library");
  assert.equal(list.books[0].title, "测试小说");
  assert.ok(!JSON.stringify(list).includes("测试正文"));
  const book = await libraryResponse(f.root, `/api/ai/library/${imported.id}`);
  assert.equal(book.chapters[1].title, "第一章 相遇");
  assert.ok(!JSON.stringify(book).includes("测试正文"));
  const chapter = await libraryResponse(
    f.root,
    `/api/ai/library/${imported.id}/1`,
  );
  assert.equal(chapter.content, "这是原创测试正文。");
  await assert.rejects(importNovel({ ...f, title: "重复" }), /已导入/);
});
test("chapter splitting handles no headings and bounds unbroken text", () => {
  const chunks = parseNovel("文本".repeat(18000));
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((c) => c.content.length <= 12000));
  assert.equal(chunks.map((c) => c.content).join(""), "文本".repeat(18000));
  assert.throws(() => parseNovel("  \n  "), /正文/);
});
test("GB18030 import decodes legacy TXT", async (t) => {
  const f = await fixture(t);
  await writeFile(f.file, Buffer.from([0xd6, 0xd0, 0xce, 0xc4]));
  const result = await importNovel({ ...f, title: "编码测试" });
  const chapter = await libraryResponse(
    f.root,
    `/api/ai/library/${result.id}/0`,
  );
  assert.equal(chapter.content, "中文");
});
test("book routes reject traversal, unknown IDs and invalid chapters", async (t) => {
  const f = await fixture(t);
  const { id } = await importNovel({ ...f, title: "测试" });
  for (const route of [
    "/api/ai/library/../../ai.env",
    "/api/ai/library/%2e%2e",
    `/api/ai/library/${id}/9999`,
    "/api/ai/library/" + "a".repeat(24),
  ])
    await assert.rejects(
      libraryResponse(f.root, route),
      (e) => e.status === 404,
    );
});
test("every library route requires a valid host-bound session; logout revokes it", async (t) => {
  const f = await fixture(t),
    { id } = await importNovel({ ...f, title: "不可公开的书名" });
  const password = "only-a-test-token-with-enough-length";
  const server = createAiServer({
    origins: ["https://tools.example", "https://other.example"],
    accessHash: createHash("sha256").update(password).digest("hex"),
    libraryDir: f.root,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  async function call(route, data, cookie, host = "tools.example") {
    return new Promise((resolve, reject) => {
      const req = request(
        {
          hostname: "127.0.0.1",
          port: server.address().port,
          path: route,
          method: data ? "POST" : "GET",
          headers: {
            Host: host,
            Origin: "https://" + host,
            "Content-Type": "application/json",
            ...(cookie ? { Cookie: cookie } : {}),
          },
        },
        (res) => {
          let text = "";
          res.on("data", (chunk) => {
            text += chunk;
          });
          res.on("end", () =>
            resolve({ status: res.statusCode, headers: res.headers, text }),
          );
        },
      );
      req.on("error", reject);
      req.end(data ? JSON.stringify(data) : undefined);
    });
  }
  for (const route of [
    "/api/ai/library",
    `/api/ai/library/${id}`,
    `/api/ai/library/${id}/0`,
  ]) {
    const r = await call(route);
    assert.equal(r.status, 401);
    assert.ok(!r.text.includes("不可公开"));
  }
  const login = await call("/api/ai/login", { password });
  const cookie = login.headers["set-cookie"][0].split(";")[0];
  const result = await call("/api/ai/library", null, cookie);
  assert.equal(result.status, 200);
  assert.ok(result.text.includes("不可公开的书名"));
  assert.equal(result.headers["cache-control"], "no-store");
  assert.match(result.headers["x-robots-tag"], /noindex/);
  assert.equal(
    (await call(`/api/ai/library/${id}/0`, null, cookie, "other.example"))
      .status,
    401,
  );
  await call("/api/ai/logout", {}, cookie);
  assert.equal(
    (await call(`/api/ai/library/${id}/0`, null, cookie)).status,
    401,
  );
});
