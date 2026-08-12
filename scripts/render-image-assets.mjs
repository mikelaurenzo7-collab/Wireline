// Renders canonical SVG sources to PNGs in public/.
// Runs as a prebuild step so favicon.png, og-image.png, and touch icons are
// always in sync with their SVG sources without committing binary blobs.
//
// Why @resvg/resvg-js: pure-WASM, no native compile, no system deps,
// renders fonts deterministically from generic family names. Ships ~7MB
// in devDependencies — only used at build time.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const publicDir = resolve(root, "public");

if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });

const targets = [
  { src: "public/favicon.svg", out: "public/favicon.png", width: 64 },
  { src: "public/og-image.svg", out: "public/og-image.png", width: 1200 },
  { src: "scripts/apple-touch-icon.svg", out: "public/apple-touch-icon.png", width: 180 },
  { src: "scripts/apple-touch-icon.svg", out: "public/wireline-icon-192.png", width: 192 },
];

for (const t of targets) {
  const svg = readFileSync(resolve(root, t.src), "utf8");
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: t.width },
    font: { loadSystemFonts: true, defaultFontFamily: "sans-serif" },
  });
  const png = resvg.render().asPng();
  writeFileSync(resolve(root, t.out), png);
  // eslint-disable-next-line no-console
  console.log(`✔ rendered ${t.out} (${png.length} bytes)`);
}
