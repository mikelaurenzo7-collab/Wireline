#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const srcRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "src");
const BROKEN = /import \{\r?\nimport \{ asStyle \} from "@\/lib\/css-style";\r?\n/g;
const FIXED =
  'import { asStyle } from "@/lib/css-style";\nimport {\n';

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(tsx|ts)$/.test(name)) out.push(full);
  }
  return out;
}

let n = 0;
for (const file of walk(srcRoot)) {
  const before = readFileSync(file, "utf8");
  if (!BROKEN.test(before)) continue;
  const after = before.replace(BROKEN, FIXED);
  writeFileSync(file, after, "utf8");
  n++;
  console.log("fixed", file);
}
console.log(`fix-asstyle-imports: ${n} file(s)`);
