import React, { useEffect, useRef, useState } from "react";
import { useAiContext } from "./ai-context.jsx";
import { CopyButton } from "./components.jsx";
const actions = {
  json: ["修复 JSON 语法并解释修改", "生成一份示例 JSON"],
  regex: ["根据我的需求生成 JavaScript 正则", "解释这个正则并给出边界用例"],
  sql: ["解释这段 SQL", "分析 SQL 的改进方向并说明所需信息"],
  cron: ["把我的时间要求转换成 Cron", "解释这个 Cron 的执行时间"],
  markdown: ["整理文档结构，保留原意", "生成 Markdown 文档模板"],
};
async function api(path, data, signal) {
  const response = await fetch(`/api/ai/${path}`, {
    method: data === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: data === undefined ? {} : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal,
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw Object.assign(new Error(result.error || "AI 服务暂时不可用"), {
      status: response.status,
    });
  }
  return response;
}
export async function readAnswer(body, append) {
  const reader = body.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    size = 0,
    done = false;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      if (buffer.length > 128000) throw new Error("响应格式异常");
      let index;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        if (!line) continue;
        const part = JSON.parse(line);
        if (part.error) throw new Error(part.error);
        if (typeof part.text === "string") {
          size += part.text.length;
          if (size > 16000) throw new Error("回答超过长度限制");
          append(part.text);
        }
        if (part.done) done = true;
      }
    }
    if (!done) throw new Error("连接中断，回答可能不完整");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
