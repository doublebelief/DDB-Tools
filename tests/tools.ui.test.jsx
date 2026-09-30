import React from "react";
import { afterEach, expect, test, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import Workspace from "../src/Workspace.jsx";
import App from "../src/App.jsx";
afterEach(() => {
  cleanup();
  history.replaceState(null, "", "/");
  localStorage.clear();
  delete document.modelContext;
});
const click = (name) =>
  fireEvent.click(screen.getByRole("button", { name, exact: true }));
const value = (name, v) =>
  fireEvent.change(screen.getByLabelText(name, { exact: true }), {
    target: { value: v },
  });
test("JSON formats, validates malformed data and renders a tree", async () => {
  render(<Workspace id="json" />);
  value("JSON 输入", '{"id":9007199254740993123}');
  click("格式化");
  await waitFor(() =>
    expect(screen.getByLabelText("JSON 结果").value).toContain(
      "9007199254740993123",
    ),
  );
  value("结果视图", "tree");
  expect(screen.getByText("9007199254740993123")).toBeTruthy();
  value("JSON 输入", "{bad}");
  click("校验");
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toBeTruthy(),
  );
});
test("HTML decode cannot create executable markup", async () => {
  render(<Workspace id="codec" />);
  value("编码格式", "html");
  value("输入", "&lt;img src=x onerror=alert(1)&gt;");
  click("解码");
  await waitFor(() =>
    expect(screen.getByLabelText("结果").value).toBe(
      "<img src=x onerror=alert(1)>",
    ),
  );
  expect(document.querySelector("img")).toBeNull();
});
test("timestamps convert epoch and UTC date", async () => {
  render(<Workspace id="timestamp" />);
  value("时间戳", "0");
  click("转换为日期");
  await waitFor(() =>
    expect(screen.getByText("1970-01-01T00:00:00.000Z")).toBeTruthy(),
  );
});
test("JWT shows explicit unverified state", async () => {
  render(<Workspace id="jwt" />);
  click("解析 JWT");
  await waitFor(() => expect(screen.getByText("未验证")).toBeTruthy());
  expect(screen.getByLabelText("Payload").value).toContain("DoubleDB");
});
test("UUID generates requested batch and copy action", async () => {
  render(<Workspace id="random" />);
  value("数量（1–100）", "3");
  click("生成");
  await waitFor(() =>
    expect(screen.getByLabelText("生成结果").value.split("\n")).toHaveLength(3),
  );
  click("复制结果");
  await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
});
test("hash computes a known digest", async () => {
  render(<Workspace id="hash" />);
  value("输入", "abc");
  click("计算摘要");
  await waitFor(() =>
    expect(screen.getByLabelText("十六进制摘要").value).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    ),
  );
});
test("diff marks additions and removals", async () => {
  render(<Workspace id="diff" />);
  click("比较差异");
  await waitFor(() =>
    expect(document.querySelector(".diff-added")).toBeTruthy(),
  );
  expect(document.querySelector(".diff-removed")).toBeTruthy();
});
test("QR creates a downloadable image and rejects empty input", async () => {
  render(<Workspace id="qrcode" />);
  click("生成二维码");
  await waitFor(() => expect(screen.getByAltText("生成的二维码")).toBeTruthy());
  expect(
    screen.getByRole("link", { name: "下载 PNG" }).getAttribute("download"),
  ).toBe("doubledb-qrcode.png");
  value("文本或链接", "");
  click("生成二维码");
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain("请输入"),
  );
});
test("text processing deduplicates lines", async () => {
  render(<Workspace id="text" />);
  value("输入", "a\na\nb");
  click("处理文本");
  await waitFor(() => expect(screen.getByLabelText("结果").value).toBe("a\nb"));
});
test("YAML converts both directions with ordinary decimals", async () => {
  render(<Workspace id="yaml" />);
  value("YAML 输入", "name: DDB\ncount: 14");
  click("转换并校验");
  await waitFor(() =>
    expect(screen.getByLabelText("转换结果").value).toContain('"count": 14'),
  );
  value("转换方向", "toYaml");
  value("JSON 输入", '{"value":1.5}');
  click("转换并校验");
  await waitFor(() =>
    expect(screen.getByLabelText("转换结果").value).toBe("value: 1.5\n"),
  );
});
test("SQL formats and reports invalid input", async () => {
  render(<Workspace id="sql" />);
  click("格式化");
  await waitFor(() =>
    expect(screen.getByLabelText("格式化结果").value).toContain("SELECT"),
  );
  value("SQL 输入", "select 'unterminated");
  click("格式化");
  await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
});
test("Cron renders eight dates and rejects invalid field", async () => {
  render(<Workspace id="cron" />);
  click("预览执行时间");
  await waitFor(() => expect(screen.getByText("接下来 8 次执行")).toBeTruthy());
  expect(document.querySelectorAll(".result-row")).toHaveLength(8);
  value("Cron 表达式", "90 * * * *");
  click("预览执行时间");
  await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
});
test("Markdown filters scripts, handlers, remote images, and javascript links", async () => {
  render(<Workspace id="markdown" />);
  value(
    "Markdown 输入",
    '# Test\n<svg><image href="https://example.com/track"/></svg><script>alert(1)</script><img src="https://example.com/tracker" onerror="alert(1)"><a href="javascript:alert(1)">bad</a>\n```javascript\nconst x = 1;\n```',
  );
  await waitFor(() =>
    expect(document.querySelector(".rendered h1")?.textContent).toBe("Test"),
  );
  const root = document.querySelector(".rendered");
  expect(
    root.querySelector('script,img,svg,image,[onerror],[href^="javascript:"]'),
  ).toBeNull();
  expect(root.querySelector(".hljs-keyword")).toBeTruthy();
});
test("catalog search, favorites and theme work", () => {
  render(<App />);
  expect(document.querySelectorAll(".tool-card")).toHaveLength(14);
  value("搜索工具", "base64");
  expect(document.querySelectorAll(".tool-card")).toHaveLength(1);
  click("收藏编解码");
  click("清空搜索");
  click("我的收藏");
  expect(document.querySelectorAll(".tool-card")).toHaveLength(1);
  click("切换深色模式");
  expect(document.documentElement.dataset.theme).toBe("dark");
});
test("WebMCP JSON action validates input and updates visible state", async () => {
  let tool;
  document.modelContext = {
    registerTool: vi.fn((t) => {
      tool = t;
    }),
  };
  render(<Workspace id="json" />);
  expect(tool.name).toBe("format_json");
  const result = await tool.execute({ text: '{"a":1}', compact: true });
  expect(result.result).toBe('{"a":1}');
  await waitFor(() =>
    expect(screen.getByLabelText("JSON 结果").value).toBe('{"a":1}'),
  );
  await expect(tool.execute({ text: "{bad}" })).rejects.toThrow();
  expect(screen.getByLabelText("JSON 结果").value).toBe('{"a":1}');
});
