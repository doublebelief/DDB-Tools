import React, { useEffect, useRef, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import sql from "highlight.js/lib/languages/sql";
import bash from "highlight.js/lib/languages/bash";
import python from "highlight.js/lib/languages/python";
import QRCode from "qrcode";
import { diffLines } from "diff";
import {
  Editor,
  ErrorBox,
  Field,
  ResultRows,
  useAction,
  download,
} from "./components";
import * as lib from "./lib";
for (const [name, language] of Object.entries({
  javascript,
  json,
  sql,
  bash,
  python,
}))
  hljs.registerLanguage(name, language);
const SAMPLE_JSON =
  '{\n  "project": "DoubleDB",\n  "version": 1,\n  "tools": ["JSON", "Base64", "Markdown"],\n  "localFirst": true\n}';
const SAMPLE_MD =
  '# Hello, DoubleDB 👋\n\n把时间留给创造。\n\n## 今天的计划\n\n- [x] 打开工具箱\n- [ ] 写一点有趣的代码\n\n```javascript\nconst greet = (name) => `Hello, ${name}!`;\nconsole.log(greet("DoubleDB"));\n```\n\n> 你的内容只在浏览器中处理。\n\n| 工具 | 用途 |\n| --- | --- |\n| JSON | 格式化数据 |\n| Markdown | 专注写作 |';
function Button({ children, onClick, primary = false, disabled = false }) {
  return (
    <button
      className={`button ${primary ? "primary" : ""}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
function Tree({ value, name = "root", depth = 0 }) {
  if (depth > 40)
    return <div className="leaf">嵌套超过 40 层，请查看文本结果</div>;
  if (
    value !== null &&
    typeof value === "object" &&
    !lib.isLosslessNumber(value)
  )
    return (
      <details open={depth < 2}>
        <summary>
          <span className="tree-key">{name}</span>{" "}
          {Array.isArray(value)
            ? `[${value.length}]`
            : `{${Object.keys(value).length}}`}
        </summary>
        {Object.entries(value).map(([k, v]) => (
          <Tree key={k} name={k} value={v} depth={depth + 1} />
        ))}
      </details>
    );
  return (
    <div className="leaf">
      <span className="tree-key">{name}</span>:{" "}
      <span className="tree-value">{lib.stringify(value)}</span>
    </div>
  );
}
function JsonTool() {
  const [input, setInput] = useState(SAMPLE_JSON),
    [output, setOutput] = useState(lib.jsonFormat(SAMPLE_JSON)),
    [view, setView] = useState("text"),
    [tree, setTree] = useState(lib.parse(SAMPLE_JSON)),
    [status, setStatus] = useState("");
  const { run, error } = useAction();
  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    Promise.resolve(
      context.registerTool(
        {
          name: "format_json",
          title: "格式化 JSON",
          description: "在 JSON 工具中格式化或压缩输入文本，并更新可见结果。",
          inputSchema: {
            type: "object",
            properties: {
              text: { type: "string" },
              compact: { type: "boolean" },
            },
            required: ["text"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: true },
          execute: async (args) => {
            if (
              typeof args?.text !== "string" ||
              args.text.length > 1000000 ||
              ("compact" in args && typeof args.compact !== "boolean")
            )
              throw new Error("输入须为不超过 1 MB 的 JSON 文本");
            const formatted = lib.jsonFormat(args.text, args.compact === true);
            const value = lib.parse(args.text);
            setInput(args.text);
            setOutput(formatted);
            setTree(value);
            setStatus("JSON 已处理");
            return { result: formatted };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => {});
    return () => lifecycle.abort();
  }, []);
  function process(mode) {
    run(() => {
      const value = lib.parse(input);
      setTree(value);
      setOutput(lib.jsonFormat(input, mode === "compact"));
      setStatus(mode === "validate" ? "JSON 语法正确；大整数原样保留。" : "");
    });
  }
  return (
    <>
      <div className="toolbar">
        <Button primary onClick={() => process("format")}>
          格式化
        </Button>
        <Button onClick={() => process("compact")}>压缩</Button>
        <Button onClick={() => process("validate")}>校验</Button>
        <Button onClick={() => setInput(SAMPLE_JSON)}>载入示例</Button>
        <Field label="结果视图">
          <select value={view} onChange={(e) => setView(e.target.value)}>
            <option value="text">文本</option>
            <option value="tree">树形</option>
          </select>
        </Field>
      </div>
      <div className="editor-grid">
        <Editor label="JSON 输入" value={input} onChange={setInput} />
        <Editor label="JSON 结果" value={output} filename="formatted.json">
          {view === "tree" ? (
            <div className="tree">
              <Tree value={tree} />
            </div>
          ) : null}
        </Editor>
      </div>
      <ErrorBox error={error} />
      {status && (
        <div className="success" role="status">
          {status}
        </div>
      )}
      <p className="note">
        保留大整数与小数的原始精度。修改输入后，点击操作按钮更新结果。
      </p>
    </>
  );
}
function CodecTool() {
  const [input, setInput] = useState("Hello, DoubleDB! 你好 👋"),
    [output, setOutput] = useState(""),
    [type, setType] = useState("base64");
  const { run, error } = useAction();
  return (
    <>
      <div className="toolbar">
        <Field label="编码格式">
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setOutput("");
            }}
          >
            <option value="base64">Base64（UTF-8 文本）</option>
            <option value="url">URL 组件</option>
            <option value="html">HTML 实体</option>
            <option value="unicode">Unicode 转义</option>
          </select>
        </Field>
        <Button
          primary
          onClick={() => run(() => setOutput(lib.codec(input, type, "encode")))}
        >
          编码
        </Button>
        <Button
          onClick={() => run(() => setOutput(lib.codec(input, type, "decode")))}
        >
          解码
        </Button>
        <Button
          onClick={() => {
            setInput(output);
            setOutput(input);
          }}
        >
          交换输入与结果
        </Button>
      </div>
      <div className="editor-grid">
        <Editor value={input} onChange={setInput} />
        <Editor label="结果" value={output} />
      </div>
      <ErrorBox error={error} />
      <p className="note">
        Base64 按 UTF-8 处理中文与 Emoji；URL 使用组件编码。Unicode 解码支持
        \\uXXXX 和 \\u&#123;XXXXX&#125;。
      </p>
    </>
  );
}
function TimestampTool() {
  const [stamp, setStamp] = useState(String(Math.floor(Date.now() / 1000))),
    [unit, setUnit] = useState("s"),
    [zone, setZone] = useState("Asia/Shanghai"),
    [date, setDate] = useState(""),
    [inputZone, setInputZone] = useState("local"),
    [result, setResult] = useState(new Date());
  const { run, error } = useAction();
  const zones = [
    "Asia/Shanghai",
    "UTC",
    "Asia/Tokyo",
    "America/New_York",
    "Europe/London",
  ];
  return (
    <>
      <div className="fields">
        <Field label="时间戳">
          <input
            value={stamp}
            onChange={(e) => setStamp(e.target.value)}
            inputMode="numeric"
          />
        </Field>
        <Field label="单位">
          <select value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="s">秒</option>
            <option value="ms">毫秒</option>
          </select>
        </Field>
        <Button
          primary
          onClick={() => run(() => setResult(lib.timestampToDate(stamp, unit)))}
        >
          转换为日期
        </Button>
        <Button
          onClick={() => {
            const now = new Date();
            setStamp(String(unit === "s" ? Math.floor(+now / 1000) : +now));
            setResult(now);
          }}
        >
          当前时间
        </Button>
      </div>
      <div className="fields">
        <Field label="日期与时间">
          <input
            type="datetime-local"
            step="1"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="输入日期时区">
          <select
            value={inputZone}
            onChange={(e) => setInputZone(e.target.value)}
          >
            <option value="local">
              本机时区（{Intl.DateTimeFormat().resolvedOptions().timeZone}）
            </option>
            <option value="utc">UTC</option>
          </select>
        </Field>
        <Button
          primary
          onClick={() =>
            run(() => {
              const d = lib.dateToTimestamp(date, inputZone);
              setResult(d);
              setStamp(String(unit === "s" ? Math.floor(+d / 1000) : +d));
            })
          }
        >
          转换为时间戳
        </Button>
      </div>
      <div className="fields">
        <Field label="结果显示时区">
          <select value={zone} onChange={(e) => setZone(e.target.value)}>
            {zones.map((z) => (
              <option key={z}>{z}</option>
            ))}
          </select>
        </Field>
      </div>
      <ResultRows
        rows={[
          [`日期（${zone}）`, lib.formatDate(result, zone)],
          ["UTC / ISO 8601", result.toISOString()],
          ["秒时间戳", Math.floor(+result / 1000)],
          ["毫秒时间戳", +result],
        ]}
      />
      <ErrorBox error={error} />
      <p className="note">
        输入日期按上方指定的本机时区或 UTC 解释；显示时区只影响结果呈现。
      </p>
    </>
  );
}
function JwtTool() {
  const demo =
    lib.toBase64('{"alg":"HS256","typ":"JWT"}').replace(/=/g, "") +
    "." +
    lib
      .toBase64('{"sub":"demo","name":"DoubleDB","exp":1893456000}')
      .replace(/=/g, "") +
    ".demo-signature";
  const [input, setInput] = useState(demo),
    [result, setResult] = useState(null);
  const { run, error } = useAction();
  return (
    <>
      <div className="toolbar">
        <Button
          primary
          onClick={() => run(() => setResult(lib.jwtDecode(input)))}
        >
          解析 JWT
        </Button>
        <Button onClick={() => setInput(demo)}>载入示例</Button>
      </div>
      <Editor
        label="JWT 输入"
        value={input}
        onChange={setInput}
        minHeight={130}
      />
      <div className="note">
        仅解码，不验证签名。解析成功不能证明令牌可信，示例签名也不是真实签名。
      </div>
      {result && (
        <>
          <div className="editor-grid" style={{ marginTop: 16 }}>
            <Editor
              label="Header"
              value={JSON.stringify(result.header, null, 2)}
              minHeight={220}
            />
            <Editor
              label="Payload"
              value={JSON.stringify(result.payload, null, 2)}
              minHeight={220}
            />
          </div>
          <ResultRows
            rows={[
              ["签名状态", "未验证"],
              [
                "过期状态",
                result.expired === null
                  ? "未提供 exp 声明"
                  : result.expired
                    ? "已过期"
                    : "尚未过期",
              ],
              [
                "过期时间",
                typeof result.payload.exp === "number" &&
                Number.isFinite(new Date(result.payload.exp * 1000).getTime())
                  ? new Date(result.payload.exp * 1000).toISOString()
                  : "—",
              ],
            ]}
          />
        </>
      )}
      <ErrorBox error={error} />
    </>
  );
}
function RandomTool() {
  const [type, setType] = useState("uuid"),
    [count, setCount] = useState(5),
    [length, setLength] = useState(24),
    [alphabet, setAlphabet] = useState(
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*+-_",
    ),
    [output, setOutput] = useState("");
  const { run, error } = useAction();
  return (
    <>
      <div className="fields">
        <Field label="生成类型">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="uuid">UUID v4</option>
            <option value="string">安全随机字符串 / 密码</option>
          </select>
        </Field>
        <Field label="数量（1–100）">
          <input
            type="number"
            min="1"
            max="100"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </Field>
        {type === "string" && (
          <Field label="长度（1–256）">
            <input
              type="number"
              min="1"
              max="256"
              value={length}
              onChange={(e) => setLength(Number(e.target.value))}
            />
          </Field>
        )}
      </div>
      {type === "string" && (
        <div className="fields">
          <Field label="可用字符（不保证每类字符都出现）">
            <input
              value={alphabet}
              onChange={(e) => setAlphabet(e.target.value)}
            />
          </Field>
        </div>
      )}
      <div className="toolbar">
        <Button
          primary
          onClick={() =>
            run(() =>
              setOutput(
                lib.generateRandom(
                  type,
                  count,
                  length,
                  [...new Set(alphabet)].join(""),
                ),
              ),
            )
          }
        >
          生成
        </Button>
      </div>
      <Editor label="生成结果" value={output} />
      <ErrorBox error={error} />
      <p className="note">
        使用浏览器密码学安全随机源生成。内容不会自动保存，请及时复制需要的结果。
      </p>
    </>
  );
}
function HashTool() {
  const [input, setInput] = useState("Hello, DoubleDB!"),
    [algorithm, setAlgorithm] = useState("SHA-256"),
    [mode, setMode] = useState("hash"),
    [key, setKey] = useState(""),
    [output, setOutput] = useState(""),
    [file, setFile] = useState(null),
    [source, setSource] = useState("text");
  const { run, error, busy } = useAction();
  return (
    <>
      <div className="fields">
        <Field label="输入类型">
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="text">文本（UTF-8）</option>
            <option value="file">文件</option>
          </select>
        </Field>
        <Field label="算法">
          <select
            value={algorithm}
            onChange={(e) => setAlgorithm(e.target.value)}
          >
            <option>SHA-256</option>
            <option>SHA-512</option>
          </select>
        </Field>
        <Field label="计算模式">
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="hash">哈希摘要</option>
            <option value="hmac">HMAC</option>
          </select>
        </Field>
      </div>
      {mode === "hmac" && (
        <div className="fields">
          <Field label="HMAC 密钥（UTF-8）">
            <input
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </Field>
        </div>
      )}
      {source === "file" ? (
        <div className="fields">
          <Field label="选择文件（上限 50 MB）">
            <input
              type="file"
              onChange={(e) => setFile(e.target.files[0] || null)}
            />
          </Field>
        </div>
      ) : (
        <Editor value={input} onChange={setInput} minHeight={180} />
      )}
      <div className="toolbar" style={{ marginTop: 16 }}>
        <Button
          primary
          disabled={busy}
          onClick={() =>
            run(async () => {
              if (source === "file" && !file) throw new Error("请先选择文件");
              if (source === "file" && file.size > 50 * 1024 * 1024)
                throw new Error("文件上限为 50 MB");
              setOutput(
                await lib.digest(
                  source === "file" ? await file.arrayBuffer() : input,
                  algorithm,
                  mode === "hmac" ? key : null,
                ),
              );
            })
          }
        >
          {busy ? "计算中…" : "计算摘要"}
        </Button>
      </div>
      <Editor label="十六进制摘要" value={output} minHeight={120} />
      <ErrorBox error={error} />
    </>
  );
}
function RegexTool() {
  const [pattern, setPattern] = useState(
      "([\\w.+-]+)@([\\w.-]+\\.[A-Za-z]{2,})",
    ),
    [flags, setFlags] = useState("g"),
    [text, setText] = useState(
      "联系 dev@example.com 或 hello@doubledatabase.me",
    ),
    [replacement, setReplacement] = useState("$1 [at] $2"),
    [result, setResult] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setResult(null);
    setError("");
    if (!pattern) {
      setBusy(false);
      return;
    }
    if (text.length > 100000) {
      setError("正则测试文本上限为 100,000 个字符");
      setBusy(false);
      return;
    }
    setBusy(true);
    let worker, timer;
    const debounce = setTimeout(() => {
      worker = new Worker(new URL("./regex.worker.js", import.meta.url), {
        type: "module",
      });
      timer = setTimeout(() => {
        worker.terminate();
        setBusy(false);
        setError("匹配超过 1 秒，已中止。请简化表达式，避免嵌套量词。");
      }, 1000);
      worker.onmessage = ({ data }) => {
        clearTimeout(timer);
        worker.terminate();
        setBusy(false);
        if (data.error) setError(data.error);
        else setResult(data);
      };
      worker.onerror = () => {
        clearTimeout(timer);
        worker.terminate();
        setBusy(false);
        setError("正则处理失败");
      };
      worker.postMessage({ pattern, flags, text, replacement });
    }, 250);
    return () => {
      clearTimeout(debounce);
      clearTimeout(timer);
      worker?.terminate();
    };
  }, [pattern, flags, text, replacement]);
  let cursor = 0;
  const highlighted = [];
  for (const [i, m] of (result?.matches || []).entries()) {
    highlighted.push(text.slice(cursor, m.index));
    highlighted.push(<mark key={i}>{m.value || "∅"}</mark>);
    cursor = m.index + m.value.length;
  }
  highlighted.push(text.slice(cursor));
  return (
    <>
      <div className="fields">
        <Field label="表达式（不含两侧 /）">
          <input
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            spellCheck="false"
          />
        </Field>
        <Field label="标志 flags">
          <input
            value={flags}
            onChange={(e) => setFlags(e.target.value)}
            placeholder="gim"
          />
        </Field>
      </div>
      <Editor
        label="测试文本"
        value={text}
        onChange={setText}
        minHeight={160}
      />
      <div className="fields" style={{ marginTop: 16 }}>
        <Field label="替换内容（支持 $1、$& 等）">
          <input
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
          />
        </Field>
      </div>
      <ErrorBox error={error} />
      {busy && (
        <p className="note" role="status">
          正在匹配…
        </p>
      )}
      {result && (
        <>
          <p className="note">
            {result.matches.length} 个匹配
            {result.truncated ? "（仅显示前 1,000 个）" : ""}
          </p>
          <div className="match-preview">{highlighted}</div>
          <details className="note">
            <summary>查看匹配与捕获组</summary>
            <pre style={{ overflow: "auto" }}>
              {JSON.stringify(result.matches, null, 2)}
            </pre>
          </details>
          <Editor label="替换结果" value={result.replaced} minHeight={160} />
        </>
      )}
      <p className="note">
        使用 JavaScript 正则语法。在独立线程运行，超时自动终止。
      </p>
    </>
  );
}
function DiffTool() {
  const [left, setLeft] = useState(
      'const site = "DoubleDB";\nconst tools = 10;\nconsole.log(site);\n',
    ),
    [right, setRight] = useState(
      'const site = "DoubleDB";\nconst tools = 14;\nconsole.log(site, tools);\n',
    ),
    [parts, setParts] = useState(null),
    [ignore, setIgnore] = useState(false);
  const { run, error } = useAction();
  return (
    <>
      <div className="toolbar">
        <Button
          primary
          onClick={() =>
            run(() => {
              if (left.length + right.length > 100000)
                throw new Error("对比文本总长度上限为 100,000 个字符");
              const result = diffLines(left, right, {
                ignoreWhitespace: ignore,
                timeout: 1000,
              });
              if (!result) throw new Error("差异计算超时，请缩短文本");
              setParts(result);
            })
          }
        >
          比较差异
        </Button>
        <label className="note" style={{ margin: 0 }}>
          <input
            type="checkbox"
            checked={ignore}
            onChange={(e) => setIgnore(e.target.checked)}
          />{" "}
          忽略行首尾空白
        </label>
        <Button
          onClick={() => {
            setLeft(right);
            setRight(left);
            setParts(null);
          }}
        >
          交换文本
        </Button>
      </div>
      <div className="editor-grid">
        <Editor
          label="原始文本"
          value={left}
          onChange={setLeft}
          minHeight={230}
        />
        <Editor
          label="修改后文本"
          value={right}
          onChange={setRight}
          minHeight={230}
        />
      </div>
      <ErrorBox error={error} />
      {parts && (
        <>
          <div className="stats">
            <span>
              + 新增{" "}
              {parts.filter((p) => p.added).reduce((n, p) => n + p.count, 0)} 行
            </span>
            <span>
              − 删除{" "}
              {parts.filter((p) => p.removed).reduce((n, p) => n + p.count, 0)}{" "}
              行
            </span>
            {!parts.some((p) => p.added || p.removed) && (
              <span>两段文本一致</span>
            )}
          </div>
          <div className="diff-result">
            {parts.map((p, i) => (
              <div
                key={i}
                className={
                  p.added ? "diff-added" : p.removed ? "diff-removed" : ""
                }
              >
                {p.value.split("\n").map((line, j, a) =>
                  j === a.length - 1 && !line ? null : (
                    <React.Fragment key={j}>
                      {p.added ? "+ " : p.removed ? "− " : "  "}
                      {line}
                      {j < a.length - 1 ? "\n" : ""}
                    </React.Fragment>
                  ),
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
function QrTool() {
  const [input, setInput] = useState("https://doubledatabase.me"),
    [size, setSize] = useState("512"),
    [level, setLevel] = useState("M"),
    [url, setUrl] = useState("");
  const { run, error } = useAction();
  async function generate() {
    await run(async () => {
      if (!input) throw new Error("请输入文本或链接");
      setUrl(
        await QRCode.toDataURL(input, {
          width: Number(size),
          margin: 4,
          errorCorrectionLevel: level,
        }),
      );
    });
  }
  return (
    <>
      <div className="fields">
        <Field label="图片尺寸">
          <select value={size} onChange={(e) => setSize(e.target.value)}>
            {[256, 512, 1024].map((n) => (
              <option key={n} value={n}>
                {n} × {n}
              </option>
            ))}
          </select>
        </Field>
        <Field label="纠错级别">
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            {["L", "M", "Q", "H"].map((v, i) => (
              <option key={v} value={v}>
                {v} · {[7, 15, 25, 30][i]}%
              </option>
            ))}
          </select>
        </Field>
        <Button primary onClick={generate}>
          生成二维码
        </Button>
      </div>
      <div className="editor-grid">
        <Editor label="文本或链接" value={input} onChange={setInput} />
        <div className="qr-preview">
          {url ? (
            <>
              <img src={url} alt="生成的二维码" />
              <a className="button" href={url} download="doubledb-qrcode.png">
                下载 PNG
              </a>
            </>
          ) : (
            <p className="note">生成后在这里预览与下载</p>
          )}
        </div>
      </div>
      <ErrorBox error={error} />
    </>
  );
}
function TextTool() {
  const [input, setInput] = useState(
      "hello world\nHello DoubleDB\nhello world",
    ),
    [mode, setMode] = useState("dedupe"),
    [output, setOutput] = useState("");
  const { run, error } = useAction();
  return (
    <>
      <div className="toolbar">
        <Field label="处理方式">
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            {Object.entries({
              dedupe: "逐行去重",
              sort: "逐行排序",
              trim: "清理首尾空白 / 空行",
              upper: "全部大写",
              lower: "全部小写",
              camel: "camelCase",
              pascal: "PascalCase",
              snake: "snake_case",
              kebab: "kebab-case",
            }).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Button
          primary
          onClick={() => run(() => setOutput(lib.textTransform(input, mode)))}
        >
          处理文本
        </Button>
      </div>
      <div className="editor-grid">
        <Editor value={input} onChange={setInput} />
        <Editor label="结果" value={output} />
      </div>
      <div className="stats">
        <span>字符：{Array.from(input).length}</span>
        <span>UTF-8 字节：{new TextEncoder().encode(input).length}</span>
        <span>行数：{input ? input.split(/\r?\n/).length : 0}</span>
        <span>
          空白分隔词数：{input.trim() ? input.trim().split(/\s+/).length : 0}
        </span>
      </div>
      <ErrorBox error={error} />
    </>
  );
}
function YamlTool() {
  const [input, setInput] = useState(
      "name: DoubleDB\nversion: 1\ntools:\n  - JSON\n  - YAML\nlocalFirst: true\n",
    ),
    [direction, setDirection] = useState("toJson"),
    [output, setOutput] = useState("");
  const { run, error } = useAction();
  return (
    <>
      <div className="toolbar">
        <Field label="转换方向">
          <select
            value={direction}
            onChange={(e) => {
              setDirection(e.target.value);
              setOutput("");
            }}
          >
            <option value="toJson">YAML → JSON</option>
            <option value="toYaml">JSON → YAML</option>
          </select>
        </Field>
        <Button
          primary
          onClick={() =>
            run(() => setOutput(lib.yamlConvert(input, direction)))
          }
        >
          转换并校验
        </Button>
        <Button
          onClick={() => {
            setInput(output);
            setOutput("");
            setDirection(direction === "toJson" ? "toYaml" : "toJson");
          }}
        >
          反向转换
        </Button>
        <Button
          onClick={() =>
            setInput(
              direction === "toJson"
                ? "name: DoubleDB\ntools: 14\nlocalFirst: true"
                : SAMPLE_JSON,
            )
          }
        >
          载入示例
        </Button>
      </div>
      <div className="editor-grid">
        <Editor
          label={direction === "toJson" ? "YAML 输入" : "JSON 输入"}
          value={input}
          onChange={setInput}
        />
        <Editor
          label="转换结果"
          value={output}
          filename={direction === "toJson" ? "result.json" : "result.yaml"}
        />
      </div>
      <ErrorBox error={error} />
      <p className="note">
        转换不保留注释。YAML 别名展开有数量限制；超出浮点安全精度的 JSON
        小数转换为 YAML 字符串，整数保持数值类型。
      </p>
    </>
  );
}
function SqlTool() {
  const [input, setInput] = useState(
      "select u.id,u.name,count(o.id) as orders from users u left join orders o on u.id=o.user_id where u.active=1 group by u.id,u.name order by orders desc;",
    ),
    [language, setLanguage] = useState("mysql"),
    [output, setOutput] = useState("");
  const { run, error } = useAction();
  return (
    <>
      <div className="toolbar">
        <Field label="SQL 方言">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            {Object.entries({
              sql: "标准 SQL",
              mysql: "MySQL",
              postgresql: "PostgreSQL",
              sqlite: "SQLite",
              transactsql: "SQL Server",
              plsql: "PL/SQL",
            }).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Button
          primary
          onClick={() => run(() => setOutput(lib.sqlFormat(input, language)))}
        >
          格式化
        </Button>
        <Button
          onClick={() =>
            run(() => setOutput(lib.sqlFormat(input, language, true)))
          }
        >
          紧凑排版
        </Button>
      </div>
      <div className="editor-grid">
        <Editor label="SQL 输入" value={input} onChange={setInput} />
        <Editor label="格式化结果" value={output} filename="formatted.sql" />
      </div>
      <ErrorBox error={error} />
      <p className="note">
        仅调整排版，不连接数据库、不执行
        SQL，也不替代数据库语法校验。紧凑排版保留必要换行与注释。
      </p>
    </>
  );
}
function CronTool() {
  const [expression, setExpression] = useState("0 9 * * 1-5"),
    [zone, setZone] = useState("Asia/Shanghai"),
    [result, setResult] = useState(null);
  const { run, error } = useAction();
  return (
    <>
      <div className="fields">
        <Field label="Cron 表达式">
          <input
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
            spellCheck="false"
          />
        </Field>
        <Field label="执行时区">
          <select value={zone} onChange={(e) => setZone(e.target.value)}>
            {[
              "Asia/Shanghai",
              "UTC",
              "Asia/Tokyo",
              "America/New_York",
              "Europe/London",
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
        <Button
          primary
          onClick={() =>
            run(() =>
              setResult({
                dates: lib.cronNext(expression, zone),
                fields: lib.cronDescribe(expression),
                zone,
                expression,
              }),
            )
          }
        >
          预览执行时间
        </Button>
      </div>
      <div className="toolbar">
        {[
          ["每 5 分钟", "*/5 * * * *"],
          ["每天 09:00", "0 9 * * *"],
          ["工作日 09:00", "0 9 * * 1-5"],
          ["每月 1 日", "0 0 1 * *"],
        ].map(([name, v]) => (
          <Button key={name} onClick={() => setExpression(v)}>
            {name}
          </Button>
        ))}
      </div>
      {result && (
        <>
          <p className="note">
            规则：<code>{result.expression}</code> · 时区：{result.zone}
          </p>
          <div className="table-wrap">
            <table className="cron-table">
              <thead>
                <tr>
                  <th>字段</th>
                  <th>规则</th>
                  <th>含义</th>
                </tr>
              </thead>
              <tbody>
                {result.fields.map((f) => (
                  <tr key={f.name}>
                    <td>{f.name}</td>
                    <td>
                      <code>{f.value}</code>
                    </td>
                    <td>{f.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 style={{ fontSize: 16, marginTop: 25 }}>接下来 8 次执行</h3>
          <ResultRows
            rows={result.dates.map((d, i) => [
              String(i + 1).padStart(2, "0"),
              `${lib.formatDate(d, result.zone)} (${d.toISOString()})`,
            ])}
          />
        </>
      )}
      <ErrorBox error={error} />
      <p className="note">
        支持标准 5 位（分 时 日 月 星期）和可选秒字段的 6 位表达式；不支持
        Quartz 年字段。日和星期同时受限时采用 OR
        语义。执行时间从点击预览的时刻起计算。
      </p>
    </>
  );
}
function markdownHtml(input) {
  const html = marked.parse(input, { gfm: true, breaks: false });
  const safe = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: [
      "style",
      "form",
      "input",
      "button",
      "iframe",
      "video",
      "audio",
      "img",
    ],
    FORBID_ATTR: ["style", "id", "name"],
  });
  const doc = new DOMParser().parseFromString(safe, "text/html");
  doc.querySelectorAll("pre code").forEach((el) => {
    const lang = el.className.replace("language-", "");
    if (hljs.getLanguage(lang))
      el.innerHTML = hljs.highlight(el.textContent, { language: lang }).value;
  });
  doc.querySelectorAll("a").forEach((a) => {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  });
  return doc.body.innerHTML;
}
function MarkdownTool() {
  const [input, setInput] = useState(SAMPLE_MD),
    [html, setHtml] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (input.length > 200000) throw new Error("预览上限为 200,000 个字符");
        setHtml(markdownHtml(input));
        setError("");
      } catch (e) {
        setHtml("");
        setError(e.message);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [input]);
  return (
    <>
      <div className="toolbar">
        <Button onClick={() => setInput(SAMPLE_MD)}>载入示例</Button>
        <Button
          primary
          onClick={() => {
            try {
              if (input.length > 200000)
                throw new Error("导出上限为 200,000 个字符");
              const fresh = markdownHtml(input);
              download(
                '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Markdown 文档</title><style>body{max-width:900px;margin:40px auto;padding:20px;font:16px/1.8 system-ui;color:#1b283e}pre{background:#f3f5f8;padding:16px;overflow:auto}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:8px}blockquote{border-left:3px solid #175cd3;padding-left:16px}a{color:#175cd3}.hljs-keyword,.hljs-selector-tag{color:#d73a49}.hljs-string{color:#032f62}.hljs-number{color:#005cc5}.hljs-comment{color:#6a737d}</style></head><body>' +
                  fresh +
                  "</body></html>",
                "document.html",
                "text/html;charset=utf-8",
              );
            } catch (e) {
              setError(e.message);
            }
          }}
        >
          导出 HTML
        </Button>
      </div>
      <div className="editor-grid">
        <Editor
          label="Markdown 输入"
          value={input}
          onChange={setInput}
          minHeight={490}
          filename="document.md"
        />
        <div className="editor-panel">
          <div className="panel-title">实时预览</div>
          <div
            className="rendered"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
      <ErrorBox error={error} />
      <p className="note">
        支持表格与常见代码高亮。预览已过滤脚本、交互标签与图片，避免执行代码或向外部发送请求。
      </p>
    </>
  );
}
const components = {
  json: JsonTool,
  codec: CodecTool,
  timestamp: TimestampTool,
  jwt: JwtTool,
  random: RandomTool,
  hash: HashTool,
  regex: RegexTool,
  diff: DiffTool,
  qrcode: QrTool,
  text: TextTool,
  yaml: YamlTool,
  sql: SqlTool,
  cron: CronTool,
  markdown: MarkdownTool,
};
export default function Workspace({ id }) {
  const Component = components[id];
  return (
    <section className="workspace">
      <Component />
    </section>
  );
}
