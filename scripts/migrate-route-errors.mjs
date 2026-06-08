#!/usr/bin/env node
/**
 * Migrate legacy `res.status(N).json({ error })` → `throw AppError.fromHttpStatus(...)`.
 * Run: node scripts/migrate-route-errors.mjs [--write]
 */
import fs from "fs";
import path from "path";

const WRITE = process.argv.includes("--write");
const ROOT = process.cwd();

function walkRoutes(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walkRoutes(p, out);
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts") && p.includes(`${path.sep}routes${path.sep}`)) {
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
  if (content.includes("AppError")) return content;
  const imp = `import { AppError } from "${relImport(file)}";\n`;
  const m = content.match(/^import .+;\n/m);
  if (m) {
    const idx = content.indexOf(m[0]) + m[0].length;
    return content.slice(0, idx) + imp + content.slice(idx);
  }
  return imp + content;
}

/** @param {string} content */
function migrate(content, file) {
  let next = content;
  let changed = 0;

  // return res.status(N).json({ error: MSG [, details: OBJ] })
  const re =
    /return\s+res\.status\((\d+)\)\.json\(\{\s*error:\s*((?:`(?:\\.|[^`])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'))(?:\s*,\s*details:\s*([^}]+))?\s*\}\)\s*;?/g;
  next = next.replace(re, (_full, status, msg, details) => {
    changed++;
    if (details) {
      return `throw AppError.fromHttpStatus(${status}, ${msg}, ${details.trim()});`;
    }
    return `throw AppError.fromHttpStatus(${status}, ${msg});`;
  });

  // if (...) return res.status(N).json({ error: MSG })
  const reIf =
    /(\bif\s*\([^)]+\)\s*)return\s+res\.status\((\d+)\)\.json\(\{\s*error:\s*((?:`(?:\\.|[^`])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'))(?:\s*,\s*details:\s*([^}]+))?\s*\}\)\s*;?/g;
  next = next.replace(reIf, (_full, ifPart, status, msg, details) => {
    changed++;
    const throwExpr = details
      ? `throw AppError.fromHttpStatus(${status}, ${msg}, ${details.trim()});`
      : `throw AppError.fromHttpStatus(${status}, ${msg});`;
    return `${ifPart}${throwExpr}`;
  });

  // res.status(N).json({ error: MSG }); at EOL (catch blocks) — add throw
  const reBare =
    /^(\s*)res\.status\((\d+)\)\.json\(\{\s*error:\s*((?:`(?:\\.|[^`])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'))(?:\s*,\s*details:\s*([^}]+))?\s*\}\)\s*;?\s*$/gm;
  next = next.replace(reBare, (_full, indent, status, msg, details) => {
    changed++;
    const throwExpr = details
      ? `throw AppError.fromHttpStatus(${status}, ${msg}, ${details.trim()});`
      : `throw AppError.fromHttpStatus(${status}, ${msg});`;
    return `${indent}${throwExpr}`;
  });

  // return res.status(N).json({ error: EXPR }) — dynamic message expression
  const reExpr =
    /return\s+res\.status\((\d+)\)\.json\(\{\s*error:\s*([^,}]+?)\s*\}\)\s*;?/g;
  next = next.replace(reExpr, (_full, status, expr) => {
    if (/^(`|"|')/.test(expr.trim())) return _full;
    changed++;
    return `throw AppError.fromHttpStatus(${status}, String(${expr.trim()}));`;
  });

  if (changed > 0) {
    next = ensureImport(next, file);
  }
  return { next, changed };
}

let total = 0;
for (const file of walkRoutes(path.join(ROOT, "src/routes"))) {
  const content = fs.readFileSync(file, "utf8");
  const { next, changed } = migrate(content, file);
  if (changed > 0) {
    total += changed;
    console.log(`${changed.toString().padStart(4)}  ${path.relative(ROOT, file)}`);
    if (WRITE) fs.writeFileSync(file, next);
  }
}

console.log(`\n${WRITE ? "Updated" : "Would update"} ${total} error response(s). Pass --write to apply.`);
