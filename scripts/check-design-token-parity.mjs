#!/usr/bin/env node
import { readFileSync } from "node:fs";

const canonical = JSON.parse(readFileSync("design-tokens/wireline.tokens.json", "utf8"));
const web = readFileSync("src/constants/generated-design-tokens.ts", "utf8");
const css = readFileSync("apps/browser-extension/panel/tokens.generated.css", "utf8");
const iosShared = readFileSync("ios/WirelineShared/WirelineDesignTokens.generated.swift", "utf8");
const iosSharedColor = readFileSync("ios/WirelineShared/Color+Hex.swift", "utf8");
const iosApp = readFileSync("ios/Wireline/Theme/WirelineDesignTokens.generated.swift", "utf8");
const android = readFileSync(
  "android/app/src/main/java/com/wireline/app/ui/theme/WirelineDesignTokens.kt",
  "utf8",
);

const flatten = (obj, prefix = []) => Object.entries(obj).flatMap(([key, value]) => {
  if (value && typeof value === "object" && "value" in value) return [[prefix.concat(key).join("."), String(value.value)]];
  if (value && typeof value === "object") return flatten(value, prefix.concat(key));
  return [];
});

const problems = [];
if (!iosSharedColor.includes("public extension Color") || !iosSharedColor.includes("init(hex: UInt32")) {
  problems.push("iOS shared targets are missing the Color(hex:) token decoder.");
}
for (const [name, value] of flatten(canonical)) {
  if (!/^#(?:[0-9a-f]{3}){1,2}$/i.test(value)) continue;
  const normalized = value.toLowerCase();
  const surfaces = [
    ["web generated TS", web],
    ["browser extension CSS", css],
    ["iOS shared tokens", iosShared],
    ["iOS app tokens", iosApp],
    ["Android tokens", android],
  ];
  for (const [label, text] of surfaces) {
    if (!text.toLowerCase().includes(normalized)) problems.push(`${label} is missing ${name} (${value}).`);
  }
}

if (problems.length) {
  console.error("design token parity failed:");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log("design token parity ok");
