self.onmessage = ({ data: { pattern, flags, text, replacement } }) => {
  try {
    const re = new RegExp(pattern, flags),
      matches = [];
    let match;
    while ((match = re.exec(text)) !== null) {
      matches.push({
        index: match.index,
        value: match[0],
        groups: Array.from(match).slice(1),
        named: match.groups,
      });
      if (!re.global || matches.length >= 1000) break;
      if (match[0] === "") {
        const cp = text.codePointAt(re.lastIndex);
        re.lastIndex += re.unicode && cp > 0xffff ? 2 : 1;
      }
    }
    const replaced = text.replace(new RegExp(pattern, flags), replacement);
    postMessage({ matches, replaced, truncated: matches.length >= 1000 });
  } catch (e) {
    postMessage({ error: e.message });
  }
};
