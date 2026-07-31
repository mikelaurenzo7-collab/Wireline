#!/usr/bin/env node
import { readFileSync } from "node:fs";

const canonical = JSON.parse(readFileSync("design-tokens/wireline.tokens.json", "utf8"));
const web = readFileSync("src/constants/generated-design-tokens.ts", "utf8");
const css = readFileSync("apps/browser-extension/panel/tokens.generated.css", "utf8");
const iosShared = readFileSync("ios/WirelineShared/WirelineDesignTokens.generated.swift", "utf8");
const iosSharedColor = readFileSync("ios/WirelineShared/Color+Hex.swift", "utf8");
const iosSharedBrand = readFileSync("ios/WirelineShared/WirelineBrand.swift", "utf8");
const iosApp = readFileSync("ios/Wireline/Theme/WirelineDesignTokens.generated.swift", "utf8");
const android = readFileSync(
  "android/app/src/main/java/com/wireline/app/ui/theme/WirelineDesignTokens.kt",
  "utf8",
);

// The token source is DTCG-shaped: leaves carry "$value", not the legacy
// "value" key. Flattening on the wrong key silently yields zero leaves and
// turns the whole parity sweep into a no-op, so match "$value" explicitly.
const flatten = (obj, prefix = []) => Object.entries(obj).flatMap(([key, value]) => {
  if (value && typeof value === "object" && "$value" in value) {
    return [[prefix.concat(key).join("."), String(value.$value)]];
  }
  if (value && typeof value === "object") return flatten(value, prefix.concat(key));
  return [];
});

const expandHex = (value) => {
  const digits = value.slice(1);
  return digits.length === 3 ? digits.split("").map((d) => d + d).join("") : digits;
};

const problems = [];
if (!iosSharedColor.includes("public extension Color") || !iosSharedColor.includes("init(hex: UInt32")) {
  problems.push("iOS shared targets are missing the Color(hex:) token decoder.");
}
if (!iosSharedBrand.includes("enum Brand") || !iosSharedBrand.includes("extension Font")) {
  problems.push("iOS shared targets are missing the Brand typography and semantic token bridge.");
}
for (const [name, value] of flatten(canonical)) {
  if (!/^#(?:[0-9a-f]{3}){1,2}$/i.test(value)) continue;
  const hex = expandHex(value).toLowerCase();
  // Each platform stores the same color in its native literal form.
  const surfaces = [
    ["web generated TS", web, `#${hex}`],
    ["browser extension CSS", css, `#${hex}`],
    ["iOS shared tokens", iosShared, `0x${hex}`],
    ["iOS app tokens", iosApp, `0x${hex}`],
    ["Android tokens", android, `0xff${hex}`],
  ];
  for (const [label, text, literal] of surfaces) {
    if (!text.toLowerCase().includes(literal)) problems.push(`${label} is missing ${name} (${value}).`);
  }
}

if (problems.length) {
  console.error("design token parity failed:");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log("design token parity ok");
