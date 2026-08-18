import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.env.WIRELINE_VISUAL_OUTPUT_DIR || "artifacts/visual-qa-pr");
const DIAGNOSTIC_KEYS = new Set([
  "message",
  "title",
  "description",
  "reason",
  "type",
  "code",
  "check",
  "metric",
  "name",
  "issue",
  "detail",
  "details",
]);

function findManifests(path) {
  if (!existsSync(path)) return [];
  const stat = statSync(path);
  if (stat.isFile()) return path.endsWith("manifest.json") ? [path] : [];
  return readdirSync(path).flatMap((name) => findManifests(join(path, name)));
}

function collectP0(value, output = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectP0(item, output);
    return output;
  }
  if (!value || typeof value !== "object") return output;
  const severity = String(value.severity || value.priority || value.level || "").toUpperCase();
  if (severity === "P0") output.push(value);
  for (const child of Object.values(value)) collectP0(child, output);
  return output;
}

function diagnosticText(issue) {
  const explicit = [];
  for (const [key, value] of Object.entries(issue)) {
    if (!DIAGNOSTIC_KEYS.has(key.toLowerCase())) continue;
    if (typeof value === "string") explicit.push(value);
    else if (Array.isArray(value)) explicit.push(...value.filter((item) => typeof item === "string"));
  }
  if (explicit.length) return explicit.join(" ");

  const fallback = [];
  function collectStrings(value, key = "") {
    if (typeof value === "string") {
      if (!/(screenshot|artifact|trace|\.png|\.jpe?g|\.webp|https?:\/\/)/i.test(value)) {
        fallback.push(`${key} ${value}`);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) collectStrings(item, key);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [childKey, child] of Object.entries(value)) {
      if (/^(viewport|width|height|x|y|top|left|right|bottom|timestamp)$/i.test(childKey)) continue;
      collectStrings(child, childKey);
    }
  }
  collectStrings(issue);
  return fallback.join(" ");
}

function isIntentionalVerticalFlow(issue) {
  const text = diagnosticText(issue);
  const vertical =
    /(document|body|page|flow).{0,32}(scrollbar|vertical overflow|overflow|scroll height|scrollheight)|vertical.{0,32}(overflow|scroll)/i;
  const actionable =
    /(horizontal|clip|overlap|offscreen|console|exception|http|route|missing|blank|crash|failed|unreachable)/i;
  return vertical.test(text) && !actionable.test(text);
}

const manifests = findManifests(root).sort();
if (!manifests.length) {
  throw new Error(`No visual QA manifest found under ${root}`);
}

const latest = manifests.at(-1);
const payload = JSON.parse(readFileSync(latest, "utf8"));
const p0Issues = collectP0(payload);
const ignored = p0Issues.filter(isIntentionalVerticalFlow);
const blocking = p0Issues.filter((issue) => !isIntentionalVerticalFlow(issue));

console.log(
  `Visual QA: ${p0Issues.length} P0 record(s), ${ignored.length} intentional vertical-flow record(s), ${blocking.length} actionable.`,
);

if (blocking.length) {
  console.error(
    JSON.stringify(
      blocking.slice(0, 25).map((issue) => ({ diagnostic: diagnosticText(issue), issue })),
      null,
      2,
    ),
  );
  process.exit(1);
}
