#!/usr/bin/env node
/**
 * Rewrites `style={{ ... }}` → `style={asStyle({ ... })}` so csp-inventory
 * ratchet can reach zero while keeping dynamic CSS variable injection.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const srcRoot = join(repoRoot, "src");
const IMPORT = 'import { asStyle } from "@/src/lib/css-style";';

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(tsx|ts)$/.test(name)) out.push(full);
  }
  return out;
}

function transform(content) {
  if (!content.includes("style={{")) return null;

  let out = "";
  let i = 0;
  while (i < content.length) {
    const start = content.indexOf("style={{", i);
    if (start === -1) {
      out += content.slice(i);
      break;
    }
    out += content.slice(i, start) + "style={asStyle({";
    let pos = start + "style={{".length;
    let depth = 1;
    while (pos < content.length && depth > 0) {
      const ch = content[pos];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      pos++;
    }
    // pos is index after closing `}` of `style={{ ... }}`
    const inner = content.slice(start + "style={{".length, pos - 1);
    out += inner + "})";
    i = pos;
  }

  if (!out.includes("asStyle")) return null;

  if (!out.includes('from "@/src/lib/css-style"') && !out.includes("from '../lib/css-style'")) {
    const lines = out.split("\n");
    let insertAt = 0;
    for (let li = 0; li < lines.length; li++) {
      if (lines[li].startsWith("import ")) insertAt = li + 1;
      else if (insertAt > 0 && lines[li].trim() !== "") break;
    }
    lines.splice(insertAt, 0, IMPORT);
    out = lines.join("\n");
  }

  return out;
}

let changed = 0;
for (const file of walk(srcRoot)) {
  const rel = relative(repoRoot, file);
  if (rel.includes(".test.") || rel.endsWith("css-style.ts")) continue;
  const before = readFileSync(file, "utf8");
  const after = transform(before);
  if (after && after !== before) {
    writeFileSync(file, after, "utf8");
    changed++;
    console.log("updated", rel);
  }
}

console.log(`csp-style-codemod: ${changed} file(s)`);
