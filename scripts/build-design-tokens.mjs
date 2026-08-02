import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const sourcePath = resolve(root, "design-tokens/wireline.tokens.json");
const cssOutputPath = resolve(root, "src/styles/tokens.generated.css");
const tsOutputPath = resolve(root, "src/constants/generated-design-tokens.ts");
const swiftOutputPath = resolve(root, "ios/Wireline/Theme/WirelineDesignTokens.generated.swift");
const swiftSharedOutputPath = resolve(
  root,
  "ios/WirelineShared/WirelineDesignTokens.generated.swift",
);
const kotlinOutputPath = resolve(
  root,
  "android/app/src/main/java/com/wireline/app/ui/theme/WirelineDesignTokens.kt",
);
const extensionOutputPath = resolve(root, "apps/browser-extension/panel/tokens.generated.css");

const tokens = JSON.parse(await readFile(sourcePath, "utf8"));

function flatten(group, path = [], output = {}) {
  for (const [key, value] of Object.entries(group)) {
    if (key.startsWith("$")) continue;
    const nextPath = [...path, key];
    if (value && typeof value === "object" && "$value" in value) {
      const raw = value.$value;
      // Quote fontFamily values so multi-word names like "Instrument Serif"
      // survive CSS variable substitution; bare values were resolving to
      // brittle identifiers and falling back to system fonts.
      output[nextPath.join(".")] =
        value.$type === "fontFamily" && typeof raw === "string" ? `"${raw}"` : raw;
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
  "typography.body.size",
  "typography.h1.size",
  "zIndex.modal",
];

for (const path of requiredPaths) {
  if (!values[path]) throw new Error(`Missing required Wireline token: ${path}`);
}

const orderedEntries = Object.entries(values).sort(([left], [right]) => left.localeCompare(right));
const orderedValues = Object.fromEntries(orderedEntries);
const css = [
  "/* Generated from design-tokens/wireline.tokens.json. Do not edit by hand. */",
  ":root {",
  ...orderedEntries.map(([path, value]) => `  --wireline-${path.replaceAll(".", "-")}: ${value};`),
  "}",
  "",
].join("\n");

const ts = [
  "/* Generated from design-tokens/wireline.tokens.json. Do not edit by hand. */",
  `export const wirelineTokenValues = ${JSON.stringify(orderedValues, null, 2)} as const;`,
  "",
  "export type WirelineTokenPath = keyof typeof wirelineTokenValues;",
  "",
  "export function wirelineToken(path: WirelineTokenPath) {",
  "  return wirelineTokenValues[path];",
  "}",
  "",
].join("\n");

const pxNumber = (value) => {
  const match = String(value).match(/^(\d+(?:\.\d+)?)px$/);
  return match ? Number(match[1]) : null;
};

const millisecondNumber = (value) => {
  const match = String(value).match(/^(\d+(?:\.\d+)?)ms$/);
  return match ? Number(match[1]) : null;
};

const camel = (path) =>
  path
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, char) => char.toUpperCase())
    .replace(/^[A-Z]/, (char) => char.toLowerCase());

const rgbaToSwift = (value) => {
  const rgba = String(value).match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)$/);
  if (rgba) {
    const [, r, g, b, a] = rgba;
    return `Color(red: ${Number(r) / 255}, green: ${Number(g) / 255}, blue: ${Number(b) / 255}, opacity: ${a})`;
  }
  const hex = String(value).match(/^#([0-9A-Fa-f]{6})$/);
  if (hex) return `Color(hex: 0x${hex[1].toUpperCase()})`;
  return null;
};

