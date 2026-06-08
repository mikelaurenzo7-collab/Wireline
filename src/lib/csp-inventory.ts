/**
 * CSP inline-style inventory — shared between the CI script and unit tests.
 *
 * Counts React `style={` props and `<style` JSX children in `.tsx` files.
 * Comments are stripped before matching so doc examples cannot break the ratchet.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "../..");
const srcRoot = join(repoRoot, "src");
const baselinePath = join(repoRoot, "scripts/csp-inventory-baseline.json");

const STYLE_PROP_PATTERN = /style=\{/g;
const STYLE_TAG_PATTERN = /<style[\s>/]/gi;
const TSX_EXTENSION = ".tsx";

/** Strip block and line comments before pattern matching. */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n\r]*/g, "");
}

export function countStyleProps(source: string): number {
  const matches = stripComments(source).match(STYLE_PROP_PATTERN);
  return matches ? matches.length : 0;
}

export function countStyleTags(source: string): number {
  const matches = stripComments(source).match(STYLE_TAG_PATTERN);
  return matches ? matches.length : 0;
}

function walkTsx(dir: string): string[] {
  const entries: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      entries.push(...walkTsx(full));
    } else if (name.endsWith(TSX_EXTENSION)) {
      entries.push(full);
    }
  }
  return entries;
}

export interface CspInventorySnapshot {
  total: number;
  styleTags: number;
  perFile: Record<string, number>;
  styleTagsPerFile: Record<string, number>;
  fileCount: number;
  styleTagFileCount: number;
}

export function inventory(): CspInventorySnapshot {
  const files = walkTsx(srcRoot);
  const perFile: Record<string, number> = {};
  const styleTagsPerFile: Record<string, number> = {};
  let total = 0;
  let styleTags = 0;

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const propCount = countStyleProps(text);
    const tagCount = countStyleTags(text);
    const rel = relative(repoRoot, file).replace(/\\/g, "/");

    if (propCount > 0) {
      perFile[rel] = propCount;
      total += propCount;
    }
    if (tagCount > 0) {
      styleTagsPerFile[rel] = tagCount;
      styleTags += tagCount;
    }
  }

  return {
    total,
    styleTags,
    perFile,
    styleTagsPerFile,
    fileCount: Object.keys(perFile).length,
    styleTagFileCount: Object.keys(styleTagsPerFile).length,
  };
}

export interface CspInventoryBaseline {
  total: number;
  styleTags: number;
  perFile: Record<string, number>;
  styleTagsPerFile?: Record<string, number>;
  fileCount: number;
  styleTagFileCount?: number;
  updatedAt: string;
}

export function loadBaseline(): CspInventoryBaseline {
  return JSON.parse(readFileSync(baselinePath, "utf8")) as CspInventoryBaseline;
}

export function writeBaseline(snapshot: CspInventorySnapshot): void {
  const payload: CspInventoryBaseline = {
    total: snapshot.total,
    styleTags: snapshot.styleTags,
    fileCount: snapshot.fileCount,
    styleTagFileCount: snapshot.styleTagFileCount,
    perFile: snapshot.perFile,
    styleTagsPerFile: snapshot.styleTagsPerFile,
    updatedAt: new Date().toISOString().slice(0, 10),
  };
  writeFileSync(baselinePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export function checkInventory(
  snapshot: CspInventorySnapshot,
  baseline: CspInventoryBaseline,
): string[] {
  const issues: string[] = [];

  if (snapshot.total > baseline.total) {
    issues.push(
      `Total style={ count rose: ${baseline.total} → ${snapshot.total} (+${snapshot.total - baseline.total})`,
    );
  }

  const baselineTags = baseline.styleTags ?? 0;
  if (snapshot.styleTags > baselineTags) {
    issues.push(
      `Total <style tag count rose: ${baselineTags} → ${snapshot.styleTags} (+${snapshot.styleTags - baselineTags})`,
    );
  }

  for (const [file, count] of Object.entries(snapshot.perFile)) {
    const prev = baseline.perFile[file] ?? 0;
    if (count > prev) {
      issues.push(`  style={ ${file}: ${prev} → ${count} (+${count - prev})`);
    }
  }

  for (const [file, count] of Object.entries(snapshot.styleTagsPerFile)) {
    const prev = baseline.styleTagsPerFile?.[file] ?? 0;
    if (count > prev) {
      issues.push(`  <style ${file}: ${prev} → ${count} (+${count - prev})`);
    }
  }

  return issues;
}

export function runInventoryCli(argv: string[] = process.argv): number {
  const update = argv.includes("--update");
  const current = inventory();

  if (update) {
    writeBaseline(current);
    process.stdout.write(
      `csp-inventory: baseline updated — ${current.total} style={, ${current.styleTags} <style across ${current.fileCount + current.styleTagFileCount} files\n`,
    );
    return 0;
  }

  let baseline: CspInventoryBaseline;
  try {
    baseline = loadBaseline();
  } catch {
    console.error(
      "csp-inventory: missing baseline — run `npm run csp:inventory:update` once to seed it",
    );
    return 1;
  }

  const issues = checkInventory(current, baseline);
  if (issues.length > 0) {
    console.error("csp-inventory: inline style regression detected\n");
    for (const line of issues) console.error(line);
    console.error(
      "\nReduce inline styles or run --update only after an intentional migration phase.",
    );
    return 1;
  }

  const reduced = baseline.total - current.total;
  const suffix = reduced > 0 ? ` (${reduced} below baseline)` : "";
  process.stdout.write(
    `csp-inventory: OK — ${current.total} style={, ${current.styleTags} <style across ${current.fileCount + current.styleTagFileCount} files${suffix}\n`,
  );
  return 0;
}
