/**
 * No em dashes in customer-facing copy.
 *
 * Founder brand rule: em dashes (and their en-dash / horizontal-bar cousins)
 * never appear in visible product copy. They read as machine-authored, and the
 * house voice is plain, concise, and human. This guard keeps them from creeping
 * back into rendered strings a page at a time.
 *
 * It reads source rather than a browser: the failure it guards is textual, and
 * the repo's convention is that a textual invariant gets a source-reading
 * contract that names the owning file. It strips comments first (dashes are
 * welcome in the prose that explains the code; only shipped copy is governed),
 * then flags any U+2014 / U+2013 / U+2015 that survives inside a string, JSX
 * text node, HTML text, or native string literal.
 *
 * A dash that is genuinely structural, a delimiter the code splits or joins on,
 * is not copy. Those are enumerated in ALLOWED with a reason, so the guard
 * stays honest instead of being switched off.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const root = process.cwd();
const DASHES = /[—–―]/;

/**
 * Structural dashes that are parsed, not read. Each entry is a substring that
 * must appear on the flagged line for it to be exempted, plus a reason. Keep
 * this list short and specific; prefer removing the dash to allow-listing it.
 */
const ALLOWED = [
  {
    // Internal parsed delimiter (not display copy): customer-intel splits the
    // producer format "[CUSTOMER PROFILE] <phone> — <intel>" on this exact
    // separator. Changing it would break the extraction contract.
    match: 'const sep = " — "',
    reason: "parsed delimiter for the [CUSTOMER PROFILE] intel format",
  },
];

const GLOBS = [
  "src/**/*.ts",
  "src/**/*.tsx",
  "apps/browser-extension/**/*.json",
  "apps/browser-extension/**/*.html",
  "apps/browser-extension/**/*.js",
  "public/**/*.html",
  "ios/**/*.swift",
  "android/**/*.kt",
  "chatgpt-app-submission.json",
];

function stripComments(src) {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  out = out.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
  out = out
    .split("\n")
    .map((line) => {
      if (/^\s*\/\//.test(line)) return "";
      if (/^\s*\*/.test(line)) return "";
      return line.replace(/([^:"'`])\/\/.*$/, "$1");
    })
    .join("\n");
  return out;
}

const files = execSync(`git ls-files ${GLOBS.map((glob) => `'${glob}'`).join(" ")}`, {
  cwd: root,
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean);

const findings = [];
for (const file of files) {
  const raw = readFileSync(resolve(root, file), "utf8");
  const stripped = stripComments(raw);
  stripped.split("\n").forEach((line, index) => {
    if (!DASHES.test(line)) return;
    if (ALLOWED.some((entry) => line.includes(entry.match))) return;
    const trimmed = line.trim().slice(0, 100);
    findings.push(`${file}:${index + 1}  ${trimmed}`);
  });
}

if (findings.length) {
  console.error(
    `No-em-dash check failed: ${findings.length} em/en dash(es) found in shipped copy.\n` +
      "Replace them with plain punctuation (period, comma, colon) or rephrase.\n" +
      "If a dash is a parsed delimiter, add it to ALLOWED in scripts/check-no-em-dashes.mjs.\n",
  );
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`No-em-dash check passed (${files.length} source files scanned).`);
