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

function designToken(tokens, ...segments) {
  let current = tokens;
  for (const segment of segments) current = current?.[segment];
  if (!current || typeof current.$value !== "string") {
    throw new Error(`Missing design token: ${segments.join(".")}`);
  }
  return current.$value;
}

/**
 * Stripe accepts a separate non-square logo in addition to the square account
 * icon. Build that lockup from the canonical vector mark and design tokens so
 * the uploaded merchant identity can never drift into a hand-edited export.
 */
function writeStripeLogoSource() {
  const tokens = JSON.parse(
    readFileSync(resolve(root, "design-tokens/wireline.tokens.json"), "utf8"),
  );
  const mark = readFileSync(resolve(root, "public/wireline-icon.svg"), "utf8");
  const embeddedMark = Buffer.from(mark, "utf8").toString("base64");
  const brand = designToken(tokens, "color", "action", "primary", "pressed");
  const ink = designToken(tokens, "color", "surface", "default");
  const displayFont = designToken(tokens, "font", "family", "display");
  const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 360" role="img" aria-labelledby="title description">
  <title id="title">Try Wireline</title>
  <desc id="description">Try Wireline wordmark with the canonical Wireline signal mark.</desc>
  <image href="data:image/svg+xml;base64,${embeddedMark}" x="30" y="30" width="300" height="300"/>
  <text x="400" y="146" fill="${brand}" font-family="${displayFont}, sans-serif" font-size="54" font-weight="700" letter-spacing="13">TRY</text>
  <text x="392" y="258" fill="${ink}" font-family="${displayFont}, sans-serif" font-size="102" font-weight="800" letter-spacing="8">WIRELINE</text>
</svg>
`;
  writeFileSync(resolve(root, "public/wireline-stripe-logo.svg"), source, "utf8");
}

writeStripeLogoSource();

const targets = [
  { src: "public/favicon.svg", out: "public/favicon.png", width: 64 },
  { src: "public/og-image.svg", out: "public/og-image.png", width: 1200 },
  { src: "scripts/apple-touch-icon.svg", out: "public/apple-touch-icon.png", width: 180 },
  { src: "scripts/apple-touch-icon.svg", out: "public/wireline-icon-192.png", width: 192 },
  { src: "public/wireline-stripe-logo.svg", out: "public/wireline-stripe-logo.png", width: 1200 },
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
