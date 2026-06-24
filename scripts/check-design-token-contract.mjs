import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const sourcePath = resolve(root, "design-tokens/wireline.tokens.json");
const cssPath = resolve(root, "src/styles/tokens.generated.css");
const tsPath = resolve(root, "src/constants/generated-design-tokens.ts");
const indexPath = resolve(root, "src/index.css");

for (const path of [sourcePath, cssPath, tsPath, indexPath]) {
  if (!existsSync(path)) throw new Error(`Missing Wireline token artifact: ${path}`);
}

const source = JSON.parse(readFileSync(sourcePath, "utf8"));
const css = readFileSync(cssPath, "utf8");
const ts = readFileSync(tsPath, "utf8");
const indexCss = readFileSync(indexPath, "utf8");

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

const values = flatten(source);
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
  if (!values[path]) throw new Error(`Missing required semantic token: ${path}`);
}

for (const [path, value] of Object.entries(values)) {
  const cssVariable = `--wireline-${path.replaceAll(".", "-")}: ${value};`;
  if (!css.includes(cssVariable)) {
    throw new Error(`Generated CSS is stale or missing token: ${path}`);
  }
  if (!ts.includes(`"${path}"`)) {
    throw new Error(`Generated TypeScript is stale or missing token: ${path}`);
  }
}

const tokenImport = '@import "./styles/tokens.generated.css";';
const designSystemImport = '@import "./styles/design-system.css";';
if (!indexCss.includes(tokenImport)) {
  throw new Error("src/index.css must load generated token CSS.");
}
if (indexCss.indexOf(tokenImport) > indexCss.indexOf(designSystemImport)) {
  throw new Error("Generated token CSS must load before the design system runtime.");
}

console.log(`Wireline design token contract passed (${Object.keys(values).length} tokens).`);
