import React, { useEffect, useRef, useState } from "react";
async function request(route, data, signal) {
  const response = await fetch(`/api/ai/${route}`, {
    method: data === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: data === undefined ? {} : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal,
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok)
    throw Object.assign(
      new Error(value.error || "书架暂时不可用，请稍后重试"),
      { status: response.status },
    );
  return value;
}
function readPreference(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function savePreference(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
export default function NovelReader() {
  const [authenticated, setAuthenticated] = useState(null),
    [password, setPassword] = useState("");
  const [books, setBooks] = useState([]),
    [book, setBook] = useState(null),
    [chapter, setChapter] = useState(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [query, setQuery] = useState("");
  const [fontSize, setFontSize] = useState(() => {
    const v = readPreference("ddb:reader:font", 19);
    return [16, 19, 22, 25, 28].includes(v) ? v : 19;
  });
  const [theme, setTheme] = useState(() => {
    const v = readPreference("ddb:reader:theme", "paper");
    return ["paper", "light", "dark"].includes(v) ? v : "paper";
  });
  const [progress, setProgress] = useState(0);
  const content = useRef(null),
    controller = useRef(null),
    position = useRef(null),
    saveTimer = useRef(null),
    loggedIn = useRef(false);
  function persist() {
    if (position.current)
      savePreference(`ddb:reader:progress:${position.current.id}`, {
        chapter: position.current.chapter,
        fraction: position.current.fraction,
      });
  }
  function clearPrivate() {
    persist();
    controller.current?.abort();
    loggedIn.current = false;
    setAuthenticated(false);
    setBooks([]);
    setBook(null);
    setChapter(null);
    setPassword("");
    setQuery("");
    position.current = null;
    setBusy(false);
  }
  function handleError(e) {
    if (e.name === "AbortError") return;
    if (e.status === 401) clearPrivate();
    setError(e.message);
  }
  function operation() {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError("");
    return abort;
  }
  async function shelf() {
    persist();
    const abort = operation();
    setBook(null);
    setChapter(null);
    setQuery("");
    try {
      const data = await request("library", undefined, abort.signal);
      if (abort.signal.aborted) return;
      setBooks(data.books);
      loggedIn.current = true;
      setAuthenticated(true);
    } catch (e) {
      handleError(e);
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  }
  useEffect(() => {
    shelf();
    const abort = new AbortController();
    async function check() {
      if (!loggedIn.current) return;
      try {
        const data = await request("session", undefined, abort.signal);
        if (!abort.signal.aborted && !data.authenticated) {
          clearPrivate();
          setError("登录已失效，请重新登录");
        }
      } catch (e) {
        if (e.name !== "AbortError") {
          clearPrivate();
          setError("无法确认登录状态，请重新登录");
        }
      }
    }
    const timer = setInterval(check, 60000);
    const visibility = () => {
      if (!document.hidden) check();
      else persist();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", persist);
    return () => {
      persist();
      abort.abort();
      controller.current?.abort();
      clearInterval(timer);
      clearTimeout(saveTimer.current);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", persist);
    };
  }, []);
  useEffect(() => {
    savePreference("ddb:reader:font", fontSize);
  }, [fontSize]);
  useEffect(() => {
    savePreference("ddb:reader:theme", theme);
  }, [theme]);
  useEffect(() => {
    if (!chapter || !content.current) return;
    const element = content.current;
    element.scrollTop =
      (element.scrollHeight - element.clientHeight) *
      (position.current?.fraction || 0);
    element.focus();
  }, [chapter]);
  async function login(event) {
    event.preventDefault();
    const abort = operation();
    try {
      await request("login", { password }, abort.signal);
      if (abort.signal.aborted) return;
      setPassword("");
      await shelf();
    } catch (e) {
      handleError(e);
      if (!abort.signal.aborted) setBusy(false);
    }
  }
  async function logout() {
    clearPrivate();
    setError("");
    try {
      await request("logout", {});
    } catch (e) {
      if (e.status !== 401)
        setError("页面内容已清除，但服务器退出未确认，请重试退出");
    }
  }
  async function openBook(id) {
    persist();
    const abort = operation();
    setChapter(null);
    setQuery("");
    try {
      const meta = await request(`library/${id}`, undefined, abort.signal);
      const saved = readPreference(`ddb:reader:progress:${id}`, {});
      const index =
        Number.isInteger(saved.chapter) &&
        saved.chapter >= 0 &&
        saved.chapter < meta.chapters.length
          ? saved.chapter
          : 0;
      const data = await request(
        `library/${id}/${index}`,
        undefined,
        abort.signal,
      );
      if (abort.signal.aborted) return;
      const fraction =
        typeof saved.fraction === "number"
          ? Math.min(1, Math.max(0, saved.fraction))
          : 0;
      position.current = { id, chapter: index, fraction };
      setProgress(fraction);
      setBook(meta);
      setChapter(data);
    } catch (e) {
      handleError(e);
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  }
  async function changeChapter(index) {
    if (!book || index < 0 || index >= book.chapters.length) return;
    persist();
    const abort = operation();
    setChapter(null);
    try {
      const data = await request(
        `library/${book.id}/${index}`,
        undefined,
        abort.signal,
      );
      if (abort.signal.aborted) return;
      position.current = { id: book.id, chapter: index, fraction: 0 };
      persist();
      setProgress(0);
      setChapter(data);
    } catch (e) {
      handleError(e);
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  }
  function onScroll(event) {
    if (!position.current || !chapter) return;
    const element = event.currentTarget,
      available = element.scrollHeight - element.clientHeight;
    const fraction =
      available > 0
        ? Math.min(1, Math.max(0, element.scrollTop / available))
        : 1;
    position.current.fraction = fraction;
    setProgress(fraction);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(persist, 150);
  }
  const percentage =
    book && chapter
      ? Math.min(
          100,
          Math.round(((chapter.index + progress) / book.chapters.length) * 100),
        )
      : 0;
  return (
    <section className="novel-library" aria-label="个人书架">
      <div className="library-notice">
        <span>🔒 私有阅读空间</span>
        <small>书单与正文需登录访问 · 小说不发送给 AI</small>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {!authenticated ? (
        <div className="library-gate">
          <div className="book-emblem" aria-hidden="true">
            阅
          </div>
          <h2>留一处安静的阅读角落</h2>
          <p>
            使用个人版访问口令，打开你的专属书架。
            <br />与 AI 助理共用登录，访客无法查看书单和正文。
          </p>
          <form onSubmit={login}>
            <label>
              个人访问口令
              <input
                type="password"
                autoComplete="current-password"
                aria-label="书架访问口令"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength={256}
                required
              />
            </label>
            <button className="button primary" disabled={busy}>
              解锁书架
            </button>
          </form>
          {authenticated === null && !busy && (
            <button className="button" onClick={shelf}>
              重新连接
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="library-actions">
            <button className="button" disabled={busy} onClick={shelf}>
              {book ? "返回书架" : "刷新书架"}
            </button>
            <button className="button" onClick={logout}>
              退出个人空间
            </button>
          </div>
          {!book ? (
            <>
              {!!books.length && (
                <label className="library-search">
                  搜索书名或作者
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="找一本想读的书…"
                  />
                </label>
              )}
              {!books.length ? (
                <div className="library-empty">
                  <div className="book-emblem" aria-hidden="true">
                    书
                  </div>
                  <h2>书架还是空的</h2>
                  <p>
                    你的阅读空间已经准备好了。
                    <br />
                    导入 TXT 小说后，会在这里显示书籍和章节。
                  </p>
                </div>
              ) : (
                <div className="books-grid">
                  {books
                    .filter((b) =>
                      `${b.title} ${b.author}`
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                    )
                    .map((b, i) => (
                      <button
                        className={`book-card book-color-${i % 3}`}
                        key={b.id}
                        onClick={() => openBook(b.id)}
                        disabled={busy}
                      >
                        <span className="book-cover">
                          <span>私人藏书</span>
                          <strong>{b.title}</strong>
                          <small>{b.author || "作者未标注"}</small>
                        </span>
                        <span className="book-info">
                          <strong>{b.title}</strong>
                          <small>
                            {b.chapterCount} 节 · 约{" "}
                            {Math.ceil(b.characters / 10000)} 万字
                          </small>
                          <span>打开 / 继续阅读 →</span>
                        </span>
                      </button>
                    ))}
                </div>
              )}
              {!!books.length &&
                !books.some((b) =>
                  `${b.title} ${b.author}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                ) && <p className="empty">没有匹配的书籍</p>}
            </>
          ) : (
            <div className={`novel-reader reader-${theme}`}>
              <header className="reader-heading">
                <h2>{book.title}</h2>
                <span>
                  {book.author || "私人藏书"} · 阅读约 {percentage}%
                </span>
              </header>
              <div className="reader-controls">
                <label>
                  章节目录
                  <select
                    aria-label="章节目录"
                    value={chapter?.index ?? position.current?.chapter ?? 0}
                    disabled={busy}
                    onChange={(e) => changeChapter(Number(e.target.value))}
                  >
                    {book.chapters.map((c) => (
                      <option key={c.index} value={c.index}>
                        {c.index + 1}. {c.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  字号
                  <select
                    aria-label="阅读字号"
                    value={fontSize}
                    onChange={(e) => setFontSize(Number(e.target.value))}
                  >
                    {[16, 19, 22, 25, 28].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  纸张
                  <select
                    aria-label="阅读主题"
                    value={theme}
                    onChange={(e) => setTheme(e.target.value)}
                  >
                    <option value="paper">暖纸</option>
                    <option value="light">日间</option>
                    <option value="dark">夜间</option>
                  </select>
                </label>
              </div>
              {chapter ? (
                <article
                  className="reader-body"
                  aria-label="小说正文"
                  ref={content}
                  tabIndex={0}
                  onScroll={onScroll}
                  style={{ fontSize }}
                >
                  <h3>{chapter.title}</h3>
                  <div className="novel-text">{chapter.content}</div>
                  <p className="chapter-end">— 本节完 —</p>
                </article>
              ) : (
                <div className="reader-loading">
                  {busy ? "正在加载章节…" : "章节加载失败，请从目录重新选择"}
                </div>
              )}
              <div className="reader-pagination">
                <button
                  className="button"
                  disabled={busy || !chapter || chapter.index === 0}
                  onClick={() => changeChapter(chapter.index - 1)}
                >
                  上一节
                </button>
                <span>
                  {chapter ? chapter.index + 1 : "—"} / {book.chapters.length}
                </span>
                <button
                  className="button"
                  disabled={
                    busy ||
                    !chapter ||
                    chapter.index === book.chapters.length - 1
                  }
                  onClick={() => changeChapter(chapter.index + 1)}
                >
                  下一节
                </button>
              </div>
            </div>
          )}
          <p className="reading-privacy">
            阅读位置与字号仅保存在当前浏览器，两个域名分别记录。退出后清除页面正文；已保存的阅读位置会保留。
          </p>
        </>
      )}
      {busy && !book && <p role="status">正在加载…</p>}
    </section>
  );
}
