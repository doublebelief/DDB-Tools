import React, { useState } from "react";
import { test, expect, afterEach, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import AiAssistant from "../src/AiAssistant.jsx";
import { AiProvider, useAiTool } from "../src/ai-context.jsx";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function Tool() {
  const [value, setValue] = useState('{"original":true}');
  useAiTool("json", value, setValue);
  return (
    <>
      <textarea
        aria-label="tool input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <AiAssistant id="json" />
    </>
  );
}
function start(ready = true, answer = '```json\n{"answer":42}\n```') {
  const requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, init) => {
      if (url.endsWith("/session"))
        return Response.json({ authenticated: true, ready });
      if (url.endsWith("/chat")) {
        requests.push(JSON.parse(init.body));
        return new Response(
          JSON.stringify({ text: answer }) +
            "\n" +
            JSON.stringify({ done: true }) +
            "\n",
        );
      }
      return Response.json({ ok: true });
    }),
  );
  render(
    <AiProvider>
      <Tool />
    </AiProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /AI 助理/ }));
  return requests;
}
async function ask() {
  const input = await screen.findByLabelText("向 AI 提问");
  fireEvent.change(input, { target: { value: "help" } });
  fireEvent.click(screen.getByRole("button", { name: "发送" }));
  await screen.findByRole("button", { name: "检查并填入代码 1" });
}
test("AI never attaches input by default, validates application and supports undo", async () => {
  const requests = start();
  await ask();
  expect(requests[0].context).toBe("");
  expect(screen.getByLabelText("tool input").value).toBe('{"original":true}');
  fireEvent.click(screen.getByRole("button", { name: "检查并填入代码 1" }));
  fireEvent.click(screen.getByRole("button", { name: "确认填入" }));
  await waitFor(() =>
    expect(screen.getByLabelText("tool input").value).toBe('{"answer":42}'),
  );
  fireEvent.click(screen.getByRole("button", { name: "撤销上次填入" }));
  expect(screen.getByLabelText("tool input").value).toBe('{"original":true}');
});
test("AI sends only explicitly previewed attachment and clears it after sending", async () => {
  const requests = start();
  await screen.findByLabelText("向 AI 提问");
  fireEvent.click(screen.getByRole("checkbox"));
  expect(screen.getByLabelText("即将发送的工具内容").value).toBe(
    '{"original":true}',
  );
  fireEvent.change(screen.getByLabelText("即将发送的工具内容"), {
    target: { value: "redacted" },
  });
  await ask();
  expect(requests[0].context).toBe("redacted");
  expect(screen.queryByLabelText("即将发送的工具内容")).toBeNull();
});
test("invalid AI JSON preserves input and AI output is rendered as text", async () => {
  start(true, "<img src=x onerror=alert(1)>\n```json\ninvalid\n```");
  await ask();
  expect(document.querySelector(".ai-answer img")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "检查并填入代码 1" }));
  fireEvent.click(screen.getByRole("button", { name: "确认填入" }));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("tool input").value).toBe('{"original":true}');
});
test("unconfigured AI disables sending and leaves ordinary tool editable", async () => {
  start(false);
  await screen.findByText("模型尚未配置");
  expect(screen.getByRole("button", { name: "发送" }).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "关闭" }));
  fireEvent.change(screen.getByLabelText("tool input"), {
    target: { value: "still works" },
  });
  expect(screen.getByLabelText("tool input").value).toBe("still works");
});
