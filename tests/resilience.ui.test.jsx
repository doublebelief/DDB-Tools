import React from "react";
import { test, expect, afterEach, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import App from "../src/App.jsx";
import LoadBoundary from "../src/LoadBoundary.jsx";
import { Editor } from "../src/components.jsx";
import { LIMITS } from "../src/limits.js";
import { compute } from "../src/compute-client.js";
afterEach(() => {
  cleanup();
  history.replaceState(null, "", "/");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
test("invalid URL encoding shows a recoverable not-found screen", () => {
  history.replaceState(null, "", "/%FF");
  render(<App />);
  expect(screen.getByText("没有找到这个工具")).toBeTruthy();
});
test("failed dynamic module load has a recovery screen", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  function Broken() {
    throw new Error("Failed to fetch dynamically imported module");
  }
  render(
    <LoadBoundary>
      <Broken />
    </LoadBoundary>,
  );
  expect(screen.getByRole("alert").textContent).toContain("工具暂时无法打开");
  expect(screen.getByRole("button", { name: "刷新页面" })).toBeTruthy();
});
test("oversized paste and edits preserve original input", () => {
  const update = vi.fn();
  render(<Editor label="输入" value="keep me" onChange={update} />);
  const el = screen.getByLabelText("输入");
  fireEvent.change(el, { target: { value: "x".repeat(LIMITS.input + 1) } });
  expect(update).not.toHaveBeenCalled();
  expect(el.value).toBe("keep me");
  fireEvent.paste(el, {
    clipboardData: { getData: () => "x".repeat(LIMITS.input + 1) },
  });
  expect(screen.getByRole("alert").textContent).toContain("原内容已保留");
});
test("worker timeout and cancellation terminate background processing", async () => {
  const terminate = vi.fn();
  vi.stubGlobal(
    "Worker",
    class {
      postMessage() {}
      terminate() {
        terminate();
      }
    },
  );
  await expect(
    compute("json", { input: "{}" }, { timeout: 10 }),
  ).rejects.toThrow("已中止");
  expect(terminate).toHaveBeenCalledTimes(1);
  const c = new AbortController();
  const promise = compute("json", { input: "{}" }, { signal: c.signal });
  c.abort();
  await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  expect(terminate).toHaveBeenCalledTimes(2);
});