function Answer({ text, complete, review }) {
  const blocks = [...text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)];
  return (
    <>
      <pre className="ai-answer">{text || "正在思考…"}</pre>
      <div className="ai-code-actions">
        <CopyButton text={text} />
        {complete &&
          blocks.map((block, i) => (
            <button
              className="button"
              key={i}
              onClick={() => review(block[1].trimEnd())}
            >
              检查并填入代码 {i + 1}
            </button>
          ))}
      </div>
    </>
  );
}
export default function AiAssistant({ id }) {
  const context = useAiContext();
  const [open, setOpen] = useState(false),
    [session, setSession] = useState(null);
  const [password, setPassword] = useState(""),
    [prompt, setPrompt] = useState("");
  const [attachment, setAttachment] = useState(null),
    [messages, setMessages] = useState([]);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [candidate, setCandidate] = useState(null),
    [undo, setUndo] = useState(null);
  const controller = useRef(null),
    dialog = useRef(null),
    trigger = useRef(null),
    log = useRef(null);
  const available = !!actions[id];
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!open) return;
    const abort = new AbortController();
    api("session", undefined, abort.signal)
      .then((r) => r.json())
      .then(setSession)
      .catch((e) => {
        if (e.name !== "AbortError") setError("AI 服务尚未连接，请稍后重试");
      });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    return () => {
      abort.abort();
      document.body.style.overflow = previousOverflow;
      trigger.current?.focus();
    };
  }, [open]);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages]);
  function close() {
    controller.current?.abort();
    setOpen(false);
  }
  function keydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
    if (event.key !== "Tab") return;
    const elements = [
      ...dialog.current.querySelectorAll(
        'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
      ),
    ];
    const first = elements[0],
      last = elements.at(-1);
    if (
      event.shiftKey &&
      (document.activeElement === first ||
        document.activeElement === dialog.current)
    ) {
      event.preventDefault();
      last?.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last ||
        document.activeElement === dialog.current)
    ) {
      event.preventDefault();
      first?.focus();
    }
  }
  async function login(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      setSession(await (await api("login", { password })).json());
      setPassword("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setError("");
    controller.current?.abort();
    try {
      await api("logout", {});
      setSession({ ...session, authenticated: false });
      setMessages([]);
      setAttachment(null);
      setCandidate(null);
      setUndo(null);
      setPrompt("");
    } catch (e) {
      setError(e.message);
    }
  }
  function attach(checked) {
    if (!checked) return setAttachment(null);
    const tool = context?.tool;
    if (!tool || tool.id !== id) return;
    const value = tool.value + (tool.extra ? `\n\n${tool.extra}` : "");
    if (value.length > 12000)
      return setError("工具内容超过 12,000 字符，请在问题中粘贴需要分析的片段");
    setAttachment(value);
    setError("");
  }
  async function send(event) {
    event.preventDefault();
    if (busy || !prompt.trim()) return;
    setError("");
    setCandidate(null);
    setBusy(true);
    const abort = new AbortController();
    controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 65000);
    const previous = messages.filter((m) => m.complete).slice(-4);
    let history = previous.flatMap((m) => [
      { role: "user", content: m.question },
      { role: "assistant", content: m.answer },
    ]);
    while (history.reduce((n, m) => n + m.content.length, 0) > 24000)
      history = history.slice(2);
    const message = {
      question: prompt,
      answer: "",
      complete: false,
      attached: attachment !== null,
    };
    setMessages((m) => [...m, message]);
    setPrompt("");
    const update = (patch) =>
      setMessages((m) => [...m.slice(0, -1), { ...m.at(-1), ...patch }]);
    try {
      const response = await api(
        "chat",
        {
          tool: id,
          prompt: message.question,
          context: attachment || "",
          history,
        },
        abort.signal,
      );
      setAttachment(null);
      let answer = "";
      await readAnswer(response.body, (text) => {
        answer += text;
        update({ answer });
      });
      update({ complete: true });
    } catch (e) {
      update({ failed: true });
      if (e.status === 401) setSession((s) => ({ ...s, authenticated: false }));
      setError(
        e.name === "AbortError" ? "已停止生成，回答可能不完整" : e.message,
      );
    } finally {
      clearTimeout(timeout);
      setBusy(false);
      controller.current = null;
    }
  }
  async function apply() {
    setError("");
    const tool = context?.tool;
    if (!tool || tool.id !== id) return;
    try {
      if (!candidate || candidate.length > 12000)
        throw new Error("填入内容须为 1–12,000 个字符");
      // Validate using the existing bounded tools before changing visible input.
      if (id === "json" || id === "sql") {
        const { compute } = await import("./compute-client.js");
        await compute(id, {
          input: candidate,
          language: tool.extra.replace("SQL 方言：", ""),
        });
      } else if (id === "regex") {
        if (candidate.length > 2000)
          throw new Error("正则表达式上限 2,000 个字符");
        new RegExp(candidate, tool.extra.match(/^flags：(.*)/)?.[1] || "");
      } else if (id === "cron") {
        const { cronNext } = await import("./lib.js");
        cronNext(candidate, tool.extra.replace("时区：", ""));
      }
      setUndo({ before: tool.value, after: candidate });
      tool.setValue(candidate);
      setCandidate(null);
    } catch (e) {
      setError(`未修改原输入：${e.message}`);
    }
  }
  return (
    <>
      <button
        className="button ai-trigger"
        ref={trigger}
        onClick={() => setOpen(true)}
      >
        ✦ AI 助理 <small>个人版</small>
      </button>
      {open && (
        <div className="ai-overlay">
          <button
            className="ai-backdrop"
            aria-label="关闭 AI 助理"
            onClick={close}
          />
          <section
            className="ai-panel"
            role="dialog"
            aria-modal="true"
            aria-label="DoubleDB AI 助理"
            tabIndex={-1}
            ref={dialog}
            onKeyDown={keydown}
          >
            <header className="ai-header">
              <div>
                <strong>DoubleDB AI 助理</strong>
                <small>个人使用 · {id || "工具箱"}</small>
              </div>
              <button className="button" onClick={close}>
                关闭
              </button>
            </header>
            <div className="ai-content" ref={log}>
              <p className="ai-note">
                AI
                请求会发送到配置的模型服务。工具输入默认不附带；请勿发送密钥或敏感数据。对话仅保留在本页，切换工具或刷新后清空。
              </p>
              {!session ? (
                <p>正在检查服务状态…</p>
              ) : !session.authenticated ? (
                <form className="ai-login" onSubmit={login}>
                  <h2>登录个人助理</h2>
                  <p>使用你的私有访问口令。原有工具无需登录。</p>
                  <label>
                    访问口令
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      maxLength={256}
                      required
                    />
                  </label>
                  <button className="button primary" disabled={busy}>
                    登录
                  </button>
                </form>
              ) : (
                <>
                  <div className="ai-session">
                    <span>{session.ready ? "模型已配置" : "模型尚未配置"}</span>
                    <button className="button" disabled={busy} onClick={logout}>
                      退出登录
                    </button>
                  </div>
                  {!session.ready && (
                    <p className="ai-note">
                      请在服务器私有配置中填写接口地址、模型名称和 API
                      密钥，完成后重启 AI 服务。
                    </p>
                  )}
                  {!available && (
                    <p>
                      首版支持 JSON、正则、SQL、Cron 和
                      Markdown。请打开相应工具使用。
                    </p>
                  )}
                  {available && (
                    <div className="ai-shortcuts">
                      {actions[id].map((action) => (
                        <button
                          className="button"
                          disabled={busy}
                          key={action}
                          onClick={() => setPrompt(action)}
                        >
                          {action}
                        </button>
                      ))}
                    </div>
                  )}
                  {messages.map((message, i) => (
                    <article className="ai-message" key={i}>
                      <p className="ai-question">
                        {message.question}
                        {message.attached && <small>已主动附带内容</small>}
                      </p>
                      <Answer
                        text={message.answer}
                        complete={message.complete && !busy}
                        review={setCandidate}
                      />
                      {message.failed && (
                        <small>此回答未完成，不会加入后续对话上下文。</small>
                      )}
                    </article>
                  ))}
                  {!!messages.length && (
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() => {
                        setMessages([]);
                        setCandidate(null);
                        setAttachment(null);
                        setError("");
                      }}
                    >
                      清空对话
                    </button>
                  )}
                  {candidate !== null && (
                    <div className="ai-review">
                      <h3>确认替换工具输入</h3>
                      <p>
                        原输入将被替换；填入后可撤销。SQL
                        仅检查格式，结果仍需你确认。
                      </p>
                      <textarea
                        aria-label="待填入代码"
                        value={candidate}
                        onChange={(e) => setCandidate(e.target.value)}
                        maxLength={12000}
                      />
                      <button className="button primary" onClick={apply}>
                        确认填入
                      </button>
                      <button
                        className="button"
                        onClick={() => setCandidate(null)}
                      >
                        取消
                      </button>
                    </div>
                  )}
                  {undo && (
                    <button
                      className="button"
                      onClick={() => {
                        if (context?.tool?.value !== undo.after)
                          return setError(
                            "输入已再次修改，为避免覆盖，请手动恢复",
                          );
                        context.tool.setValue(undo.before);
                        setUndo(null);
                      }}
                    >
                      撤销上次填入
                    </button>
                  )}
                </>
              )}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
            </div>
            {session?.authenticated && available && (
              <form className="ai-compose" onSubmit={send}>
                <label className="ai-attach">
                  <input
                    type="checkbox"
                    checked={attachment !== null}
                    disabled={busy || !session.ready}
                    onChange={(e) => attach(e.target.checked)}
                  />
                  附带当前工具内容（发送前可编辑）
                </label>
                {attachment !== null && (
                  <textarea
                    aria-label="即将发送的工具内容"
                    value={attachment}
                    maxLength={12000}
                    onChange={(e) => setAttachment(e.target.value)}
                    disabled={busy}
                  />
                )}
                <textarea
                  aria-label="向 AI 提问"
                  placeholder="描述你想完成的事…"
                  maxLength={4000}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={busy || !session.ready}
                  required
                />
                <div>
                  <small>最多附带最近 4 轮问答；附件不自动重复发送。</small>
                  {busy ? (
                    <button
                      className="button"
                      type="button"
                      onClick={() => controller.current?.abort()}
                    >
                      停止生成
                    </button>
                  ) : (
                    <button
                      className="button primary"
                      disabled={!session.ready}
                    >
                      发送
                    </button>
                  )}
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  );
}
