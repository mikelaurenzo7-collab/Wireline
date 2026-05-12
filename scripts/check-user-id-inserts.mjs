#!/usr/bin/env node
/**
 * CI guard: detect service-role inserts into wireline_* tables that
 * are missing an explicit `user_id` field. RLS policies expect every
 * row to carry user_id for tenant isolation — omitting it means the
 * row is invisible to the owning operator.
 *
 * Strategy: static regex scan for `db.from("wireline_<table>").insert(`
 * followed by an object literal. If the object doesn't contain the
 * string `user_id`, flag it. This is intentionally over-sensitive (it
 * may flag valid cases like upserts on tables without user_id) — the
 * allowlist below exempts known-safe patterns.
 *
 * Exit 0 if clean, exit 1 if violations found.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");

// Tables that intentionally don't have a user_id column (system tables).
const EXEMPT_TABLES = new Set([
  "wireline_webhook_deliveries", // keyed by webhook_id which is already user-scoped
]);

// Patterns where the insert doesn't need user_id (e.g. upsert on webhook deliveries).
const EXEMPT_COMMENTS = /\/\/ no-user-id-ok/;

function walk(dir, ext, results = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
      walk(full, ext, results);
    } else if (entry.name.endsWith(ext)) {
      results.push(full);
    }
  }
  return results;
}

const INSERT_PATTERN = /db\.from\(\s*["'`](wireline_\w+)["'`]\s*\)\s*\.insert\s*\(/g;

let violations = 0;
const files = walk(ROOT, ".ts");

for (const file of files) {
  const content = readFileSync(file, "utf8");
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match;
    INSERT_PATTERN.lastIndex = 0;

    while ((match = INSERT_PATTERN.exec(line)) !== null) {
      const table = match[1];
      if (EXEMPT_TABLES.has(table)) continue;

      // Check if the previous line has the exemption comment
      if (i > 0 && EXEMPT_COMMENTS.test(lines[i - 1])) continue;
      // Check same line
      if (EXEMPT_COMMENTS.test(line)) continue;

      // Look back up to 20 lines AND ahead up to 15 lines for `user_id`.
      // Row objects are often constructed before the .insert() call, so
      // a forward-only scan produces false positives.
      const before = lines.slice(Math.max(0, i - 20), i).join("\n");
      const after = lines.slice(i, Math.min(i + 15, lines.length)).join("\n");
      const window = before + "\n" + after;
      if (!window.includes("user_id")) {
        const rel = relative(ROOT, file);
        console.error(
          `[user_id-guard] ${rel}:${i + 1} — insert into "${table}" appears to be missing user_id`
        );
        violations++;
      }
    }
  }
}

if (violations > 0) {
  console.error(`\n❌ ${violations} insert(s) into wireline_* tables without user_id detected.`);
  console.error("   Add user_id to the insert, or add '// no-user-id-ok' on the line above to exempt.");
  process.exit(1);
} else {
  console.log("✓ All wireline_* inserts include user_id (or are exempted).");
}
