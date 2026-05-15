/**
 * Audit script: find references to `schema.<table>.<column>` in source that
 * resolve to undefined at runtime. This is the same class of bug as the
 * email_threads.read / email_threads.agentId drift we just fixed —
 * tsconfig is non-strict so the references compile clean and only surface
 * at runtime, typically swallowed by a catch handler.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import * as schema from "../src/db/schema.ts";
import { getTableColumns } from "drizzle-orm/utils";

const REPO_ROOT = resolve(import.meta.dirname!, "..");
const SRC_ROOTS = [join(REPO_ROOT, "src"), join(REPO_ROOT, "server.ts")];
const IGNORE_DIRS = new Set(["node_modules", "dist", ".git", "__tests__"]);
const IGNORE_FILE_RE = /\.test\.tsx?$/;

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (IGNORE_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !IGNORE_FILE_RE.test(name)) out.push(full);
  }
  return out;
}

const files: string[] = [];
for (const root of SRC_ROOTS) {
  try {
    const st = statSync(root);
    if (st.isDirectory()) walk(root, files);
    else files.push(root);
  } catch {
    /* ignore */
  }
}

// Build the set of valid columns per table export
const tableColumns: Record<string, Set<string>> = {};
for (const [exportName, val] of Object.entries(schema)) {
  if (!val || typeof val !== "object") continue;
  try {
    const cols = getTableColumns(val as Parameters<typeof getTableColumns>[0]);
    tableColumns[exportName] = new Set(Object.keys(cols));
  } catch {
    /* not a table */
  }
}

const tableRe = /\bschema\.(\w+)\.(\w+)\b/g;
type Hit = { file: string; line: number; table: string; column: string; snippet: string };
const hits: Hit[] = [];

for (const file of files) {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes("schema.")) continue;
    tableRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = tableRe.exec(line))) {
      const [, table, column] = m;
      const tableCols = tableColumns[table];
      if (!tableCols) continue; // unknown table — not actionable here
      if (!tableCols.has(column)) {
        // Allow methods that exist on Drizzle PgTable shape itself
        if (["$inferSelect", "$inferInsert", "getSQL"].includes(column)) continue;
        hits.push({
          file: file.replace(`${REPO_ROOT}/`, ""),
          line: i + 1,
          table,
          column,
          snippet: line.trim().slice(0, 160),
        });
      }
    }
  }
}

if (hits.length === 0) {
  console.log("OK — no undeclared column references found.");
} else {
  console.log(`Found ${hits.length} undeclared column reference(s):\n`);
  for (const h of hits) {
    console.log(`  ${h.file}:${h.line}  schema.${h.table}.${h.column}`);
    console.log(`    ${h.snippet}`);
  }
  process.exitCode = 1;
}
