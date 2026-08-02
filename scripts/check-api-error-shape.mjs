#!/usr/bin/env node
/**
 * CI ratchet: legacy route handlers must not grow new error JSON without `code`.
 * Runtime normalization middleware backfills `code` for old handlers; this guard
 * drives incremental migration to throw AppError.
 */
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const RATCHET_PATH = path.join(ROOT, "scripts", "api-error-ratchet.json");

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

function countLegacyErrors() {
  let count = 0;
  const files = [];
  for (const file of walkRoutes(path.join(ROOT, "src/routes"))) {
    const t = fs.readFileSync(file, "utf8");
    const re = /res\.status\((\d+)\)\.json\(\s*(\{[\s\S]*?\})\s*\)/g;
    let m;
    while ((m = re.exec(t))) {
      const body = m[2];
      if (!/error\s*:/.test(body)) continue;
      // Recognize a stable `code` whether it is an explicit key (`code:`) or an
      // object shorthand property (`code,` / `code}`). The shorthand form is a
      // valid AppError-style stable code and should not trip the ratchet.
      if (/\bcode\b\s*[:,}]/.test(body)) continue;
      count++;
      files.push(path.relative(ROOT, file));
    }
  }
  return { count, files };
}

const { count } = countLegacyErrors();
const ratchet = JSON.parse(fs.readFileSync(RATCHET_PATH, "utf8"));
const max = ratchet.maxLegacyErrorResponses;

if (count > max) {
  console.error(
    `api-error ratchet FAILED: ${count} legacy error responses without code (max ${max}).\n` +
      `Migrate to throw AppError or run scripts/migrate-route-errors.mjs --write`,
  );
  process.exit(1);
}

if (count < max) {
  if (process.argv.includes("--write")) {
    ratchet.maxLegacyErrorResponses = count;
    fs.writeFileSync(RATCHET_PATH, `${JSON.stringify(ratchet, null, 2)}\n`);
    console.log(`api-error ratchet tightened: ${max} → ${count}`);
  } else {
    console.log(
      `api-error ratchet can tighten: ${max} → ${count}. ` +
        "Run `node scripts/check-api-error-shape.mjs --write` and commit the ratchet file.",
    );
  }
} else {
  console.log(
    `api-error ratchet OK: ${count}/${max} legacy responses without inline code`,
  );
}
