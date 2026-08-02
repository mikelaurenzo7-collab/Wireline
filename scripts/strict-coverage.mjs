#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const srcRoot = path.join(repoRoot, "src");
const strictConfigPath = path.join(repoRoot, "tsconfig.strict.json");

const TRACKED_FOLDERS = [
  "src/lib",
  "src/routes",
  "src/components",
  "src/pages",
  "src/hooks",
  "src/services",
];

const BLOCKED_IMPORT_PATTERNS = [
  /from ['"].*db(?:\/|['"])/,
  /from ['"].*server(?:\/|['"])/,
  /from ['"].*service(?:\/|['"])/i,
  /from ['"]@supabase\//,
  /from ['"]drizzle-orm/,
  /from ['"]express/,
  /from ['"]react/,
  /from ['"]@vitejs\//,
  /from ['"]stripe/,
  /from ['"]twilio/,
  /from ['"]@anthropic-ai\//,
  /from ['"]openai/,
  /from ['"]@google\//,
  /from ['"]node:/,
  /require\(['"]node:/,
];

const SIDE_EFFECT_PATTERNS = [
  /\bfetch\s*\(/,
  /\bprocess\.env\b/,
  /\bconsole\.(log|warn|error|info|debug)\s*\(/,
  /\bnew\s+WebSocket\b/,
  /\blocalStorage\b/,
  /\bsessionStorage\b/,
  /\bdocument\./,
  /\bwindow\./,
];

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

function walkFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
      continue;
    }

    if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      files.push(toPosix(path.relative(repoRoot, fullPath)));
    }
  }

  return files.sort();
}

function stripJsonComments(jsonc) {
  let output = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < jsonc.length; i += 1) {
    const char = jsonc[i];
    const next = jsonc[i + 1];

    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }

    if (char === "/" && next === "/") {
      while (i < jsonc.length && jsonc[i] !== "\n") {
        i += 1;
      }
      output += "\n";
      continue;
    }

    if (char === "/" && next === "*") {
      i += 2;
      while (i < jsonc.length && !(jsonc[i] === "*" && jsonc[i + 1] === "/")) {
        output += jsonc[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      i += 1;
      continue;
    }

    output += char;
  }

  return output;
}

function isTestFile(file) {
  return /(^|\/)(__tests__|__mocks__)(\/|$)/.test(file) || /\.(test|spec)\.tsx?$/.test(file);
}

function parseStrictIncludes() {
  const rawConfig = fs.readFileSync(strictConfigPath, "utf8");
  const parsed = JSON.parse(stripJsonComments(rawConfig));
  return (parsed.include ?? [])
    .filter((entry) => typeof entry === "string")
    .map((entry) => toPosix(path.normalize(entry)))
    .filter((entry) => entry.startsWith("src/") && /\.tsx?$/.test(entry));
}

function folderFor(file) {
  return TRACKED_FOLDERS.find((folder) => file === folder || file.startsWith(`${folder}/`));
}

function formatPercent(numerator, denominator) {
  if (denominator === 0) {
    return "n/a";
  }
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function hasPeerTest(file, allFilesSet) {
  const withoutExt = file.replace(/\.tsx?$/, "");
  return allFilesSet.has(`${withoutExt}.test.ts`) || allFilesSet.has(`${withoutExt}.test.tsx`);
}

function candidateReasons(file, source, allFilesSet) {
  const reasons = [];
  const basename = path.posix.basename(file);

  if (file.startsWith("src/lib/")) {
    reasons.push("lib helper");
  } else if (file.startsWith("src/hooks/")) {
    reasons.push("hook utility");
  } else if (file.startsWith("src/services/")) {
    reasons.push("service utility");
  }

  if (hasPeerTest(file, allFilesSet)) {
    reasons.push("peer test exists");
  }

  if (
    /(helper|helpers|utils|validators|validation|constants|catalog|policy|rules|score|summary|token|format|copy|entitlement|limits|compliance|manifest|metadata|path|routes|slug|url)/i.test(
      basename,
    )
  ) {
    reasons.push("helper-style name");
  }

  if (!BLOCKED_IMPORT_PATTERNS.some((pattern) => pattern.test(source))) {
    reasons.push("no obvious DB/server/vendor client imports");
  }

  if (!SIDE_EFFECT_PATTERNS.some((pattern) => pattern.test(source))) {
    reasons.push("no obvious side effects");
  }

  return reasons;
}

function scoreCandidate(file, source, allFilesSet) {
  let score = 0;

  if (file.startsWith("src/lib/")) score += 5;
  if (file.startsWith("src/hooks/")) score += 2;
  if (file.startsWith("src/services/")) score -= 3;
  if (hasPeerTest(file, allFilesSet)) score += 5;
  if (
    /(helper|helpers|utils|validators|validation|constants|catalog|policy|rules|score|summary|token|format|copy|entitlement|limits|compliance|manifest|metadata|path|slug|url)/i.test(
      file,
    )
  )
    score += 3;
  if (source.length < 6000) score += 2;
  if (source.length < 2500) score += 1;
  if (/\.tsx$/.test(file)) score -= 4;
  if (/import\s+React|from ['"]react['"]|<[^>]+>/.test(source)) score -= 5;
  if (BLOCKED_IMPORT_PATTERNS.some((pattern) => pattern.test(source))) score -= 6;
  if (SIDE_EFFECT_PATTERNS.some((pattern) => pattern.test(source))) score -= 4;
  if (/\bclass\s+/.test(source)) score -= 1;

  return score;
}

function findCandidates(nonTestFiles, strictNonTestSet, allFilesSet) {
  return nonTestFiles
    .filter((file) => !strictNonTestSet.has(file))
    .filter(
      (file) =>
        file.startsWith("src/lib/") ||
        file.startsWith("src/hooks/") ||
        file.startsWith("src/services/"),
    )
    .map((file) => {
      const source = fs.readFileSync(path.join(repoRoot, file), "utf8");
      return {
        file,
        score: scoreCandidate(file, source, allFilesSet),
        reasons: candidateReasons(file, source, allFilesSet),
      };
    })
    .filter((candidate) => candidate.score >= 6)
    .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
    .slice(0, 10);
}

function main() {
  const allSrcFiles = walkFiles(srcRoot);
  const allFilesSet = new Set(allSrcFiles);
  const nonTestFiles = allSrcFiles.filter((file) => !isTestFile(file));
  const strictIncludes = parseStrictIncludes().filter((file) => allFilesSet.has(file));
  const strictNonTestFiles = strictIncludes.filter((file) => !isTestFile(file));
  const strictNonTestSet = new Set(strictNonTestFiles);

  console.log("# Strictness coverage report");
  console.log("");
  console.log(`Generated: ${new Date().toISOString()}`);
  console.log(`Non-test src TS/TSX files: ${nonTestFiles.length}`);
  console.log(`tsconfig.strict.json included files: ${strictIncludes.length}`);
  console.log(`tsconfig.strict.json included non-test files: ${strictNonTestFiles.length}`);
  console.log(
    `Overall non-test strict coverage: ${formatPercent(strictNonTestFiles.length, nonTestFiles.length)}`,
  );
  console.log("");
  console.log("## Coverage by top-level folder");
  console.log("");
  console.log("| Folder | Strict non-test files | Total non-test files | Coverage |");
  console.log("| --- | ---: | ---: | ---: |");

  for (const folder of TRACKED_FOLDERS) {
    const total = nonTestFiles.filter((file) => folderFor(file) === folder).length;
    const strict = strictNonTestFiles.filter((file) => folderFor(file) === folder).length;
    console.log(`| ${folder} | ${strict} | ${total} | ${formatPercent(strict, total)} |`);
  }

  const candidates = findCandidates(nonTestFiles, strictNonTestSet, allFilesSet);
  console.log("");
  console.log("## Suggested next low-risk pure-helper modules");
  console.log("");

  if (candidates.length === 0) {
    console.log("No candidates matched the low-risk heuristic.");
  } else {
    candidates.forEach((candidate, index) => {
      console.log(`${index + 1}. ${candidate.file} — ${candidate.reasons.slice(0, 3).join("; ")}.`);
    });
  }

  console.log("");
  console.log(
    "Heuristic notes: candidates are non-test files not already in tsconfig.strict.json, prefer small lib/helper modules with peer tests, and down-rank React, DB, server, network, environment, and vendor-client code. Verify with `npm run lint:strict` after adding any candidate.",
  );
}

main();
