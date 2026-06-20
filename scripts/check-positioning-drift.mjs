#!/usr/bin/env node
/**
 * Guard against resurrecting Wireline's old business-only positioning.
 * The active story is consumer-first call concierge + one configurable console.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

const scannedRoots = ["README.md", "index.html", "src", "marketing-kit"].map((p) =>
  resolve(repoRoot, p),
);

const banned = [
  {
    re: /horizontal AI agent platform for businesses/gi,
    hint: "Use consumer-first call concierge positioning.",
  },
  {
    re: /full-stack AI agent platform for businesses/gi,
    hint: "Use personal AI call concierge + configurable console.",
  },
  {
    re: /Business Starter|Business Growth/gi,
    hint: "Use Studio / Operator packaging; keep ids only in code/env contexts.",
  },
  {
    re: /\$99(?:\/mo)?|\$249(?:\/mo)?|\$699(?:\/mo)?|Custom\+/gi,
    hint: "Old fixed business pricing. Use current plan-catalog pricing.",
  },
];

const allow = [
  /src\/lib\/plan-catalog\.ts$/, // canonical ids/env names still include business-starter and business env vars
  /src\/lib\/plan-catalog\.test\.ts$/,
  /scripts\/check-positioning-drift\.mjs$/,
];

const issues = [];
for (const file of collect(scannedRoots)) {
  const rel = relative(repoRoot, file).replaceAll("\\", "/");
  if (allow.some((re) => re.test(rel))) continue;
  const text = readFileSync(file, "utf8");
  for (const rule of banned) {
    rule.re.lastIndex = 0;
    const match = rule.re.exec(text);
    if (match) {
      issues.push(`${rel}: found "${match[0]}" — ${rule.hint}`);
    }
  }
}

if (issues.length) {
  console.error("📛 Positioning drift detected:\n");
  for (const issue of issues) console.error(`  ❌ ${issue}`);
  process.exit(1);
}

console.log("✅ consumer-first positioning copy is in sync");

function collect(paths, out = []) {
  for (const path of paths) {
    const st = statSync(path);
    if (st.isDirectory()) {
      for (const entry of readdirSync(path)) {
        if (["node_modules", "dist", ".git"].includes(entry)) continue;
        collect([join(path, entry)], out);
      }
    } else if (/\.(md|html|ts|tsx)$/.test(path)) {
      out.push(path);
    }
  }
  return out;
}
