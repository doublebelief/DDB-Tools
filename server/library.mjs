import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
const ID = /^[a-f0-9]{24}$/;
const fail = (status, message) => Object.assign(new Error(message), { status });
const heading =
  /^(?:第[〇零一二三四五六七八九十百千万两\d]+[章节回卷部篇](?:\s|[：:、.]|$|[^\d]).*|(?:序章|楔子|序言|引子|尾声|后记|番外)(?:\s.*|[：:].*|$)|chapter\s+\d+.*)$/i;
export function parseNovel(text) {
  text = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\0/g, "");
  if (!text.trim() || text.length > 12_000_000)
    throw new Error("小说须包含正文，且不超过 1,200 万字符");
  const chapters = [];
  let title = "正文",
    lines = [],
    length = 0,
    part = 1;
  function flush() {
    const content = lines.join("\n").trim();
    if (content) {
      chapters.push({
        title: title + (part > 1 ? `（续 ${part}）` : ""),
        content,
      });
      if (chapters.length > 5000) throw new Error("章节过多，上限为 5,000 节");
    }
    lines = [];
    length = 0;
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length <= 80 && heading.test(trimmed)) {
      flush();
      title = trimmed;
      part = 1;
      continue;
    }
    // Bound even unbroken paragraphs; reading never downloads the whole book.
    for (let i = 0; i < Math.max(1, line.length); i += 10000) {
      const piece = line.slice(i, i + 10000);
      if (length + piece.length + 1 > 12000) {
        flush();
        part++;
      }
      lines.push(piece);
      length += piece.length + 1;
    }
  }
  flush();
  if (!chapters.length) throw new Error("没有识别到小说正文");
  return chapters;
}
async function readJson(file, max = 1_500_000) {
  const info = await fs.lstat(file);
  if (!info.isFile() || info.size > max)
    throw new Error("Invalid library file");
  return JSON.parse(await fs.readFile(file, "utf8"));
}
export async function libraryResponse(root, route) {
  if (!root) throw fail(503, "书架尚未配置");
  const match =
    /^\/api\/ai\/library(?:\/([a-f0-9]{24})(?:\/(\d{1,4}))?)?$/.exec(route);
  if (!match) throw fail(404, "未找到这本书或章节");
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  try {
    if (!match[1]) {
      const entries = await fs.readdir(root, { withFileTypes: true });
      const books = [];
      for (const entry of entries
        .filter((e) => e.isDirectory() && ID.test(e.name))
        .slice(0, 300)) {
        const meta = await readJson(path.join(root, entry.name, "book.json"));
        books.push({
          id: entry.name,
          title: meta.title,
          author: meta.author,
          chapterCount: meta.chapters.length,
          characters: meta.characters,
        });
      }
      return {
        books: books.sort((a, b) => a.title.localeCompare(b.title, "zh")),
      };
    }
    const directory = path.join(root, match[1]);
    if (!(await fs.lstat(directory)).isDirectory())
      throw fail(404, "未找到这本书");
    const book = await readJson(path.join(directory, "book.json"));
    if (match[2] === undefined) return book;
    const chapter = Number(match[2]);
    if (!Number.isInteger(chapter) || chapter >= book.chapters.length)
      throw fail(404, "未找到章节");
    return await readJson(path.join(directory, `${chapter}.json`), 100000);
  } catch (e) {
    if (e.code === "ENOENT") throw fail(404, "未找到这本书或章节");
    throw e;
  }
}
export async function importNovel({
  file,
  root,
  title,
  author = "",
  encoding = "auto",
}) {
  if (!path.isAbsolute(root))
    throw new Error("书库必须是仓库和网站目录之外的绝对路径");
  if (!title?.trim() || title.length > 100 || author.length > 100)
    throw new Error("书名必填，书名和作者各不超过 100 字符");
  if (!["auto", "utf-8", "gb18030"].includes(encoding))
    throw new Error("编码仅支持 auto、utf-8、gb18030");
  if ((await fs.stat(file)).size > 20 * 1024 * 1024)
    throw new Error("TXT 文件上限为 20 MB");
  const bytes = await fs.readFile(file);
  let text;
  try {
    text = new TextDecoder(encoding === "auto" ? "utf-8" : encoding, {
      fatal: true,
    }).decode(bytes);
  } catch (e) {
    if (encoding !== "auto") throw e;
    text = new TextDecoder("gb18030", { fatal: true }).decode(bytes);
  }
  const chapters = parseNovel(text),
    id = createHash("sha256").update(bytes).digest("hex").slice(0, 24);
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const entries = await fs.readdir(root);
  if (entries.includes(id)) throw new Error("这份 TXT 已导入");
  if (entries.filter((name) => ID.test(name)).length >= 300)
    throw new Error("书架最多 300 本");
  const temporary = path.join(root, `.import-${randomUUID()}`);
  await fs.mkdir(temporary, { mode: 0o700 });
  try {
    const book = {
      id,
      title: title.trim(),
      author: author.trim(),
      characters: text.length,
      chapters: chapters.map((c, i) => ({ index: i, title: c.title })),
    };
    await fs.writeFile(
      path.join(temporary, "book.json"),
      JSON.stringify(book),
      { mode: 0o600 },
    );
    for (let i = 0; i < chapters.length; i++)
      await fs.writeFile(
        path.join(temporary, `${i}.json`),
        JSON.stringify({ index: i, ...chapters[i] }),
        { mode: 0o600 },
      );
    await fs.rename(temporary, path.join(root, id));
    return { id, chapters: chapters.length };
  } catch (e) {
    await fs.rm(temporary, { recursive: true, force: true });
    throw e;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [file, root, title, author, encoding] = process.argv.slice(2);
  if (!file || !root || !title)
    throw new Error(
      "Usage: node server/library.mjs <txt> <private-library-directory> <title> [author] [auto|utf-8|gb18030]",
    );
  console.log(
    JSON.stringify(await importNovel({ file, root, title, author, encoding })),
  );
}
