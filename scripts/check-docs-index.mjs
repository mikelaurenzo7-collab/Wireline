#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const canonicalIndexPath = "docs/README.md";
const auditIndexPath = "docs/AUDIT_INDEX.md";
const indexPaths = [canonicalIndexPath, auditIndexPath];
const problems = [];

const requiredCanonicalLinks = [
  "README.md",
  "CONTRIBUTING.md",
  "CODEBASE_HEALTH.md",
  "ARCHITECTURE.md",
  "docs/CUSTOMER_TERMINOLOGY.md",
  "docs/CLIENT_SURFACES.md",
  "docs/CHATGPT_APP.md",
  "docs/business-usage-pricing-decision.md",
  "docs/BILLING_RUNBOOK.md",
  "docs/PRODUCT_SHOWCASE_MATRIX.md",
  "docs/TRUST_CONVERSION_PACK.md",
  "docs/LAUNCH_READINESS_AND_MARGIN.md",
  "docs/PRODUCTION_VOICE_RUNTIME_POLICY_2026-07-26.md",
  "docs/WIRELINE_2026_ROADMAP.md",
];

function gitLines(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  })
    .split("\n")
    .filter(Boolean)
    .map((value) => value.replace(/\\/g, "/"));
}

function repoPath(absolutePath) {
  return path.relative(root, absolutePath).replace(/\\/g, "/");
}

function normalizeTarget(sourcePath, rawTarget) {
  const trimmed = rawTarget.trim();
  if (
    !trimmed ||
    trimmed.startsWith("#") ||
    /^(?:https?:|mailto:|tel:|data:)/i.test(trimmed)
  ) {
    return null;
  }

  // Markdown permits an angle-bracket path containing spaces, or an unquoted
  // first token followed by an optional link title.
  const token = trimmed.startsWith("<")
    ? trimmed.slice(1, trimmed.indexOf(">") === -1 ? undefined : trimmed.indexOf(">"))
    : trimmed.split(/\s+/, 1)[0];
  const target = token.split("#", 1)[0].split("?", 1)[0];
  if (!target.toLowerCase().endsWith(".md")) return null;

  const absolute = path.resolve(path.dirname(path.resolve(root, sourcePath)), target);
  const relative = repoPath(absolute);
  if (relative === ".." || relative.startsWith("../")) {
    problems.push(`${sourcePath} links outside the repository: ${rawTarget}`);
    return null;
  }
  return relative;
}

function parseMarkdownLinks(sourcePath, rejectDuplicates = false) {
  const source = readFileSync(path.resolve(root, sourcePath), "utf8");
  const links = [];
  const seen = new Set();
  const markdownLink = /\[[^\]]*\]\(([^)]+)\)/g;
  let match;

  while ((match = markdownLink.exec(source))) {
    const target = normalizeTarget(sourcePath, match[1]);
    if (!target) continue;
    if (seen.has(target)) {
      if (rejectDuplicates) problems.push(`${sourcePath} links ${target} more than once.`);
      continue;
    }
    seen.add(target);
    links.push(target);
  }

  return new Set(links);
}

function assertTargetExists(sourcePath, target) {
  const absolute = path.resolve(root, target);
  if (!existsSync(absolute)) {
    problems.push(`${sourcePath} links missing Markdown target: ${target}`);
  } else if (!statSync(absolute).isFile()) {
    problems.push(`${sourcePath} links a non-file Markdown target: ${target}`);
  }
}

function walkMarkdown(dir) {
  const files = [];
  for (const item of readdirSync(path.resolve(root, dir))) {
    const relative = path.join(dir, item);
    const absolute = path.resolve(root, relative);
    const stat = statSync(absolute);
    if (stat.isDirectory()) files.push(...walkMarkdown(relative));
    else if (item.toLowerCase().endsWith(".md")) files.push(relative.replace(/\\/g, "/"));
  }
  return files;
}

for (const indexPath of indexPaths) {
  if (!existsSync(path.resolve(root, indexPath))) {
    problems.push(`Missing documentation index: ${indexPath}`);
  }
}

if (problems.length === 0) {
  const canonicalLinks = parseMarkdownLinks(canonicalIndexPath, true);
  const auditLinks = parseMarkdownLinks(auditIndexPath, true);
  const trackedMarkdown = gitLines(["ls-files", "*.md", "**/*.md"]);

  // Validate local Markdown links across the entire tracked documentation surface,
  // not only the two indexes. This makes file moves and deletions fail loudly.
  for (const sourcePath of trackedMarkdown) {
    for (const target of parseMarkdownLinks(sourcePath)) {
      assertTargetExists(sourcePath, target);
    }
  }

  for (const target of canonicalLinks) {
    if (auditLinks.has(target)) {
      problems.push(`${target} is linked from both documentation indexes.`);
    }
  }

  for (const required of requiredCanonicalLinks) {
    if (!canonicalLinks.has(required)) {
      problems.push(`${canonicalIndexPath} must link ${required}.`);
    }
  }

  if (!canonicalLinks.has(auditIndexPath)) {
    problems.push(`${canonicalIndexPath} must link ${auditIndexPath}.`);
  }

  const auditIndex = readFileSync(path.resolve(root, auditIndexPath), "utf8");
  if (!auditIndex.slice(0, 800).includes("Historical evidence index")) {
    problems.push(`${auditIndexPath} must identify itself as a historical evidence index.`);
  }

  const indexedDocs = new Set([...canonicalLinks, ...auditLinks]);
  for (const file of walkMarkdown("docs")) {
    if (indexPaths.includes(file)) continue;
    if (!indexedDocs.has(file)) {
      problems.push(
        `${file} is not indexed. Link durable/current material from ${canonicalIndexPath}; ` +
          `link dated audit evidence from ${auditIndexPath}.`,
      );
    }
  }

  for (const file of trackedMarkdown) {
    if (
      file.startsWith("docs/") ||
      file.startsWith(".github/") ||
      canonicalLinks.has(file)
    ) {
      continue;
    }
    problems.push(
      `${file} is tracked Markdown without an approved home. Move durable policy to docs/, ` +
        `use a surface README, or link the exceptional path exactly once from ${canonicalIndexPath}.`,
    );
  }
}

if (problems.length) {
  console.error("Documentation index check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("Documentation indexes, local links, and tracked Markdown organization are complete.");