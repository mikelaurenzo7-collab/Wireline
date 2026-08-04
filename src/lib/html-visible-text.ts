const EXCLUDED_CONTAINER_TAGS = new Set([
  "head",
  "noscript",
  "script",
  "style",
  "svg",
  "template",
]);

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const BLOCK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "div",
  "dl",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);

type ParsedTag = {
  tagName: string;
  attributes: string;
  closing: boolean;
  selfClosing: boolean;
};

type OpenElement = {
  tagName: string;
  hidden: boolean;
};

function findTagEnd(html: string, start: number): number {
  let quote: '"' | "'" | null = null;
  for (let index = start + 1; index < html.length; index += 1) {
    const character = html[index];
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === ">") return index;
  }
  return -1;
}

function parseTag(rawTag: string): ParsedTag | null {
  let body = rawTag.slice(1, -1).trim();
  if (!body || body.startsWith("!") || body.startsWith("?")) return null;

  const closing = body.startsWith("/");
  if (closing) body = body.slice(1).trimStart();
  const nameMatch = body.match(/^([A-Za-z][A-Za-z0-9:_-]*)/);
  if (!nameMatch) return null;

  const tagName = nameMatch[1].toLowerCase();
  const remainder = body.slice(nameMatch[0].length);
  return {
    tagName,
    attributes: closing ? "" : remainder.replace(/\/\s*$/, ""),
    closing,
    selfClosing: !closing && /\/\s*$/.test(remainder),
  };
}

function parseAttributes(raw: string): Map<string, string | null> {
  const attributes = new Map<string, string | null>();
  let index = 0;

  while (index < raw.length) {
    while (index < raw.length && /\s/.test(raw[index])) index += 1;
    if (index >= raw.length || raw[index] === "/") break;

    const nameStart = index;
    while (index < raw.length && !/[\s=/>]/.test(raw[index])) index += 1;
    const name = raw.slice(nameStart, index).trim().toLowerCase();
    if (!name) {
      index += 1;
      continue;
    }

    while (index < raw.length && /\s/.test(raw[index])) index += 1;
    let value: string | null = null;
    if (raw[index] === "=") {
      index += 1;
      while (index < raw.length && /\s/.test(raw[index])) index += 1;
      const quote = raw[index] === '"' || raw[index] === "'" ? raw[index] : null;
      if (quote) {
        index += 1;
        const valueStart = index;
        while (index < raw.length && raw[index] !== quote) index += 1;
        value = raw.slice(valueStart, index);
        if (raw[index] === quote) index += 1;
      } else {
        const valueStart = index;
        while (index < raw.length && !/[\s>]/.test(raw[index])) index += 1;
        value = raw.slice(valueStart, index);
      }
    }

    if (!attributes.has(name)) attributes.set(name, value);
  }

  return attributes;
}

function hasExplicitHiddenState(rawAttributes: string): boolean {
  const attributes = parseAttributes(rawAttributes);
  // HTML boolean attributes are true by presence; hidden="false" is still hidden.
  if (attributes.has("hidden")) return true;
  if ((attributes.get("aria-hidden") || "").trim().toLowerCase() === "true") return true;

  const style = (attributes.get("style") || "").replace(/\/\*[\s\S]*?\*\//g, "");
  return (
    /(?:^|;)\s*display\s*:\s*none\b/i.test(style) ||
    /(?:^|;)\s*visibility\s*:\s*hidden\b/i.test(style)
  );
}

function findExcludedContainerEnd(html: string, tagName: string, start: number): number {
  const closePattern = new RegExp(`<\\/\\s*${tagName}\\b`, "gi");
  closePattern.lastIndex = start;
  const closeMatch = closePattern.exec(html);
  if (!closeMatch) return html.length;
  const closeEnd = findTagEnd(html, closeMatch.index);
  return closeEnd === -1 ? html.length : closeEnd + 1;
}

function closeElement(stack: OpenElement[], tagName: string): { visible: boolean } | null {
  let matchIndex = -1;
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    if (stack[index].tagName === tagName) {
      matchIndex = index;
      break;
    }
  }
  if (matchIndex === -1) return null;

  const matching = stack[matchIndex];
  stack.splice(matchIndex);
  return { visible: !matching.hidden };
}

/**
 * Extract page-readable text from bounded HTML without executing or rendering it.
 *
 * This intentionally does not pretend to implement a browser CSS cascade. It
 * removes non-content containers and content explicitly hidden in the markup by
 * `hidden`, `aria-hidden="true"`, inline `display:none`, or inline
 * `visibility:hidden`. A stack preserves nested hidden state and visible
 * siblings without relying on fragile same-tag regular expressions.
 */
export function extractVisibleHtmlText(html: string): string {
  const output: string[] = [];
  const stack: OpenElement[] = [];
  let hiddenDepth = 0;
  let index = 0;

  while (index < html.length) {
    if (html[index] !== "<") {
      const nextTag = html.indexOf("<", index);
      const end = nextTag === -1 ? html.length : nextTag;
      if (hiddenDepth === 0) output.push(html.slice(index, end));
      index = end;
      continue;
    }

    if (html.startsWith("<!--", index)) {
      const commentEnd = html.indexOf("-->", index + 4);
      index = commentEnd === -1 ? html.length : commentEnd + 3;
      continue;
    }

    const tagEnd = findTagEnd(html, index);
    if (tagEnd === -1) {
      if (hiddenDepth === 0) output.push("<");
      index += 1;
      continue;
    }

    const rawTag = html.slice(index, tagEnd + 1);
    const parsed = parseTag(rawTag);
    if (!parsed) {
      index = tagEnd + 1;
      continue;
    }

    if (parsed.closing) {
      const closed = closeElement(stack, parsed.tagName);
      hiddenDepth = stack.reduce((count, element) => count + (element.hidden ? 1 : 0), 0);
      if (closed?.visible && hiddenDepth === 0 && BLOCK_TAGS.has(parsed.tagName)) {
        output.push("\n");
      }
      index = tagEnd + 1;
      continue;
    }

    if (EXCLUDED_CONTAINER_TAGS.has(parsed.tagName)) {
      index = findExcludedContainerEnd(html, parsed.tagName, tagEnd + 1);
      continue;
    }

    const inheritedHidden = hiddenDepth > 0;
    const hidden = inheritedHidden || hasExplicitHiddenState(parsed.attributes);
    const voidElement = parsed.selfClosing || VOID_TAGS.has(parsed.tagName);

    if ((parsed.tagName === "br" || parsed.tagName === "hr") && !hidden) output.push("\n");
    if (!voidElement) {
      stack.push({ tagName: parsed.tagName, hidden });
      if (hidden) hiddenDepth += 1;
    }
    index = tagEnd + 1;
  }

  return output.join("");
}
