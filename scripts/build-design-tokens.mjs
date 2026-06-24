import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const sourcePath = resolve(root, "design-tokens/wireline.tokens.json");
const cssOutputPath = resolve(root, "src/styles/tokens.generated.css");
const tsOutputPath = resolve(root, "src/constants/generated-design-tokens.ts");

const tokens = JSON.parse(await readFile(sourcePath, "utf8"));

/** Walk DTCG-style groups and collect leaf token values by semantic path. */
function flatten(group, path = [], output = {}) {
  for (const [key, value] of Object.entries(group)) {
    if (key.startsWith("$")) continue;
    const nextPath = [...path, key];
    if (value && typeof value === "object" && "$value" in value) {
      output[nextPath.join(".")] = value.$value;
      continue;
    }
    if (value && typeof value === "object") flatten(value, nextPath, output);
  }
  return output;
}

const values = flatten(tokens);
const requiredPaths = [
  "color.canvas.default",
  "color.surface.default",
  "color.text.primary",
  "color.action.primary.default",
  "color.action.primary.pressed",
  "color.border.default",
  "space.100",
  "radius.lg",
  "motion.duration.fast",
];

for (const path of requiredPaths) {
  if (!values[path]) throw new Error(`Missing required Wireline token: ${path}`);
}

const cssVariableName = (path) => `--wireline-${path.replaceAll(".", "-")}`;
const orderedEntries = Object.entries(values).sort(([left], [right]) => left.localeCompare(right));
const css = [
  "/* Generated from design-tokens/wireline.tokens.json. Do not edit by hand. */",
  ":root {",
  ...orderedEntries.map(([path, value]) => `  ${cssVariableName(path)}: ${value};`),
  "}",
  "",
].join("\n");

const ts = [
  "/* Generated from design-tokens/wireline.tokens.json. Do not edit by hand. */",
  `export const wirelineTokenValues = ${JSON.stringify(values, null, 2)} as const;`,
  "",
  "export type WirelineTokenPath = keyof typeof wirelineTokenValues;",
  "",
  "export function wirelineToken(path: WirelineTokenPath) {",
  "  return wirelineTokenValues[path];",
  "}",
  "",
].join("\n");

await Promise.all([
  mkdir(dirname(cssOutputPath), { recursive: true }),
  mkdir(dirname(tsOutputPath), { recursive: true }),
]);
await Promise.all([
  writeFile(cssOutputPath, css),
  writeFile(tsOutputPath, ts),
]);

console.log(`Generated ${orderedEntries.length} Wireline design tokens.`);
