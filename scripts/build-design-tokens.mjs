import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const source = resolve(root, "design-tokens/wireline.tokens.json");
const outputs = {
  css: resolve(root, "src/styles/tokens.generated.css"),
  ts: resolve(root, "src/constants/generated-design-tokens.ts"),
  swiftApp: resolve(root, "ios/Wireline/Theme/WirelineTokens.generated.swift"),
  swiftWidget: resolve(root, "ios/WirelineWidgets/WirelineTokens.generated.swift"),
  kotlin: resolve(root, "android/app/src/main/java/com/wireline/app/ui/theme/WirelineTokensGenerated.kt"),
};
const check = process.argv.includes("--check");
const doc = JSON.parse(await readFile(source, "utf8"));

function flatten(node, trail = [], result = {}) {
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith("$")) continue;
    const next = [...trail, key];
    if (value && typeof value === "object" && "$value" in value) result[next.join(".")] = value.$value;
    else if (value && typeof value === "object") flatten(value, next, result);
  }
  return result;
}

const values = flatten(doc);
const entries = Object.entries(values).sort(([a], [b]) => a.localeCompare(b));
const required = ["color.canvas.default", "color.surface.default", "color.text.primary", "color.action.primary.default", "color.action.primary.pressed", "color.border.default", "color.focus.default", "motion.duration.fast", "interaction.target.comfortable", "radius.lg"];
for (const key of required) if (!values[key]) throw new Error(`Missing required Wireline token: ${key}`);

const cssName = (key) => `--wireline-${key.replaceAll(".", "-")}`;
const name = (key) => key.split(".").map((part, index) => index ? `${part[0].toUpperCase()}${part.slice(1)}` : part).join("").replace(/[^a-zA-Z0-9]/g, "");
const color = (value) => {
  const hex = typeof value === "string" && value.match(/^#([\da-f]{6})$/i);
  if (hex) return [parseInt(hex[1].slice(0, 2), 16), parseInt(hex[1].slice(2, 4), 16), parseInt(hex[1].slice(4, 6), 16), 1];
  const rgba = typeof value === "string" && value.match(/^rgba\(([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)$/i);
  return rgba ? [Number(rgba[1]), Number(rgba[2]), Number(rgba[3]), Number(rgba[4])] : null;
};
const px = (value, key) => {
  const match = typeof value === "string" && value.match(/^([\d.]+)px$/);
  if (!match) throw new Error(`Expected px token at ${key}`);
  return Number(match[1]);
};
const ms = (value, key) => {
  const match = typeof value === "string" && value.match(/^([\d.]+)ms$/);
  if (!match) throw new Error(`Expected ms token at ${key}`);
  return Number(match[1]);
};
const colors = entries.filter(([key, value]) => key.startsWith("color.") && color(value));
const spaces = entries.filter(([key]) => key.startsWith("space."));
const radii = entries.filter(([key]) => key.startsWith("radius."));
const interaction = entries.filter(([key]) => key.startsWith("interaction."));
const durations = entries.filter(([key]) => key.startsWith("motion.duration."));

const css = ["/* Generated from design-tokens/wireline.tokens.json. Do not edit by hand. */", ":root {", ...entries.map(([key, value]) => `  ${cssName(key)}: ${value};`), "}", ""].join("\n");
const ts = ["/* Generated from design-tokens/wireline.tokens.json. Do not edit by hand. */", `export const wirelineTokenValues = ${JSON.stringify(Object.fromEntries(entries), null, 2)} as const;`, "", "export type WirelineTokenPath = keyof typeof wirelineTokenValues;", "", "export const wirelineToken = (path: WirelineTokenPath) => wirelineTokenValues[path];", ""].join("\n");
const swiftColor = ([key, value]) => { const [r, g, b, a] = color(value); return `    static let ${name(key)} = Color(red: ${(r / 255).toFixed(6)}, green: ${(g / 255).toFixed(6)}, blue: ${(b / 255).toFixed(6)}, opacity: ${a.toFixed(3)})`; };
const swift = ["// Generated from design-tokens/wireline.tokens.json. Do not edit by hand.", "import SwiftUI", "", "enum WirelineTokens {", "  enum ColorToken {", ...colors.map(swiftColor), "  }", "  enum Space {", ...spaces.map(([key, value]) => `    static let ${name(key)}: CGFloat = ${px(value, key)}`), "  }", "  enum Radius {", ...radii.map(([key, value]) => `    static let ${name(key)}: CGFloat = ${px(value, key)}`), "  }", "  enum Interaction {", ...interaction.map(([key, value]) => `    static let ${name(key)}: CGFloat = ${px(value, key)}`), "  }", "  enum Motion {", ...durations.map(([key, value]) => `    static let ${name(key)}: Double = ${(ms(value, key) / 1000).toFixed(3)}`), `    static let motionPress: CGFloat = ${Number(values["motion.press"]).toFixed(2)}`, "  }", "}", ""].join("\n");
const kotlinColor = ([key, value]) => { const [r, g, b, a] = color(value); const hex = [Math.round(a * 255), r, g, b].map((part) => part.toString(16).padStart(2, "0").toUpperCase()).join(""); return `        val ${name(key)} = Color(0x${hex})`; };
const kotlin = ["// Generated from design-tokens/wireline.tokens.json. Do not edit by hand.", "package com.wireline.app.ui.theme", "", "import androidx.compose.ui.graphics.Color", "import androidx.compose.ui.unit.dp", "", "object WirelineTokens {", "    object ColorToken {", ...colors.map(kotlinColor), "    }", "    object Space {", ...spaces.map(([key, value]) => `        val ${name(key)} = ${px(value, key)}.dp`), "    }", "    object Radius {", ...radii.map(([key, value]) => `        val ${name(key)} = ${px(value, key)}.dp`), "    }", "    object Interaction {", ...interaction.map(([key, value]) => `        val ${name(key)} = ${px(value, key)}.dp`), "    }", "    object Motion {", ...durations.map(([key, value]) => `        const val ${name(key)}Millis = ${ms(value, key)}`), `        const val motionPress = ${Number(values["motion.press"]).toFixed(2)}f`, "    }", "}", ""].join("\n");
const files = [[outputs.css, css], [outputs.ts, ts], [outputs.swiftApp, swift], [outputs.swiftWidget, swift], [outputs.kotlin, kotlin]];
if (check) {
  for (const [path, expected] of files) {
    if (!existsSync(path) || readFileSync(path, "utf8") !== expected) throw new Error(`Generated Wireline token artifact is stale: ${path}`);
  }
} else {
  await Promise.all(files.map(([path]) => mkdir(dirname(path), { recursive: true })));
  await Promise.all(files.map(([path, body]) => writeFile(path, body)));
}
console.log(`${check ? "Verified" : "Generated"} ${entries.length} tokens across ${files.length} artifacts.`);
