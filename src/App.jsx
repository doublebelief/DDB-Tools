import AiAssistant from "./AiAssistant.jsx";
import { AiProvider } from "./ai-context.jsx";
import LoadBoundary from "./LoadBoundary.jsx";
import React, { useEffect, useRef, useState, Suspense, lazy } from "react";
import {
  Code2,
  Braces,
  Binary,
  Clock3,
  KeyRound,
  Fingerprint,
  Hash,
  Regex,
  GitCompareArrows,
  QrCode,
  CaseSensitive,
  FileJson2,
  Database,
  CalendarClock,
  FileText,
  LayoutGrid,
  ShieldCheck,
  Timer,
  Type,
  Star,
  LockKeyhole,
  Menu,
  X,
  Moon,
  Sun,
  Search,
  SearchX,
  ChevronRight,
} from "lucide-react";
const Icons = {
  Code2,
  Braces,
  Binary,
  Clock3,
  KeyRound,
  Fingerprint,
  Hash,
  Regex,
  GitCompareArrows,
  QrCode,
  CaseSensitive,
  FileJson2,
  Database,
  CalendarClock,
  FileText,
  LayoutGrid,
  ShieldCheck,
  Timer,
  Type,
  Star,
  LockKeyhole,
  Menu,
  X,
  Moon,
  Sun,
  Search,
  SearchX,
  ChevronRight,
  Github: Code2,
};
import { tools, groups } from "./catalog";
const Workspace = lazy(() => import("./Workspace.jsx"));
const Icon = ({ name, ...props }) => {
  const C = Icons[name] || Icons.Code2;
  return <C size={20} strokeWidth={1.8} {...props} />;
};
const readPref = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
function currentRoute() {
  try {
    return decodeURIComponent(location.pathname.split("/")[1] || "");
  } catch {
    return "invalid-route";
  }
}
export default function App() {
  const [route, setRoute] = useState(currentRoute),
    [category, setCategory] = useState("全部工具"),
    [search, setSearch] = useState(""),
    [menu, setMenu] = useState(false);
  const [favorites, setFavorites] = useState(() => {
    const v = readPref("ddb:favorites", []);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  });
  const [theme, setTheme] = useState(() =>
    readPref(
      "ddb:theme",
      matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
    ),
  );
  const searchRef = useRef(null);
  const tool = tools.find((t) => t.id === route);
  useEffect(() => {
    const f = () => setRoute(currentRoute());
    addEventListener("popstate", f);
    return () => removeEventListener("popstate", f);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("ddb:theme", JSON.stringify(theme));
    } catch {}
  }, [theme]);
  useEffect(() => {
    try {
      localStorage.setItem("ddb:favorites", JSON.stringify(favorites));
    } catch {}
  }, [favorites]);
  useEffect(() => {
    document.title = tool
      ? `${tool.name} · DoubleDB 工具箱`
      : "DoubleDB 工具箱 · 开发常用工具，打开即用";
  }, [tool]);
  useEffect(() => {
    const f = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") setMenu(false);
    };
    addEventListener("keydown", f);
    return () => removeEventListener("keydown", f);
  }, []);
  function navigate(id = "") {
    history.pushState(null, "", id ? `/${id}` : "/");
    setRoute(id);
    setSearch("");
    setMenu(false);
    window.scrollTo(0, 0);
  }
  function star(id) {
    setFavorites((x) =>
      x.includes(id) ? x.filter((v) => v !== id) : [...x, id],
    );
  }
  const displayed = tools.filter((t) =>
    search
      ? `${t.name} ${t.en} ${t.tags}`
          .toLowerCase()
          .includes(search.toLowerCase())
      : category === "我的收藏"
        ? favorites.includes(t.id)
        : category === "全部工具" || t.group === category,
  );
  return (
    <AiProvider key={route}>
      <div className="app">
        {menu && (
          <button
            className="scrim"
            aria-label="关闭导航"
            onClick={() => setMenu(false)}
          />
        )}
        <aside className={`sidebar ${menu ? "open" : ""}`}>
          <a
            href="/"
            className="brand"
            onClick={(e) => {
              e.preventDefault();
              navigate();
              setCategory("全部工具");
            }}
          >
            <span className="brand-symbol">
              [<b>D</b>]
            </span>
            <span>
              <strong>DoubleDB</strong>
              <small>开发者的日常工具箱</small>
            </span>
          </a>
          <div className="nav-label">工作空间</div>
          <nav aria-label="工具分类">
            {[...groups, "我的收藏"].map((g, i) => (
              <button
                key={g}
                className={`nav-item ${!tool && category === g ? "active" : ""}`}
                onClick={() => {
                  setCategory(g);
                  navigate();
                }}
              >
                <Icon
                  name={
                    [
                      "LayoutGrid",
                      "Braces",
                      "ShieldCheck",
                      "Timer",
                      "Type",
                      "Star",
                    ][i]
                  }
                />
                <span>{g}</span>
                <small>
                  {g === "全部工具"
                    ? 14
                    : g === "我的收藏"
                      ? favorites.length
                      : tools.filter((t) => t.group === g).length}
                </small>
              </button>
            ))}
          </nav>
          <div className="nav-label tool-label">快速访问</div>
          <nav className="quick-nav" aria-label="快速访问">
            {tools.slice(0, 4).map((t) => (
              <a
                key={t.id}
                className={`nav-item ${route === t.id ? "active" : ""}`}
                href={`/${t.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(t.id);
                }}
              >
                <Icon name={t.icon} />
                <span>{t.name}</span>
              </a>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <Icon name="ShieldCheck" size={21} />
            <div>
              <strong>本地处理，安心使用</strong>
              <p>普通工具在本地处理；AI 仅发送你主动提交的内容。</p>
            </div>
          </div>
          <div className="sidebar-foot">
            <span>DoubleDB 工具箱</span>
            <span>v1.0</span>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <button
              className="icon-button mobile-menu"
              aria-label="打开导航"
              onClick={() => setMenu(!menu)}
            >
              <Icon name="Menu" />
            </button>
            <div className="breadcrumb">
              工具箱 <span>/</span> <strong>{tool?.name || "工作空间"}</strong>
            </div>
            <div className="top-actions">
              <AiAssistant id={tool?.id} />
              <span className="local-label">
                <Icon name="LockKeyhole" size={14} />
                工具本地运行
              </span>
              <button
                className="icon-button"
                aria-label={theme === "light" ? "切换深色模式" : "切换浅色模式"}
                onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              >
                <Icon name={theme === "light" ? "Moon" : "Sun"} />
              </button>
              <a
                className="icon-button"
                href="https://github.com/doublebelief/DDB-Tools"
                aria-label="GitHub 源代码"
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="Github" />
              </a>
            </div>
          </header>
          <main>
            <div className="page-heading">
              <div>
                <div className="eyebrow">
                  {tool ? tool.en : "YOUR EVERYDAY DEV TOOLKIT"}
                </div>
                <h1>{tool ? tool.name : "开发常用工具，打开即用。"}</h1>
                <p>
                  {tool ? tool.desc : "把繁琐的小事交给工具，把时间留给创造。"}
                </p>
              </div>
              {tool ? (
                <button
                  className={`button ${favorites.includes(tool.id) ? "favorited" : ""}`}
                  onClick={() => star(tool.id)}
                >
                  <Icon name="Star" size={17} />
                  {favorites.includes(tool.id) ? "已收藏" : "收藏工具"}
                </button>
              ) : (
                <span className="tool-count">
                  <b>14</b>
                  <span>款实用工具</span>
                </span>
              )}
            </div>
            {tool ? (
              <LoadBoundary key={tool.id}>
                <Suspense fallback={<div className="empty">正在加载工具…</div>}>
                  <Workspace key={tool.id} id={tool.id} />
                </Suspense>
              </LoadBoundary>
            ) : route ? (
              <div className="empty">
                <h2>没有找到这个工具</h2>
                <button className="button primary" onClick={() => navigate()}>
                  返回工具箱
                </button>
              </div>
            ) : (
              <>
                <div className="search-box">
                  <Icon name="Search" size={22} />
                  <input
                    ref={searchRef}
                    aria-label="搜索工具"
                    placeholder="搜索工具，例如 JSON、时间戳、Base64…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {search ? (
                    <button
                      className="icon-button"
                      aria-label="清空搜索"
                      onClick={() => setSearch("")}
                    >
                      <Icon name="X" size={16} />
                    </button>
                  ) : (
                    <kbd>⌘ / Ctrl K</kbd>
                  )}
                </div>
                <div className="category-bar">
                  {[...groups, "我的收藏"].map((g) => (
                    <button
                      key={g}
                      className={category === g ? "selected" : ""}
                      onClick={() => setCategory(g)}
                    >
                      {g}
                    </button>
                  ))}
                </div>
                <div className="section-heading">
                  <h2>
                    {search ? "搜索结果" : category}
                    <span>{displayed.length}</span>
                  </h2>
                  <span>简单、专注、随时可用</span>
                </div>
                <div className="tool-grid">
                  {displayed.map((t) => (
                    <article key={t.id} className="tool-card">
                      <button
                        className={`star-button ${favorites.includes(t.id) ? "favorited" : ""}`}
                        aria-label={`${favorites.includes(t.id) ? "取消收藏" : "收藏"}${t.name}`}
                        onClick={() => star(t.id)}
                      >
                        <Icon name="Star" size={18} />
                      </button>
                      <a
                        href={`/${t.id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          navigate(t.id);
                        }}
                      >
                        <div className={`tool-icon ${t.accent}`}>
                          <Icon name={t.icon} size={25} />
                        </div>
                        <h3>{t.name}</h3>
                        <p>{t.desc}</p>
                        <div className="card-meta">
                          <span>{t.en}</span>
                          <Icon name="ChevronRight" size={17} />
                        </div>
                      </a>
                    </article>
                  ))}
                </div>
                {displayed.length === 0 && (
                  <div className="empty">
                    <Icon
                      name={category === "我的收藏" ? "Star" : "SearchX"}
                      size={36}
                    />
                    <h2>
                      {category === "我的收藏" && !search
                        ? "还没有收藏的工具"
                        : "没有找到匹配的工具"}
                    </h2>
                    <p>
                      {category === "我的收藏" && !search
                        ? "点击工具卡片上的星标，把常用工具放在这里。"
                        : "试试其他关键词，例如 JSON 或编码。"}
                    </p>
                  </div>
                )}
                <div className="privacy-strip">
                  <Icon name="ShieldCheck" size={20} />
                  <span>
                    普通工具在浏览器内处理。
                    <small>AI 助理需单独登录，发送内容前请确认。</small>
                  </span>
                  <span className="strip-tag">LOCAL FIRST</span>
                </div>
              </>
            )}
            <footer>
              <span>© {new Date().getFullYear()} DoubleDB 工具箱</span>
              <a
                className="icp-link"
                href="https://beian.miit.gov.cn/"
                target="_blank"
                rel="noopener noreferrer"
              >
                浙ICP备2026079328号
              </a>
              <span>少一点重复，多一点专注。</span>
            </footer>
          </main>
        </div>
      </div>
    </AiProvider>
  );
}
