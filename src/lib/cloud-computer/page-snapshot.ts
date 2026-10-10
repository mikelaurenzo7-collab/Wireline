/**
 * In-page reader for the browser toolset's `read_page`, `find`, and
 * `get_page_text` members.
 *
 * The script is kept as source text and evaluated inside the page. Passing a
 * compiled function would let the server bundler inject helpers that do not
 * exist in the page. References are stable per element for the life of the
 * document (a WeakMap keeps `ref_N` fixed across reads), and each tagged
 * element carries `data-bb-ref` so the executor can resolve it later.
 */

export type SnapshotMode = "visible" | "interactive" | "all" | "find";

export type SnapshotArgs = {
  mode: SnapshotMode;
  depth: number;
  root?: string;
  query?: string;
  maxChars: number;
};

export const PAGE_SNAPSHOT_SOURCE = String.raw`(args) => {
  const w = window;
  if (!w.__bbRefs || w.__bbRefs.doc !== document) {
    w.__bbRefs = { doc: document, next: 1, byEl: new WeakMap() };
  }
  const reg = w.__bbRefs;
  const refFor = (el) => {
    let ref = reg.byEl.get(el);
    if (!ref) {
      ref = "ref_" + reg.next++;
      reg.byEl.set(el, ref);
    }
    if (el.getAttribute("data-bb-ref") !== ref) el.setAttribute("data-bb-ref", ref);
    return ref;
  };
  const clean = (value, max) => {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    return text.length > max ? text.slice(0, max - 1) + "…" : text;
  };
  const quote = (value) => '"' + value.replace(/"/g, "'") + '"';
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "META", "LINK", "HEAD"]);
  const INTERACTIVE = new Set([
    "link", "button", "textbox", "searchbox", "checkbox", "radio", "combobox", "listbox",
    "option", "slider", "spinbutton", "switch", "tab", "menuitem", "menuitemcheckbox",
    "menuitemradio", "treeitem",
  ]);
  const STRUCTURAL = new Set([
    "heading", "navigation", "main", "banner", "contentinfo", "complementary", "form",
    "dialog", "alertdialog", "region", "article", "table", "row", "cell", "columnheader",
    "list", "listitem", "img", "iframe", "alert", "status", "group", "tablist", "menu", "tree",
  ]);
  const TEXTY = new Set(["paragraph", "label", "text"]);
  const inputRole = (el) => {
    const type = (el.getAttribute("type") || "text").toLowerCase();
    if (["submit", "button", "reset", "image"].includes(type)) return "button";
    if (type === "checkbox") return "checkbox";
    if (type === "radio") return "radio";
    if (type === "range") return "slider";
    if (type === "number") return "spinbutton";
    if (type === "search") return "searchbox";
    if (type === "hidden") return null;
    return "textbox";
  };
  const roleOf = (el) => {
    const explicit = (el.getAttribute("role") || "").trim().split(/\s+/)[0];
    if (explicit && explicit !== "presentation" && explicit !== "none") return explicit;
    const tag = el.tagName;
    if (tag === "A") return el.hasAttribute("href") ? "link" : null;
    if (tag === "BUTTON" || tag === "SUMMARY") return "button";
    if (tag === "INPUT") return inputRole(el);
    if (tag === "SELECT") return el.multiple ? "listbox" : "combobox";
    if (tag === "TEXTAREA") return "textbox";
    if (tag === "OPTION") return "option";
    if (tag === "IMG") return el.getAttribute("alt") ? "img" : null;
    if (/^H[1-6]$/.test(tag)) return "heading";
    if (tag === "NAV") return "navigation";
    if (tag === "MAIN") return "main";
    if (tag === "HEADER") return el.closest("article,section,main") ? null : "banner";
    if (tag === "FOOTER") return el.closest("article,section,main") ? null : "contentinfo";
    if (tag === "ASIDE") return "complementary";
    if (tag === "FORM") return "form";
    if (tag === "DIALOG") return "dialog";
    if (tag === "TABLE") return "table";
    if (tag === "TR") return "row";
    if (tag === "TH") return "columnheader";
    if (tag === "TD") return "cell";
    if (tag === "UL" || tag === "OL") return "list";
    if (tag === "LI") return "listitem";
    if (tag === "ARTICLE") return "article";
    if (tag === "IFRAME") return "iframe";
    if (tag === "SECTION") return el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") ? "region" : null;
    if (tag === "P") return "paragraph";
    if (tag === "LABEL") return "label";
    if (el.isContentEditable && el.getAttribute("contenteditable") !== null) return "textbox";
    if (el.hasAttribute("onclick") || (el.tabIndex >= 0 && el.hasAttribute("tabindex"))) return "button";
    return null;
  };
  const textOf = (el) => clean(el.innerText !== undefined ? el.innerText : el.textContent, 120);
  const labelledBy = (el) => {
    const ids = (el.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean);
    return clean(ids.map((id) => { const node = document.getElementById(id); return node ? node.textContent : ""; }).join(" "), 120);
  };
  const nameOf = (el, role) => {
    const byRef = labelledBy(el);
    if (byRef) return byRef;
    const aria = clean(el.getAttribute("aria-label"), 120);
    if (aria) return aria;
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
      if (el.id) {
        const label = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
        if (label) return clean(label.textContent, 120);
      }
      const wrapping = el.closest("label");
      if (wrapping) return clean(wrapping.textContent, 120);
      const type = (el.getAttribute("type") || "").toLowerCase();
      if (["submit", "button", "reset"].includes(type) && el.value) return clean(el.value, 120);
      return clean(el.getAttribute("placeholder") || el.getAttribute("title") || el.getAttribute("name"), 120);
    }
    if (tag === "IMG") return clean(el.getAttribute("alt"), 120);
    if (role === "iframe") return clean(el.getAttribute("title") || el.getAttribute("name"), 120);
    if (["list", "table", "form", "navigation", "main", "banner", "contentinfo", "complementary", "row", "region", "article", "group", "tablist", "menu", "tree", "dialog"].includes(role)) {
      return clean(el.getAttribute("title"), 120);
    }
    return textOf(el) || clean(el.getAttribute("title"), 120);
  };
  const rendered = (el) => {
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
    if (Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const inViewport = (el) => {
    const rect = el.getBoundingClientRect();
    return rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
  };
  const describe = (el, role, name) => {
    let line = role + (name ? " " + quote(name) : "") + " [" + refFor(el) + "]";
    const tag = el.tagName;
    if (role === "heading") {
      const level = /^H([1-6])$/.exec(tag);
      line += " level=" + (level ? level[1] : el.getAttribute("aria-level") || "2");
    }
    if (role === "checkbox" || role === "radio" || role === "switch") {
      const checked = el.checked !== undefined ? el.checked : el.getAttribute("aria-checked") === "true";
      line += checked ? " checked" : " unchecked";
    }
    if ((tag === "INPUT" || tag === "TEXTAREA") && role !== "checkbox" && role !== "radio" && role !== "button") {
      const type = (el.getAttribute("type") || "").toLowerCase();
      if (el.value) line += type === "password" ? " value=\"••••\"" : " has_value";
    }
    if (tag === "SELECT") {
      const selected = el.options && el.selectedIndex >= 0 ? el.options[el.selectedIndex] : null;
      if (selected) line += " has_value";
    }
    // Link targets can carry one-time secrets in any path segment, query, or
    // fragment. The labeled ref still lets the Bot inspect and click a link.
    if (el.getAttribute("aria-expanded")) line += " expanded=" + el.getAttribute("aria-expanded");
    if (el.disabled || el.getAttribute("aria-disabled") === "true") line += " disabled";
    return line;
  };
  const include = (el, role) => {
    if (!role) return false;
    if (args.mode === "all" || args.mode === "find") return INTERACTIVE.has(role) || STRUCTURAL.has(role) || TEXTY.has(role);
    if (args.mode === "interactive") return INTERACTIVE.has(role);
    return (INTERACTIVE.has(role) || role === "heading" || role === "dialog" || role === "alert") && inViewport(el);
  };
  const children = (el) => {
    const list = Array.from(el.children);
    if (el.shadowRoot) list.push(...Array.from(el.shadowRoot.children));
    return list;
  };

  if (args.mode === "text") {
    const candidates = Array.from(document.querySelectorAll("main, article, [role=main]"));
    let best = document.body;
    let bestLength = 0;
    for (const node of candidates) {
      const length = (node.innerText || "").length;
      if (length > bestLength) { best = node; bestLength = length; }
    }
    if (bestLength < 200) best = document.body;
    const text = String(best ? best.innerText : "").replace(/\n{3,}/g, "\n\n").trim();
    const title = document.title ? "Title: " + clean(document.title, 200) + "\n\n" : "";
    const full = title + text;
    return full.length > args.maxChars ? full.slice(0, args.maxChars) + "\n[Truncated]" : full;
  }

  const lines = [];
  let length = 0;
  let truncated = false;
  const emit = (line) => {
    if (truncated) return;
    if (length + line.length + 1 > args.maxChars) { truncated = true; return; }
    lines.push(line);
    length += line.length + 1;
  };

  if (args.mode === "find") {
    const words = String(args.query || "").toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 1);
    const synonyms = {
      field: ["textbox", "searchbox", "combobox"], input: ["textbox", "searchbox", "combobox"],
      box: ["textbox", "searchbox", "checkbox", "combobox"], search: ["searchbox", "textbox"],
      dropdown: ["combobox", "listbox"], select: ["combobox", "listbox"], menu: ["menu", "menuitem", "combobox"],
      button: ["button"], link: ["link"], checkbox: ["checkbox"], toggle: ["switch", "checkbox"],
      tab: ["tab"], image: ["img"], title: ["heading"], heading: ["heading"],
    };
    const scored = [];
    const walk = (el) => {
      if (SKIP.has(el.tagName) || el.getAttribute("aria-hidden") === "true") return;
      if (el !== document.body && !rendered(el) && el.tagName !== "OPTION") return;
      const role = roleOf(el);
      if (role && (INTERACTIVE.has(role) || STRUCTURAL.has(role) || TEXTY.has(role))) {
        const name = nameOf(el, role);
        const haystack = (role + " " + name + " " + (el.getAttribute("placeholder") || "") + " " + (el.getAttribute("name") || "") + " " + (el.id || "")).toLowerCase();
        let score = 0;
        for (const word of words) {
          if (haystack.includes(word)) score += 2;
          if ((synonyms[word] || []).includes(role)) score += 1;
        }
        if (INTERACTIVE.has(role)) score += 0.25;
        if (score > 0.25) scored.push({ score, el, role, name });
      }
      for (const child of children(el)) walk(child);
    };
    walk(document.body);
    scored.sort((a, b) => b.score - a.score);
    for (const item of scored.slice(0, 20)) emit(describe(item.el, item.role, item.name));
    return lines.length ? lines.join("\n") : "No matching elements. Try read_page for the full list.";
  }

  let start = document.body;
  if (args.root) {
    const node = document.querySelector('[data-bb-ref="' + args.root + '"]');
    if (!node) return "Error: " + args.root + " is stale or not found on the current page. Re-read the page to get fresh references.";
    start = node;
  }
  const walk = (el, depth) => {
    if (truncated || SKIP.has(el.tagName) || el.getAttribute("aria-hidden") === "true") return;
    if (el !== document.body && el !== start && !rendered(el) && args.mode !== "interactive") return;
    if (args.mode === "interactive" && el.tagName !== "BODY" && getComputedStyle(el).display === "none") return;
    const role = roleOf(el);
    let next = depth;
    if (el !== document.body && include(el, role)) {
      emit("  ".repeat(depth) + describe(el, role, nameOf(el, role)));
      next = depth + 1;
    }
    if (next >= args.depth) return;
    for (const child of children(el)) walk(child, next);
  };
  walk(start, 0);
  if (!lines.length) return args.mode === "visible" ? "No interactive elements are visible. Scroll, or use filter all." : "No matching elements on this page.";
  if (truncated) lines.push("[Output truncated at " + args.maxChars + " characters. Narrow with a smaller depth or a ref subtree.]");
  return lines.join("\n");
}`;

/** Build the expression evaluated by Playwright for one read. */
export function snapshotExpression(
  args: SnapshotArgs | { mode: "text"; maxChars: number },
): string {
  return `(${PAGE_SNAPSHOT_SOURCE})(${JSON.stringify(args)})`;
}
