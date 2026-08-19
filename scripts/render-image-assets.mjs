// Renders canonical BotBound SVG sources to PNGs for web, billing, native,
// and browser-extension surfaces. Legacy wireline-named outputs are generated
// as compatibility aliases until external dashboards have been cut over.
import { spawnSync } from "node:child_process";
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
  if (!current || typeof current.$value !== "string") throw new Error(`Missing design token: ${segments.join(".")}`);
  return current.$value;
}

function writeStripeLogoSource() {
  const tokens = JSON.parse(readFileSync(resolve(root, "design-tokens/wireline.tokens.json"), "utf8"));
  const mark = readFileSync(resolve(root, "public/botbound-icon.svg"), "utf8");
  const embeddedMark = Buffer.from(mark, "utf8").toString("base64");
  const brand = designToken(tokens, "color", "action", "primary", "default");
  const checkoutInk = designToken(tokens, "color", "surface", "default");
  const checkoutMuted = designToken(tokens, "color", "border", "strong");
  const displayFont = designToken(tokens, "font", "family", "display");
  const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 360" role="img" aria-labelledby="title description">
  <title id="title">BotBound</title>
  <desc id="description">BotBound phone Bot with the AI employees for calls, texts, and email brand line.</desc>
  <image href="data:image/svg+xml;base64,${embeddedMark}" x="28" y="28" width="304" height="304"/>
  <text x="390" y="176" fill="${checkoutInk}" font-family="${displayFont}, sans-serif" font-size="104" font-weight="760" letter-spacing="-3">Bot<tspan fill="${brand}">Bound</tspan></text>
  <rect x="394" y="204" width="620" height="3" rx="1.5" fill="${brand}"/>
  <text x="394" y="258" fill="${checkoutMuted}" font-family="${displayFont}, sans-serif" font-size="28" font-weight="650" letter-spacing="3">AI EMPLOYEES FOR CALLS, TEXTS, AND EMAIL</text>
</svg>\n`;
  for (const out of ["public/botbound-stripe-logo.svg", "public/wireline-stripe-logo.svg"]) {
    writeFileSync(resolve(root, out), source, "utf8");
  }
}

writeStripeLogoSource();

const targets = [
  { src: "public/favicon.svg", out: "public/favicon.png", width: 64 },
  { src: "public/og-image.svg", out: "public/og-image.png", width: 1200 },
  { src: "public/botbound-icon.svg", out: "public/apple-touch-icon.png", width: 180 },
  { src: "public/botbound-icon.svg", out: "public/botbound-icon-192.png", width: 192 },
  { src: "public/botbound-icon.svg", out: "public/botbound-icon-512.png", width: 512 },
  { src: "public/botbound-icon.svg", out: "public/botbound-stripe-icon.png", width: 512 },
  { src: "public/botbound-icon.svg", out: "public/wireline-icon-192.png", width: 192 },
  { src: "public/botbound-icon.svg", out: "public/wireline-icon-512.png", width: 512 },
  { src: "public/botbound-icon.svg", out: "public/wireline-stripe-icon.png", width: 512 },
  { src: "public/botbound-icon.svg", out: "ios/Wireline/Assets.xcassets/AppIcon.appiconset/icon.png", width: 1024 },
  { src: "public/botbound-stripe-logo.svg", out: "public/botbound-stripe-logo.png", width: 1200 },
  { src: "public/botbound-stripe-logo.svg", out: "public/wireline-stripe-logo.png", width: 1200 },
];

for (const target of targets) {
  const svg = readFileSync(resolve(root, target.src), "utf8");
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: target.width }, font: { loadSystemFonts: true, defaultFontFamily: "sans-serif" } });
  const png = resvg.render().asPng();
  const outputPath = resolve(root, target.out);
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputPath, png);
  console.log(`✔ rendered ${target.out} (${png.length} bytes)`);
}

const extensionBuild = spawnSync(process.execPath, [resolve(root, "apps/browser-extension/scripts/build.mjs")], { cwd: root, encoding: "utf8", stdio: "inherit" });
if (extensionBuild.error) throw extensionBuild.error;
if (extensionBuild.status !== 0) throw new Error(`Browser-extension packaging failed with status ${extensionBuild.status}.`);
