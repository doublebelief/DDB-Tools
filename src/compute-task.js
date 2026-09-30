import * as lib from "./lib.js";
import { diffLines } from "diff";
import { marked } from "marked";
import { assertText, boundedOutput, LIMITS, checkStructure } from "./limits.js";
export function computeTask(type, args) {
  switch (type) {
    case "json": {
      const text = lib.jsonFormat(args.input, args.compact);
      return {
        text,
        treeAvailable:
          checkStructure(lib.parse(args.input)) <= LIMITS.treeNodes,
      };
    }
    case "yaml":
      return boundedOutput(lib.yamlConvert(args.input, args.direction));
    case "sql":
      return boundedOutput(
        lib.sqlFormat(args.input, args.language, args.compact),
      );
    case "diff": {
      assertText(args.left + args.right, 100_000, "对比文本总长度");
      const result = diffLines(args.left, args.right, {
        ignoreWhitespace: args.ignore,
        timeout: 1000,
      });
      if (!result) throw new Error("差异计算超时，请缩短文本");
      if (result.length > 2000) throw new Error("差异片段过多，请分段比较");
      return result;
    }
    case "markdown":
      assertText(args.input, LIMITS.markdown);
      return boundedOutput(
        marked.parse(args.input, { gfm: true, breaks: false }),
      );
    default:
      throw new Error("不支持的处理任务");
  }
}
