import {
  assertText,
  boundedOutput,
  checkJsonDepth,
  checkStructure,
  LIMITS,
} from "./limits.js";
import {
  parse,
  stringify,
  isLosslessNumber,
  isSafeNumber,
} from "lossless-json";
import { parseDocument, stringify as yamlStringify } from "yaml";
import { format } from "sql-formatter";
import { CronExpressionParser } from "cron-parser";
export { parse, stringify, isLosslessNumber, isSafeNumber };
export function jsonFormat(input, compact = false) {
  checkJsonDepth(input);
  const data = parse(input);
  checkStructure(data);
  return boundedOutput(stringify(data, null, compact ? undefined : 2));
}
export function toBase64(text) {
  let binary = "";
  for (const b of new TextEncoder().encode(text))
    binary += String.fromCharCode(b);
  return btoa(binary);
}
export function fromBase64(text, url = false) {
  let s = text.replace(/\s/g, "");
  if (url) s = s.replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s) || s.replace(/=/g, "").length % 4 === 1)
    throw new Error("无效的 Base64 内容");
  return new TextDecoder("utf-8", { fatal: true }).decode(
    Uint8Array.from(atob(s), (c) => c.charCodeAt(0)),
  );
}
export function codec(input, type, direction) {
  return boundedOutput(codecUnchecked(input, type, direction));
}
function codecUnchecked(input, type, direction) {
  assertText(
    input,
    type === "unicode" && direction === "encode"
      ? Math.floor(LIMITS.output / 6)
      : LIMITS.input,
  );
  const encode = direction === "encode";
  if (type === "base64") return encode ? toBase64(input) : fromBase64(input);
  if (type === "url")
    return encode ? encodeURIComponent(input) : decodeURIComponent(input);
  if (type === "html") {
    if (encode)
      return input.replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
    const doc = new DOMParser().parseFromString(
      "<!doctype html><body><textarea>" +
        input.replace(/</g, "&lt;") +
        "</textarea>",
      "text/html",
    );
    return doc.querySelector("textarea").value;
  }
  if (type === "unicode")
    return encode
      ? input
          .split("")
          .map((c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"))
          .join("")
      : input.replace(/\\u\{([0-9a-f]{1,6})\}|\\u([0-9a-f]{4})/gi, (_, a, b) =>
          a
            ? String.fromCodePoint(parseInt(a, 16))
            : String.fromCharCode(parseInt(b, 16)),
        );
  throw new Error("未知的编码格式");
}
export function jwtDecode(token) {
  assertText(token, 20000, "JWT");
  const parts = token.trim().split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1])
    throw new Error("JWT 必须包含以点分隔的三个部分");
  const header = JSON.parse(fromBase64(parts[0], true)),
    payload = JSON.parse(fromBase64(parts[1], true));
  if (
    !header ||
    typeof header !== "object" ||
    Array.isArray(header) ||
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  )
    throw new Error("JWT Header 和 Payload 必须是 JSON 对象");
  return {
    header,
    payload,
    signature: parts[2],
    expired:
      typeof payload.exp === "number" ? payload.exp * 1000 <= Date.now() : null,
  };
}
export function timestampToDate(value, unit) {
  if (!/^-?\d+$/.test(value.trim())) throw new Error("请输入整数时间戳");
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error("时间戳超出安全整数范围");
  const d = new Date(number * (unit === "s" ? 1000 : 1));
  if (!Number.isFinite(d.getTime())) throw new Error("时间戳超出日期范围");
  return d;
}
export function dateToTimestamp(value, zone) {
  if (!value) throw new Error("请选择日期和时间");
  const d = new Date(value + (zone === "utc" ? "Z" : ""));
  if (!Number.isFinite(d.getTime())) throw new Error("无效的日期");
  return d;
}
export function formatDate(d, zone = "Asia/Shanghai") {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(d);
}
export function randomString(length, alphabet) {
  if (!globalThis.crypto?.getRandomValues)
    throw new Error("安全随机生成需要使用 HTTPS 访问");
  if (!Number.isInteger(length) || length < 1 || length > 256)
    throw new Error("长度须为 1–256 的整数");
  const chars = Array.from(alphabet);
  if (chars.length < 2 || chars.length > 256)
    throw new Error("字符集长度须为 2–256");
  const max = 256 - (256 % chars.length);
  const out = [];
  while (out.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (byte < max) out.push(chars[byte % chars.length]);
      if (out.length === length) break;
    }
  }
  return out.join("");
}
export function generateRandom(type, count, length, alphabet) {
  if (!globalThis.crypto?.randomUUID)
    throw new Error("UUID 生成需要使用 HTTPS 访问");
  if (!Number.isInteger(count) || count < 1 || count > 100)
    throw new Error("数量须为 1–100 的整数");
  return Array.from({ length: count }, () =>
    type === "uuid" ? crypto.randomUUID() : randomString(length, alphabet),
  ).join("\n");
}
export async function digest(data, algorithm, key = null) {
  if (!globalThis.crypto?.subtle)
    throw new Error("哈希计算需要使用 HTTPS 访问");
  const bytes =
    typeof data === "string" ? new TextEncoder().encode(data) : data;
  let output;
  if (key !== null) {
    if (!key) throw new Error("请输入 HMAC 密钥");
    const k = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(key),
      { name: "HMAC", hash: algorithm },
      false,
      ["sign"],
    );
    output = await crypto.subtle.sign("HMAC", k, bytes);
  } else output = await crypto.subtle.digest(algorithm, bytes);
  return Array.from(new Uint8Array(output), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export function textTransform(input, mode) {
  assertText(input);
  const words = input
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_\-]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
  switch (mode) {
    case "upper":
      return input.toUpperCase();
    case "lower":
      return input.toLowerCase();
    case "dedupe":
      return [...new Set(input.split(/\r?\n/))].join("\n");
    case "sort":
      return input
        .split(/\r?\n/)
        .sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true }))
        .join("\n");
    case "trim":
      return input
        .split(/\r?\n/)
        .map((x) => x.trim())
        .filter(Boolean)
        .join("\n");
    case "camel":
      return words
        .map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w))
        .join("");
    case "pascal":
      return words.map((w) => w[0].toUpperCase() + w.slice(1)).join("");
    case "snake":
      return words.join("_");
    case "kebab":
      return words.join("-");
    default:
      return input;
  }
}
export function yamlConvert(input, direction) {
  assertText(input);
  if (direction === "toJson") {
    const doc = parseDocument(input, { uniqueKeys: true, intAsBigInt: true });
    if (doc.errors.length) throw new Error(doc.errors[0].message);
    const value = doc.toJS({ maxAliasCount: 100 });
    checkStructure(value);
    return boundedOutput(stringify(value, null, 2));
  }
  checkJsonDepth(input);
  const data = parse(input);
  checkStructure(data);
  function convert(v) {
    if (isLosslessNumber(v))
      return /^-?\d+$/.test(v.value)
        ? BigInt(v.value)
        : isSafeNumber(v.value)
          ? Number(v.value)
          : v.value;
    if (Array.isArray(v)) return v.map(convert);
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.entries(v).map(([k, x]) => [k, convert(x)]),
      );
    return v;
  }
  return boundedOutput(yamlStringify(convert(data)));
}
export function sqlFormat(input, language = "sql", compact = false) {
  assertText(input, LIMITS.sql, "SQL 输入");
  return format(input, {
    language,
    keywordCase: "upper",
    ...(compact
      ? {
          indentStyle: "standard",
          tabWidth: 1,
          linesBetweenQueries: 0,
          expressionWidth: 100000,
        }
      : {}),
  });
}
export function cronNext(
  expression,
  timezone = "Asia/Shanghai",
  start = new Date(),
) {
  assertText(expression, 256, "Cron 表达式");
  const count = expression.trim().split(/\s+/).length;
  if (count !== 5 && count !== 6)
    throw new Error("请输入 5 位 Cron，或包含秒字段的 6 位 Cron");
  const interval = CronExpressionParser.parse(expression, {
    tz: timezone,
    currentDate: start,
  });
  return Array.from({ length: 8 }, () => interval.next().toDate());
}
export function cronDescribe(expression) {
  const parts = expression.trim().split(/\s+/),
    names =
      parts.length === 6
        ? ["秒", "分钟", "小时", "日", "月", "星期"]
        : ["分钟", "小时", "日", "月", "星期"];
  return parts.map((part, i) => ({
    name: names[i],
    value: part,
    description:
      part === "*"
        ? "每一个值"
        : part.startsWith("*/")
          ? `每 ${part.slice(2)} 个单位`
          : part.includes(",")
            ? `指定值：${part.split(",").join("、")}`
            : part.includes("-")
              ? `范围：${part}`
              : `指定值：${part}`,
  }));
}
