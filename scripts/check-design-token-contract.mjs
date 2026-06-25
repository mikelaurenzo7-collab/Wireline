import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const sourcePath = resolve(root, "design-tokens/wireline.tokens.json");
const cssPath = resolve(root, "src/styles/tokens.generated.css");
const tsPath = resolve(root, "src/constants/generated-design-tokens.ts");
const foundationPath = resolve(root, "src/styles/foundation.css");
const componentsPath = resolve(root, "src/styles/components.css");
const indexPath = resolve(root, "src/index.css");
const extensionTokensPath = resolve(root, "apps/browser-extension/panel/tokens.generated.css");
const extensionPanelPath = resolve(root, "apps/browser-extension/panel/index.html");
const extensionStylesPath = resolve(root, "apps/browser-extension/panel/styles.css");
const swiftTokensPath = resolve(root, "ios/Wireline/Theme/WirelineDesignTokens.generated.swift");
const swiftThemePath = resolve(root, "ios/Wireline/Theme/WirelineTheme.swift");
const kotlinTokensPath = resolve(root, "android/app/src/main/java/com/wireline/app/ui/theme/WirelineDesignTokens.kt");

for (const path of [
  sourcePath,
  cssPath,
  tsPath,
  foundationPath,
  componentsPath,
  indexPath,
  extensionTokensPath,
  extensionPanelPath,
  extensionStylesPath,
  swiftTokensPath,
  swiftThemePath,
  kotlinTokensPath,
]) {
  if (!existsSync(path)) throw new Error(`Missing Wireline token artifact: ${path}`);
}

const source = JSON.parse(readFileSync(sourcePath, "utf8"));
const css = readFileSync(cssPath, "utf8");
const ts = readFileSync(tsPath, "utf8");
const foundation = readFileSync(foundationPath, "utf8");
const componentsCss = readFileSync(componentsPath, "utf8");
const indexCss = readFileSync(indexPath, "utf8");
const extensionTokens = readFileSync(extensionTokensPath, "utf8");
const extensionPanel = readFileSync(extensionPanelPath, "utf8");
const extensionStyles = readFileSync(extensionStylesPath, "utf8");
const swiftTokens = readFileSync(swiftTokensPath, "utf8");
const swiftTheme = readFileSync(swiftThemePath, "utf8");
const kotlinTokens = readFileSync(kotlinTokensPath, "utf8");

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
  "color.focus.default",
  "color.overlay.scrim",
  "color.feedback.success.surface",
  "color.feedback.error.border",
  "elevation.md",
  "motion.duration.fast",
  "motion.easing.standard",
  "interaction.target.minimum",
  "interaction.focus.width",
  "space.100",
  "radius.lg",
];

for (const path of requiredPaths) {
  if (!values[path]) throw new Error(`Missing required semantic token: ${path}`);
}

for (const [path, value] of Object.entries(values)) {
  const cssVariable = `--wireline-${path.replaceAll(".", "-")}: ${value};`;
  if (!css.includes(cssVariable)) throw new Error(`Generated web CSS is stale or missing token: ${path}`);
  if (!extensionTokens.includes(cssVariable)) throw new Error(`Generated extension CSS is stale or missing token: ${path}`);
  if (!ts.includes(`"${path}"`)) throw new Error(`Generated TypeScript is stale or missing token: ${path}`);
}

const foundationMappings = [
  "--wl-page: var(--wireline-color-canvas-default)",
  "--wl-focus: var(--wireline-color-focus-default)",
  "--wl-overlay-scrim: var(--wireline-color-overlay-scrim)",
  "--wl-success-surface: var(--wireline-color-feedback-success-surface)",
  "--wl-shadow-md: var(--wireline-elevation-md)",
  "--wl-target-minimum: var(--wireline-interaction-target-minimum)",
  "--focus-ring: var(--wireline-interaction-focus-width) solid var(--wireline-color-focus-default)",
  /* new aliases from PR1 token mapping */
  "--primary: var(--wireline-color-action-primary-default)",
  "--card: var(--wireline-color-surface-default)",
  "--border: var(--wireline-color-border-default)",
  "--radius-md: var(--wireline-radius-md)",
];
for (const mapping of foundationMappings) {
  if (!foundation.includes(mapping)) throw new Error(`Foundation must consume generated semantic mapping: ${mapping}`);
}

/* components.css now directly derives wl- primitives from --wireline-* */
if (!componentsCss.includes("--wireline-color-") || !componentsCss.includes("--wireline-radius-")) {
  throw new Error("components.css must derive primitives from generated --wireline tokens for radius, colors, surfaces");
}

const tokenImport = '@import "./styles/tokens.generated.css";';
const designSystemImport = '@import "./styles/design-system.css";';
if (!indexCss.includes(tokenImport)) throw new Error("src/index.css must load generated token CSS.");
if (indexCss.indexOf(tokenImport) > indexCss.indexOf(designSystemImport)) {
  throw new Error("Generated token CSS must load before the design system runtime.");
}

if (extensionPanel.indexOf("./tokens.generated.css") > extensionPanel.indexOf("./styles.css")) {
  throw new Error("Extension must load generated tokens before panel styles.");
}
if (!extensionStyles.includes("--canvas: var(--wireline-color-canvas-default)")) {
  throw new Error("Extension styles must consume semantic generated tokens.");
}
if (!swiftTokens.includes("public enum WirelineDesignTokens")) {
  throw new Error("SwiftUI generated token artifact is invalid.");
}
if (!swiftTheme.includes("WirelineDesignTokens.ColorToken.colorCanvasDefault")) {
  throw new Error("SwiftUI theme must consume generated semantic tokens.");
}
if (!kotlinTokens.includes("internal object WirelineDesignTokens")) {
  throw new Error("Compose generated token artifact is invalid.");
}

console.log(`Wireline cross-surface token contract passed (${Object.keys(values).length} tokens).`);
