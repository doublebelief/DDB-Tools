import React from "react";
import { test, expect, afterEach, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
  waitFor,
  act,
} from "@testing-library/react";
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
  vi.restoreAllMocks();
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
  fireEvent.click(
    within(screen.getByRole("navigation", { name: "章节切换" })).getByRole(
      "button",
      { name: "上一章" },
    ),
  );
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
  fireEvent.click(
    within(screen.getByRole("navigation", { name: "章节切换" })).getByRole(
      "button",
      { name: "下一章" },
    ),
  );
  await screen.findByLabelText("书架访问口令");
  expect(screen.queryByLabelText("小说正文")).toBeNull();
  expect(screen.queryByText("测试藏书")).toBeNull();
});

async function openReader() {
  mock();
  const view = render(<NovelReader />);
  fireEvent.click(await screen.findByRole("button", { name: /测试藏书/ }));
  await screen.findByLabelText("小说正文");
  return view;
}
test("chapter-end controls and persistent navigation respect first/last chapter bounds", async () => {
  await openReader();
  const bottom = within(screen.getByRole("navigation", { name: "章末翻章" }));
  expect(bottom.getByRole("button", { name: "上一章" }).disabled).toBe(true);
  fireEvent.click(bottom.getByRole("button", { name: "下一章" }));
  await screen.findByRole("heading", { name: "第二章" });
  expect(screen.getByRole("button", { name: "已是最后一章" }).disabled).toBe(
    true,
  );
  const persistent = within(
    screen.getByRole("navigation", { name: "章节切换" }),
  );
  expect(persistent.getByRole("button", { name: "下一章" }).disabled).toBe(
    true,
  );
  fireEvent.click(persistent.getByRole("button", { name: "上一章" }));
  await screen.findByRole("heading", { name: "第一章" });
});
test("in-page fullscreen supports Escape, cleanup, and preserves reading position", async () => {
  const view = await openReader();
  const article = screen.getByLabelText("小说正文");
  Object.defineProperty(article, "scrollHeight", {
    configurable: true,
    value: 1000,
  });
  Object.defineProperty(article, "clientHeight", {
    configurable: true,
    value: 200,
  });
  article.scrollTop = 400;
  fireEvent.scroll(article);
  fireEvent.click(screen.getByRole("button", { name: "全屏阅读" }));
  expect(screen.getByRole("dialog", { name: "全屏阅读" })).toBeTruthy();
  expect(document.body.style.overflow).toBe("hidden");
  expect(article.scrollTop).toBe(400);
  fireEvent.keyDown(screen.getByRole("button", { name: "退出全屏" }), {
    key: "Escape",
  });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.body.style.overflow).toBe("");
  expect(article.scrollTop).toBe(400);
  fireEvent.click(screen.getByRole("button", { name: "全屏阅读" }));
  view.unmount();
  expect(document.body.style.overflow).toBe("");
  expect(document.querySelector("[inert]")).toBeNull();
});
test("native fullscreen state follows browser exit and request rejection keeps reading mode", async () => {
  await openReader();
  const element = screen.getByLabelText("小说正文").closest(".novel-reader");
  let current = null;
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => current,
  });
  element.requestFullscreen = vi.fn(async () => {
    current = element;
    document.dispatchEvent(new Event("fullscreenchange"));
  });
  fireEvent.click(screen.getByRole("button", { name: "全屏阅读" }));
  await waitFor(() => expect(element.requestFullscreen).toHaveBeenCalledOnce());
  act(() => {
    current = null;
    document.dispatchEvent(new Event("fullscreenchange"));
  });
  expect(screen.queryByRole("dialog")).toBeNull();
  element.requestFullscreen = vi
    .fn()
    .mockRejectedValue(new Error("not supported"));
  fireEvent.click(screen.getByRole("button", { name: "全屏阅读" }));
  await waitFor(() => expect(element.requestFullscreen).toHaveBeenCalledOnce());
  expect(screen.getByRole("button", { name: "退出全屏" })).toBeTruthy();
  delete document.fullscreenElement;
});
test("session expiry exits fullscreen and clears private content", async () => {
  await openReader();
  fireEvent.click(screen.getByRole("button", { name: "全屏阅读" }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ error: "登录已失效" }, { status: 401 })),
  );
  fireEvent.click(
    within(screen.getByRole("navigation", { name: "章节切换" })).getByRole(
      "button",
      { name: "下一章" },
    ),
  );
  await screen.findByLabelText("书架访问口令");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.body.style.overflow).toBe("");
  expect(screen.queryByLabelText("小说正文")).toBeNull();
});
test("late native fullscreen completion is closed after leaving reading mode", async () => {
  await openReader();
  const element = screen.getByLabelText("小说正文").closest(".novel-reader");
  let resolve,
    current = null;
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => current,
  });
  const exit = vi.fn(async () => {
    current = null;
    document.dispatchEvent(new Event("fullscreenchange"));
  });
  Object.defineProperty(document, "exitFullscreen", {
    configurable: true,
    value: exit,
  });
  element.requestFullscreen = () =>
    new Promise((r) => {
      resolve = r;
    });
  fireEvent.click(screen.getByRole("button", { name: "全屏阅读" }));
  fireEvent.click(screen.getByRole("button", { name: "退出全屏" }));
  await act(async () => {
    current = element;
    document.dispatchEvent(new Event("fullscreenchange"));
    resolve();
  });
  expect(exit).toHaveBeenCalledOnce();
  expect(screen.queryByRole("dialog")).toBeNull();
  delete document.fullscreenElement;
  delete document.exitFullscreen;
});