const rgbaToCompose = (value) => {
  const rgba = String(value).match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)$/);
  if (rgba) {
    const [, r, g, b, a] = rgba;
    const alpha = Math.round(Number(a) * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
    const rgb = [r, g, b]
      .map((part) => Number(part).toString(16).padStart(2, "0").toUpperCase())
      .join("");
    return `Color(0x${alpha}${rgb})`;
  }
  const hex = String(value).match(/^#([0-9A-Fa-f]{6})$/);
  if (hex) return `Color(0xFF${hex[1].toUpperCase()})`;
  return null;
};

const colorEntries = orderedEntries.filter(([path]) => path.startsWith("color."));
const dimensionEntries = orderedEntries.filter(
  ([path, value]) =>
    ["space.", "radius.", "interaction.", "typography.", "layout."].some((prefix) =>
      path.startsWith(prefix),
    ) && pxNumber(value) !== null,
);
const durationEntries = orderedEntries.filter(
  ([path, value]) => path.startsWith("motion.duration.") && millisecondNumber(value) !== null,
);
const zIndexEntries = orderedEntries.filter(([path]) => path.startsWith("zIndex."));
// Numeric motion scalars (press scale, lift) — emitted as native constants so
// Swift/Kotlin press feedback stays locked to the single token source instead
// of drifting behind a hardcoded literal.
const pressScaleValue = values["motion.press"] ?? 0.985;
const liftPxValue = pxNumber(values["motion.lift"]) ?? 1;

const swift = [
  "// Generated from design-tokens/wireline.tokens.json. Do not edit by hand.",
  "import SwiftUI",
  "",
  "public enum WirelineDesignTokens {",
  "  public enum ColorToken {",
  ...colorEntries.map(
    ([path, value]) =>
      `    public static let ${camel(path)} = ${rgbaToSwift(value) ?? "Color.clear"}`,
  ),
  "  }",
  "",
  "  public enum Metric {",
  ...dimensionEntries.map(
    ([path, value]) => `    public static let ${camel(path)}: CGFloat = ${pxNumber(value)}`,
  ),
  "  }",
  "",
  "  public enum Motion {",
  ...durationEntries.map(
    ([path, value]) =>
      `    public static let ${camel(path)}: Double = ${millisecondNumber(value) / 1000}`,
  ),
  `    public static let pressScale: CGFloat = ${pressScaleValue}`,
  `    public static let liftPx: CGFloat = ${liftPxValue}`,
  "  }",
  "",
  "  public enum ZIndex {",
  ...zIndexEntries.map(([path, value]) => `    public static let ${camel(path)}: Int = ${value}`),
  "  }",
  "}",
  "",
].join("\n");

const kotlin = [
  "// Generated from design-tokens/wireline.tokens.json. Do not edit by hand.",
  "package com.wireline.app.ui.theme",
  "",
  "import androidx.compose.ui.graphics.Color",
  "import androidx.compose.ui.unit.dp",
  "import androidx.compose.ui.unit.sp",
  "",
  "internal object WirelineDesignTokens {",
  "  object ColorToken {",
  ...colorEntries.map(
    ([path, value]) => `    val ${camel(path)} = ${rgbaToCompose(value) ?? "Color.Transparent"}`,
  ),
  "  }",
  "",
  "  object Metric {",
  // Compose splits the two kinds of measurement that CSS and CGFloat conflate.
  // Type sizes and line heights are TextUnit (`sp`) so they scale with the
  // reader's system font-size setting; everything else is Dp. Emitting the
  // whole group as `.dp` made every font-size token unusable — `.sp` has no
  // Dp receiver, so the Android app failed to compile at all.
  ...dimensionEntries.map(
    ([path, value]) =>
      `    val ${camel(path)} = ${pxNumber(value)}${path.startsWith("typography.") ? ".sp" : ".dp"}`,
  ),
  "  }",
  "",
  "  object Motion {",
  ...durationEntries.map(
    ([path, value]) => `    const val ${camel(path)}Millis = ${millisecondNumber(value)}`,
  ),
  `    const val pressScale = ${pressScaleValue}f`,
  `    const val liftPx = ${liftPxValue}`,
  "  }",
  "",
  "  object ZIndex {",
  ...zIndexEntries.map(([path, value]) => `    const val ${camel(path)} = ${value}`),
  "  }",
  "}",
  "",
].join("\n");

await Promise.all([
  mkdir(dirname(cssOutputPath), { recursive: true }),
  mkdir(dirname(tsOutputPath), { recursive: true }),
  mkdir(dirname(swiftOutputPath), { recursive: true }),
  mkdir(dirname(swiftSharedOutputPath), { recursive: true }),
  mkdir(dirname(kotlinOutputPath), { recursive: true }),
  mkdir(dirname(extensionOutputPath), { recursive: true }),
]);
await Promise.all([
  writeFile(cssOutputPath, css),
  writeFile(tsOutputPath, ts),
  writeFile(swiftOutputPath, swift),
  writeFile(swiftSharedOutputPath, swift),
  writeFile(kotlinOutputPath, kotlin),
  writeFile(extensionOutputPath, css),
]);

console.log(
  `Generated ${orderedEntries.length} Wireline design tokens for web, extension, iOS, and Android.`,
);
