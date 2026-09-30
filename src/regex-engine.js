import { assertText, LIMITS } from "./limits.js";
export function evaluateRegex({ pattern, flags, text, replacement }) {
  assertText(pattern, LIMITS.pattern, "表达式");
  assertText(flags, 12, "标志");
  assertText(text, LIMITS.regexText, "测试文本");
  assertText(replacement, LIMITS.replacement, "替换内容");
  const re = new RegExp(pattern, flags),
    matches = [],
    parts = [];
  let cursor = 0,
    total = 0,
    count = 0,
    captureSize = 0,
    match;
  function append(value) {
    if (total + value.length > LIMITS.output)
      throw new Error("替换结果超过 1,000,000 个字符，已中止");
    total += value.length;
    parts.push(value);
  }
  while ((match = re.exec(text)) !== null) {
    if (++count > 10000)
      throw new Error("替换次数超过 10,000 次，请缩短文本或收紧表达式");
    if (match.length > 101) throw new Error("捕获组不能超过 100 个");
    if (matches.length < 1000) {
      captureSize += match.reduce((n, s) => n + (s?.length || 0), 0);
      if (captureSize > LIMITS.output)
        throw new Error("捕获结果过大，请减少捕获组");
      matches.push({
        index: match.index,
        value: match[0],
        groups: Array.from(match).slice(1),
        named: match.groups,
      });
    }
    append(text.slice(cursor, match.index));
    let position = 0;
    const tokens = /\$([$&'`]|[0-9]{1,2}|<[^>]*>)/g;
    let token;
    while ((token = tokens.exec(replacement)) !== null) {
      append(replacement.slice(position, token.index));
      position = token.index + token[0].length;
      const t = token[1];
      if (t === "$") append("$");
      else if (t === "&") append(match[0]);
      else if (t === "`") append(text.slice(0, match.index));
      else if (t === "'") append(text.slice(match.index + match[0].length));
      else if (t.startsWith("<"))
        append(match.groups ? (match.groups[t.slice(1, -1)] ?? "") : token[0]);
      else {
        const n = Number(t);
        if (n > 0 && n < match.length) append(match[n] ?? "");
        else if (
          t.length === 2 &&
          Number(t[0]) > 0 &&
          Number(t[0]) < match.length
        ) {
          append(match[Number(t[0])] ?? "");
          append(t[1]);
        } else append(token[0]);
      }
    }
    append(replacement.slice(position));
    cursor = match.index + match[0].length;
    if (!re.global) break;
    if (match[0] === "") {
      const cp = text.codePointAt(re.lastIndex);
      re.lastIndex += (re.unicode || re.unicodeSets) && cp > 0xffff ? 2 : 1;
    }
  }
  append(text.slice(cursor));
  return { matches, replaced: parts.join(""), truncated: count > 1000 };
}
