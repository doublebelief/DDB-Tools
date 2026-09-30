export const LIMITS = Object.freeze({
  input: 200_000,
  output: 1_000_000,
  depth: 64,
  nodes: 10_000,
  treeNodes: 2_000,
  regexText: 100_000,
  pattern: 2_000,
  replacement: 10_000,
  markdown: 50_000,
  sql: 100_000,
});
export function assertText(text, limit = LIMITS.input, label = "输入") {
  if (typeof text !== "string") throw new Error(`${label}必须为文本`);
  if (text.length > limit)
    throw new Error(
      `${label}上限为 ${limit.toLocaleString("en-US")} 个字符，请缩短后重试`,
    );
  return text;
}
export function boundedOutput(text) {
  return assertText(text, LIMITS.output, "输出");
}
// Check before recursive JSON parsers run. Brackets inside strings do not count.
export function checkJsonDepth(text) {
  assertText(text);
  let depth = 0,
    quoted = false,
    escaped = false;
  for (const c of text) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === "{" || c === "[") {
      if (++depth > LIMITS.depth)
        throw new Error(`数据嵌套不能超过 ${LIMITS.depth} 层`);
    } else if (c === "}" || c === "]") depth--;
  }
}
export function checkStructure(value, maxNodes = LIMITS.nodes) {
  const stack = [{ value, depth: 0, ancestors: new Set() }];
  let count = 0;
  while (stack.length) {
    const entry = stack.pop();
    if (++count > maxNodes)
      throw new Error(
        `数据节点不能超过 ${maxNodes.toLocaleString("en-US")} 个`,
      );
    if (entry.depth > LIMITS.depth)
      throw new Error(`数据嵌套不能超过 ${LIMITS.depth} 层`);
    if (
      !entry.value ||
      typeof entry.value !== "object" ||
      entry.value.isLosslessNumber === true
    )
      continue;
    if (entry.ancestors.has(entry.value))
      throw new Error("不支持循环引用的数据");
    const values = Object.values(entry.value);
    if (values.length + count + stack.length > maxNodes)
      throw new Error(
        `数据节点不能超过 ${maxNodes.toLocaleString("en-US")} 个`,
      );
    const ancestors = new Set(entry.ancestors);
    ancestors.add(entry.value);
    for (const v of values)
      stack.push({ value: v, depth: entry.depth + 1, ancestors });
  }
  return count;
}
