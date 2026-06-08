#!/usr/bin/env node
/**
 * Final pass: migrate legacy `res.status().json({ error })` without inline `code`.
 * Simple bodies → throw AppError; composite bodies → inject `code`.
 */
import fs from "fs";
import path from "path";

const WRITE = process.argv.includes("--write");
const ROOT = process.cwd();

const STATUS_CODES = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  410: "GONE",
  422: "VALIDATION_ERROR",
  429: "RATE_LIMITED",
  500: "INTERNAL_ERROR",
  502: "BAD_GATEWAY",
  503: "SERVICE_UNAVAILABLE",
};

function walkRoutes(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walkRoutes(p, out);
    else if (
      name.endsWith(".ts") &&
      !name.endsWith(".test.ts") &&
      p.includes(`${path.sep}routes${path.sep}`)
    ) {
      out.push(p);
    }
  }
  return out;
}

function relImport(file) {
  const from = path.dirname(file);
  let rel = path.relative(from, path.join(ROOT, "src/lib/api-error.ts")).replace(/\\/g, "/");
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return rel.replace(/\.ts$/, "");
}

function ensureImport(content, file) {
  if (/\bAppError\b/.test(content)) return content;
  const imp = `import { AppError } from "${relImport(file)}";\n`;
  const m = content.match(/^import .+;\n/m);
  if (m) {
    const idx = content.indexOf(m[0]) + m[0].length;
    return content.slice(0, idx) + imp + content.slice(idx);
  }
  return imp + content;
}

function findMatchingParen(str, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < str.length; i++) {
    if (str[i] === "(") depth++;
    else if (str[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findMatchingBrace(str, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < str.length; i++) {
    if (str[i] === "{") depth++;
    else if (str[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function codeForStatus(statusExpr) {
  const n = Number(statusExpr.trim());
  if (!Number.isFinite(n)) return "ERROR";
  return STATUS_CODES[n] ?? (n >= 500 ? "INTERNAL_ERROR" : "ERROR");
}

function isErrorOnlyBody(body) {
  const inner = body.replace(/^\{\s*/, "").replace(/\s*\}$/, "").trim();
  if (/^error\s*:/.test(inner) && !/,\s*\w/.test(inner.replace(/error\s*:[\s\S]+/, ""))) {
    return true;
  }
  const withoutError = inner.replace(/error\s*:\s*[\s\S]+/, "").trim().replace(/^,\s*/, "");
  return /^error\s*:/.test(inner) && (withoutError === "" || /^detail\s*:/.test(withoutError));
}

function extractErrorExpr(body) {
  const m = body.match(/error\s*:\s*([\s\S]+?)(?:\s*,\s*detail\s*:|$)/);
  if (!m) return null;
  return m[1].trim().replace(/,\s*$/, "");
}

function migrateFile(content, file) {
  let next = content;
  let changed = 0;
  let needsImport = false;
  const replacements = [];

  let i = 0;
  while (i < next.length) {
    const idx = next.indexOf("res.status(", i);
    if (idx === -1) break;

    const statusOpen = idx + "res.status(".length - 1;
    const statusClose = findMatchingParen(next, statusOpen);
    if (statusClose === -1) {
      i = idx + 1;
      continue;
    }

    const after = next.slice(statusClose + 1);
    if (!/^\s*\.json\(\s*/.test(after)) {
      i = idx + 1;
      continue;
    }

    const jsonOpen = statusClose + 1 + after.match(/^\s*\.json\(\s*/)[0].length - 1;
    const bodyClose = findMatchingBrace(next, jsonOpen);
    const jsonParenOpen = next.indexOf(".json(", idx);
    const jsonClose = findMatchingParen(next, jsonParenOpen + 5);
    if (bodyClose === -1 || jsonClose === -1) {
      i = idx + 1;
      continue;
    }

    const body = next.slice(jsonOpen, bodyClose + 1);
    if (!/error\s*:/.test(body) || /code\s*:/.test(body)) {
      i = jsonClose + 1;
      continue;
    }

    const lineStart = next.lastIndexOf("\n", idx) + 1;
    const prefix = next.slice(lineStart, idx);
    const hasReturn = /\breturn\s*$/.test(prefix);
    const start = hasReturn ? next.lastIndexOf("return", idx) : idx;
    const end = jsonClose + 1;
    const full = next.slice(start, end);
    const statusExpr = next.slice(statusOpen + 1, statusClose);
    const indent = (full.match(/^(\s*)/) || ["", ""])[1];

    // Fail-open health probe — rename field, not an error envelope
    if (
      /^\d+$/.test(statusExpr.trim()) &&
      Number(statusExpr.trim()) === 200 &&
      /error\s*:\s*["']probe_failed["']/.test(body)
    ) {
      replacements.push({
        start,
        end,
        text: full.replace(/error\s*:\s*["']probe_failed["']/, 'probe: "failed"'),
      });
      changed++;
      i = end;
      continue;
    }

    const detailMatch = body.match(/,\s*detail\s*:\s*([^}]+)\s*\}$/);

    if (isErrorOnlyBody(body)) {
      const errorExpr = extractErrorExpr(body);
      if (!errorExpr) {
        i = end;
        continue;
      }
      const detailSuffix = detailMatch ? `, { detail: ${detailMatch[1].trim()} }` : "";
      const throwLine = `${indent}${hasReturn ? "" : ""}throw AppError.fromHttpStatus(${statusExpr}, ${errorExpr}${detailSuffix});`;
      const replacement = hasReturn ? throwLine : throwLine;
      replacements.push({ start, end, text: replacement });
      needsImport = true;
      changed++;
      i = end;
      continue;
    }

    // Composite body — inject code after opening brace
    const code = codeForStatus(statusExpr);
    const newBody = body.replace(/\{\s*\n?/, `{\n${indent}  code: "${code}",\n${indent}  `);
    replacements.push({ start, end, text: full.replace(body, newBody) });
    changed++;
    i = end;
  }

  if (replacements.length === 0) return { next, changed: 0 };

  // Apply right-to-left so offsets stay valid
  replacements.sort((a, b) => b.start - a.start);
  for (const r of replacements) {
    next = next.slice(0, r.start) + r.text + next.slice(r.end);
  }
  if (needsImport) next = ensureImport(next, file);

  return { next, changed };
}

let total = 0;
for (const file of walkRoutes(path.join(ROOT, "src/routes"))) {
  const content = fs.readFileSync(file, "utf8");
  const { next, changed } = migrateFile(content, file);
  if (changed > 0) {
    total += changed;
    console.log(`${changed.toString().padStart(4)}  ${path.relative(ROOT, file)}`);
    if (WRITE) fs.writeFileSync(file, next);
  }
}

console.log(`\n${WRITE ? "Updated" : "Would update"} ${total} legacy error response(s). Pass --write to apply.`);
