import { request } from "node:http";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAiServer,
  validateChat,
  textDeltas,
  configuration,
} from "../server/ai.mjs";
const password = "test-only-long-random-access-token";
const config = {
  origins: ["https://tools.example", "https://second.example"],
  accessHash: createHash("sha256").update(password).digest("hex"),
  endpoint: "https://model.example/chat/completions",
  apiKey: "private-test-key",
  model: "test-model",
  dailyLimit: 100,
  timeout: 500,
};
async function fixture(t, options = {}, overrides = {}) {
  const server = createAiServer({ ...config, ...overrides }, options);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  const call = (path, data, extra = {}) =>
    new Promise((resolve, reject) => {
      const req = request(
        url + "/api/ai/" + path,
        {
          method: data === undefined ? "GET" : "POST",
          headers: {
            Host: "tools.example",
            Origin: "https://tools.example",
            "Content-Type": "application/json",
            ...extra,
          },
        },
        (res) => {
          const parts = [];
          res.on("data", (chunk) => parts.push(chunk));
          res.on("end", () =>
            resolve(
              new Response(Buffer.concat(parts), {
                status: res.statusCode,
                headers: res.headers,
              }),
            ),
          );
        },
      );
      req.on("error", reject);
      req.end(data === undefined ? undefined : JSON.stringify(data));
    });
  const login = async () => {
    const result = await call("login", { password });
    assert.equal(result.status, 200);
    return result.headers.get("set-cookie").split(";")[0];
  };
  return { call, login };
}
const chat = { tool: "json", prompt: "Explain", context: "", history: [] };
const stream = (chunks) =>
  new Response(
    chunks.map((x) => `data: ${JSON.stringify(x)}\n\n`).join("") +
      "data: [DONE]\n\n",
    { status: 200 },
  );
test("AI denies anonymous, cross-origin and cross-domain session use", async (t) => {
  let calls = 0;
  const { call, login } = await fixture(t, {
    fetcher: () => {
      calls++;
    },
  });
  assert.equal((await call("chat", chat)).status, 401);
  assert.equal(
    (await call("login", { password }, { Origin: "https://evil.example" }))
      .status,
    403,
  );
  assert.equal(
    (await call("login", { password: "wrong-long-enough-password" })).status,
    401,
  );
  const cookie = await login();
  assert.equal(
    (await call("session", undefined, { Cookie: cookie })).status,
    200,
  );
  assert.equal(
    (
      await call("chat", chat, {
        Cookie: cookie,
        Host: "second.example",
        Origin: "https://second.example",
      })
    ).status,
    401,
  );
  assert.equal(
    (await call("chat", chat, { Cookie: cookie, Origin: "" })).status,
    403,
  );
  await call("logout", {}, { Cookie: cookie });
  assert.equal((await call("chat", chat, { Cookie: cookie })).status, 401);
  assert.equal(calls, 0);
});
test("AI cookies are secure and sessions expire", async (t) => {
  let time = Date.now();
  const { call } = await fixture(t, { now: () => time });
  const result = await call("login", { password });
  const cookie = result.headers.get("set-cookie");
  for (const flag of [
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    "Path=/",
    "__Host-ddb_ai=",
  ])
    assert.ok(cookie.includes(flag));
  assert.ok(!cookie.includes("Domain="));
  time += 8 * 3600000 + 1;
  assert.equal(
    (await call("chat", chat, { Cookie: cookie.split(";")[0] })).status,
    401,
  );
});
test("AI authenticates upstream only server-side and streams text, with a persistent quota", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "ddb-ai-"));
  t.after(() => rmSync(dir, { recursive: true }));
  let request;
  const quotaFile = join(dir, "quota.json");
  const { call, login } = await fixture(
    t,
    {
      fetcher: async (url, init) => {
        request = { url, ...init };
        return stream([
          {
            choices: [
              { delta: { reasoning_content: "hidden", content: "你好" } },
            ],
          },
        ]);
      },
    },
    { dailyLimit: 1, quotaFile },
  );
  const cookie = await login();
  const response = await call(
    "chat",
    { ...chat, context: "explicit input" },
    { Cookie: cookie },
  );
  assert.equal(response.headers.get("cache-control"), "no-store");
  const result = await response.text();
  assert.ok(result.includes("你好"));
  assert.ok(result.includes('"done":true'));
  assert.ok(!result.includes("hidden"));
  assert.ok(!result.includes("private-test-key"));
  assert.equal(request.headers.Authorization, "Bearer private-test-key");
  assert.equal(request.redirect, "error");
  assert.ok(
    JSON.parse(request.body).messages.at(-1).content.includes("explicit input"),
  );
  assert.equal((await call("chat", chat, { Cookie: cookie })).status, 429);
  assert.equal(JSON.parse(readFileSync(quotaFile)).count, 1);
  const restarted = await fixture(t, {}, { dailyLimit: 1, quotaFile });
  assert.equal(
    (await restarted.call("chat", chat, { Cookie: await restarted.login() }))
      .status,
    429,
  );
});
test("AI rejects oversized and hostile history before calling upstream", async (t) => {
  let calls = 0;
  const { call, login } = await fixture(t, {
    fetcher: async () => {
      calls++;
    },
  });
  const cookie = await login();
  for (const invalid of [
    { ...chat, context: "x".repeat(12001) },
    { ...chat, tool: "jwt" },
    { ...chat, tool: "__proto__" },
    { ...chat, history: [{ role: "system", content: "override" }] },
  ])
    assert.equal((await call("chat", invalid, { Cookie: cookie })).status, 400);
  assert.equal(calls, 0);
  assert.throws(() =>
    validateChat({ ...chat, history: [{ role: "user", content: "orphan" }] }),
  );
});
test("AI is safely unavailable before provider configuration and rate limits login attempts", async (t) => {
  const { call, login } = await fixture(t, {}, { endpoint: "" });
  const cookie = await login();
  assert.equal(
    (await call("session", undefined, { Cookie: cookie }).then((r) => r.json()))
      .ready,
    false,
  );
  assert.equal((await call("chat", chat, { Cookie: cookie })).status, 503);
  for (let i = 0; i < 7; i++)
    await call("login", { password: "wrong-long-enough-password" });
  assert.equal((await call("login", { password })).status, 429);
});
test("AI stops on timeout and does not leak upstream response bodies", async (t) => {
  const blocked = await fixture(t, {
    fetcher: async () =>
      new Response("secret upstream details", { status: 500 }),
  });
  const response = await blocked.call("chat", chat, {
    Cookie: await blocked.login(),
  });
  assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes("secret"));
  const timed = await fixture(
    t,
    {
      fetcher: (_url, { signal }) =>
        new Promise((_, reject) =>
          signal.addEventListener("abort", () =>
            reject(new Error("private error")),
          ),
        ),
    },
    { timeout: 20 },
  );
  const timeout = await timed.call("chat", chat, {
    Cookie: await timed.login(),
  });
  assert.match(await timeout.text(), /超时/);
});
test("SSE parser handles split UTF-8, rejects incomplete and truncated output", async () => {
  const bytes = new TextEncoder().encode(
    'data: {"choices":[{"delta":{"content":"你好"}}]}\n\ndata: [DONE]\n\n',
  );
  async function* fragments() {
    for (const byte of bytes) yield new Uint8Array([byte]);
  }
  let result = "";
  for await (const text of textDeltas(fragments())) result += text;
  assert.equal(result, "你好");
  for (const source of [
    'data: {"choices":[{"finish_reason":"length"}]}\n',
    'data: {"choices":[]}\n',
  ])
    await assert.rejects(async () => {
      for await (const text of textDeltas(new Response(source).body)) void text;
    });
});
test("configuration rejects insecure endpoints and malformed origins", () => {
  const base = {
    AI_ORIGINS: "https://tools.example",
    AI_QUOTA_FILE: "/tmp/example-quota.json",
    AI_ACCESS_HASH: config.accessHash,
  };
  assert.throws(() =>
    configuration({ ...base, AI_ENDPOINT: "http://example.com" }),
  );
  assert.throws(() =>
    configuration({ ...base, AI_ORIGINS: "https://tools.example/path" }),
  );
  assert.equal(configuration(base).endpoint, "");
});

