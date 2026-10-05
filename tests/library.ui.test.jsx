import React from "react";
import { test, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import NovelReader from "../src/NovelReader.jsx";
const id = "a".repeat(24);
const book = {
  id,
  title: "测试藏书",
  author: "作者",
  characters: 100,
  chapters: [
    { index: 0, title: "第一章" },
    { index: 1, title: "第二章" },
  ],
};
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});
function mock({ authenticated = true, empty = false } = {}) {
  const calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, init) => {
      calls.push({ url, body: init.body });
      if (url.endsWith("/login")) {
        authenticated = true;
        return Response.json({ authenticated: true });
      }
      if (url.endsWith("/logout")) {
        authenticated = false;
        return Response.json({ ok: true });
      }
      if (url.endsWith("/session")) return Response.json({ authenticated });
      if (!authenticated)
        return Response.json({ error: "请先登录个人空间" }, { status: 401 });
      if (url.endsWith("/library"))
        return Response.json({
          books: empty ? [] : [{ ...book, chapterCount: 2 }],
        });
      if (url.endsWith("/" + id)) return Response.json(book);
      const index = Number(url.split("/").at(-1));
      return Response.json({
        index,
        title: book.chapters[index].title,
        content: "私有正文 <img src=x onerror=alert(1)>",
      });
    }),
  );
  return calls;
}
test("locked bookshelf shows no title or text until login", async () => {
  mock({ authenticated: false });
  render(<NovelReader />);
  await screen.findByLabelText("书架访问口令");
  expect(screen.queryByText("测试藏书")).toBeNull();
  fireEvent.change(screen.getByLabelText("书架访问口令"), {
    target: { value: "test-password-is-long-enough" },
  });
  fireEvent.click(screen.getByRole("button", { name: "解锁书架" }));
  await screen.findByRole("button", { name: /测试藏书/ });
});
test("reader navigates, restores progress, renders plain text, and clears on logout", async () => {
  localStorage.setItem(
    `ddb:reader:progress:${id}`,
    JSON.stringify({ chapter: 1, fraction: 0 }),
  );
  const calls = mock();
  render(<NovelReader />);
  fireEvent.click(await screen.findByRole("button", { name: /测试藏书/ }));
  await screen.findByRole("heading", { name: "第二章" });
  expect(screen.getByLabelText("小说正文").querySelector("img")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "上一节" }));
  await screen.findByRole("heading", { name: "第一章" });
  fireEvent.change(screen.getByLabelText("阅读字号"), {
    target: { value: "25" },
  });
  expect(screen.getByLabelText("小说正文").style.fontSize).toBe("25px");
  fireEvent.click(screen.getByRole("button", { name: "退出个人空间" }));
  expect(screen.queryByLabelText("小说正文")).toBeNull();
  expect(screen.queryByText("测试藏书")).toBeNull();
  expect(calls.some((c) => c.url.includes("/chat"))).toBe(false);
  expect(localStorage.getItem(`ddb:reader:progress:${id}`)).not.toContain(
    "正文",
  );
});
test("empty bookshelf has an import hint without fabricated books", async () => {
  mock({ empty: true });
  render(<NovelReader />);
  await screen.findByText("书架还是空的");
  expect(screen.queryByLabelText("小说正文")).toBeNull();
});

test("expired session clears book metadata and content on the next chapter request", async () => {
  mock();
  render(<NovelReader />);
  fireEvent.click(await screen.findByRole("button", { name: /测试藏书/ }));
  await screen.findByLabelText("小说正文");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ error: "登录已失效" }, { status: 401 })),
  );
  fireEvent.click(screen.getByRole("button", { name: "下一节" }));
  await screen.findByLabelText("书架访问口令");
  expect(screen.queryByLabelText("小说正文")).toBeNull();
  expect(screen.queryByText("测试藏书")).toBeNull();
});
