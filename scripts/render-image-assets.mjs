// Renders canonical SVG sources to PNGs in public/ and native asset catalogs.
// Runs as a prebuild step so favicons, social cards, install icons, native icons,
// and billing lockups always stay in sync with the folded Wireline W.
//
// Why @resvg/resvg-js: pure-WASM, no native compile, no system deps, and
// deterministic output from the SVG source of truth.

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
 * Stripe accepts a separate horizontal logo in addition to the square account
 * icon. Checkout and portal surfaces are predominantly light, so this lockup
 * intentionally uses the dark surface and border tokens for accessible text
 * while retaining the canonical violet rule and folded app icon.
 */
function writeStripeLogoSource() {
  const tokens = JSON.parse(
    readFileSync(resolve(root, "design-tokens/wireline.tokens.json"), "utf8"),
  );
  const mark = readFileSync(resolve(root, "public/wireline-icon.svg"), "utf8");
  const embeddedMark = Buffer.from(mark, "utf8").toString("base64");
  const brand = designToken(tokens, "color", "action", "primary", "default");
  const checkoutInk = designToken(tokens, "color", "surface", "default");
  const checkoutMuted = designToken(tokens, "color", "border", "strong");
  const displayFont = designToken(tokens, "font", "family", "display");
  const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 360" role="img" aria-labelledby="title description">
  <title id="title">Wireline</title>
  <desc id="description">Wireline folded W with the Bots That Get the Work Done brand line.</desc>
  <image href="data:image/svg+xml;base64,${embeddedMark}" x="28" y="28" width="304" height="304"/>
  <text x="390" y="176" fill="${checkoutInk}" font-family="${displayFont}, sans-serif" font-size="104" font-weight="800" letter-spacing="2">WIRELINE</text>
  <rect x="394" y="204" width="620" height="3" rx="1.5" fill="${brand}"/>
  <text x="394" y="258" fill="${checkoutMuted}" font-family="${displayFont}, sans-serif" font-size="31" font-weight="700" letter-spacing="7">BOTS THAT GET THE WORK DONE</text>
</svg>
`;
  writeFileSync(resolve(root, "public/wireline-stripe-logo.svg"), source, "utf8");
}

writeStripeLogoSource();

const targets = [
  { src: "public/favicon.svg", out: "public/favicon.png", width: 64 },
  { src: "public/og-image.svg", out: "public/og-image.png", width: 1200 },
  { src: "scripts/apple-touch-icon.svg", out: "public/apple-touch-icon.png", width: 180 },
  { src: "public/wireline-icon.svg", out: "public/wireline-icon-192.png", width: 192 },
  { src: "public/wireline-icon.svg", out: "public/wireline-icon-512.png", width: 512 },
  { src: "public/wireline-icon.svg", out: "public/wireline-stripe-icon.png", width: 512 },
  { src: "scripts/ios-app-icon.svg", out: "ios/Wireline/Assets.xcassets/AppIcon.appiconset/icon.png", width: 1024 },
  { src: "public/wireline-stripe-logo.svg", out: "public/wireline-stripe-logo.png", width: 1200 },
];

for (const target of targets) {
  const svg = readFileSync(resolve(root, target.src), "utf8");
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: target.width },
    font: { loadSystemFonts: true, defaultFontFamily: "sans-serif" },
  });
  const png = resvg.render().asPng();
  const outputPath = resolve(root, target.out);
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputPath, png);
  console.log(`✔ rendered ${target.out} (${png.length} bytes)`);
}