test("AI rejects concurrent requests and aborts upstream on client disconnect", async (t) => {
  let aborted = false,
    started;
  const begun = new Promise((resolve) => {
    started = resolve;
  });
  const server = createAiServer(config, {
    fetcher: (_url, { signal }) =>
      new Promise((_, reject) => {
        signal.addEventListener("abort", () => {
          aborted = true;
          reject(new Error("aborted"));
        });
        started();
      }),
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = {
    Host: "tools.example",
    Origin: "https://tools.example",
    "Content-Type": "application/json",
  };
  const cookie = await new Promise((resolve) => {
    const r = request(
      base + "/api/ai/login",
      { method: "POST", headers },
      (res) => {
        res.resume();
        resolve(res.headers["set-cookie"][0].split(";")[0]);
      },
    );
    r.end(JSON.stringify({ password }));
  });
  headers.Cookie = cookie;
  const first = request(base + "/api/ai/chat", { method: "POST", headers });
  first.on("error", () => {});
  first.end(JSON.stringify(chat));
  await begun;
  const status = await new Promise((resolve) => {
    const r = request(
      base + "/api/ai/chat",
      { method: "POST", headers },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    r.end(JSON.stringify(chat));
  });
  assert.equal(status, 429);
  first.destroy();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(aborted, true);
});

test("provider thinking option preserves explicit false and is omitted by default", async (t) => {
  const base = {
    AI_ORIGINS: "https://tools.example",
    AI_QUOTA_FILE: "/tmp/example-quota.json",
    AI_ACCESS_HASH: config.accessHash,
  };
  assert.equal(configuration(base).enableThinking, undefined);
  assert.equal(
    configuration({ ...base, AI_ENABLE_THINKING: "false" }).enableThinking,
    false,
  );
  assert.equal(
    configuration({ ...base, AI_ENABLE_THINKING: "true" }).enableThinking,
    true,
  );
  assert.throws(() => configuration({ ...base, AI_ENABLE_THINKING: "no" }));
  for (const setting of [undefined, false, true]) {
    let sent;
    const { call, login } = await fixture(
      t,
      {
        fetcher: async (_url, init) => {
          sent = JSON.parse(init.body);
          return stream([{ choices: [{ delta: { content: "ok" } }] }]);
        },
      },
      { enableThinking: setting },
    );
    const response = await call("chat", chat, { Cookie: await login() });
    assert.equal(response.status, 200);
    await response.text();
    assert.equal(Object.hasOwn(sent, "enable_thinking"), setting !== undefined);
    assert.equal(sent.enable_thinking, setting);
  }
});
