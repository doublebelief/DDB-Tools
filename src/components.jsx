import React, { useRef, useState } from "react";
import { Copy, Check, Download, Upload, Trash2 } from "lucide-react";
export function download(content, name, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function CopyButton({ text }) {
  const [status, setStatus] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("已复制");
    } catch {
      setStatus("复制失败，请手动选择");
    }
    setTimeout(() => setStatus(""), 2200);
  }
  return (
    <button
      className="icon-button"
      title={status || "复制结果"}
      aria-label={status || "复制结果"}
      onClick={copy}
    >
      {status === "已复制" ? <Check size={16} /> : <Copy size={16} />}
      <span className="sr-only" role="status">
        {status}
      </span>
    </button>
  );
}
export function Editor({
  label = "输入",
  value,
  onChange,
  filename = "result.txt",
  placeholder = "在这里粘贴内容…",
  minHeight = 340,
  accept = ".txt,.json,.yaml,.yml,.sql,.md,.csv,.log",
  children,
}) {
  const ref = useRef(null),
    [error, setError] = useState("");
  async function read(file) {
    try {
      if (!file) return;
      if (file.size > 1024 * 1024) throw new Error("文本文件上限为 1 MB");
      onChange(await file.text());
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <div
      className="editor-panel"
      onDragOver={(e) => {
        if (onChange) e.preventDefault();
      }}
      onDrop={(e) => {
        if (onChange) {
          e.preventDefault();
          read(e.dataTransfer.files[0]);
        }
      }}
    >
      <div className="panel-title">
        <span>
          {label}{" "}
          {onChange && <span className="drop-hint">· 支持拖入文本文件</span>}
        </span>
        <div className="panel-actions">
          {onChange && (
            <>
              <input
                ref={ref}
                type="file"
                hidden
                accept={accept}
                onChange={(e) => {
                  read(e.target.files[0]);
                  e.target.value = "";
                }}
              />
              <button
                className="icon-button"
                aria-label={`导入${label}`}
                title="导入文件"
                onClick={() => ref.current.click()}
              >
                <Upload size={16} />
              </button>
              <button
                className="icon-button"
                aria-label={`清空${label}`}
                title="清空"
                onClick={() => onChange("")}
              >
                <Trash2 size={16} />
              </button>
            </>
          )}
          <CopyButton text={value} />
          <button
            className="icon-button"
            aria-label={`下载${label}`}
            title="下载"
            onClick={() => download(value, filename)}
          >
            <Download size={16} />
          </button>
        </div>
      </div>
      {children || (
        <textarea
          aria-label={label}
          spellCheck="false"
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          readOnly={!onChange}
          placeholder={placeholder}
          style={{ minHeight }}
        />
      )}
      {error && <ErrorBox error={error} />}
    </div>
  );
}
export function ErrorBox({ error }) {
  return error ? (
    <div className="error" role="alert">
      {error}
    </div>
  ) : null;
}
export function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function ResultRows({ rows }) {
  return (
    <div className="result-list">
      {rows.map(([label, value]) => (
        <div className="result-row" key={label}>
          <span>{label}</span>
          <code>{String(value)}</code>
        </div>
      ))}
    </div>
  );
}
export function useAction() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function run(fn) {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e.message || "处理失败，请检查输入");
    } finally {
      setBusy(false);
    }
  }
  return { error, busy, run, setError };
}
