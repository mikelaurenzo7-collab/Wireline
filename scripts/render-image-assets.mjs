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

function rasterSvg(png, title, description, width = 2048, height = 2048) {
  const embedded = png.toString("base64");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
  <title id="title">${title}</title>
  <desc id="description">${description}</desc>
  <image href="data:image/png;base64,${embedded}" width="${width}" height="${height}"/>
</svg>\n`;
}

function writeCompatibilitySvgSources() {
  const current = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2048 2048" role="img" aria-labelledby="title description">
  <title id="title">BotBound</title>
  <desc id="description">BotBound phone Bot app icon: a friendly robot visibly gripping a violet receiver.</desc>
  <metadata>Production raster artwork; Aurora violet #A78BFA; canonical source /brand/botbound-app-icon.png.</metadata>
  <image href="/brand/botbound-app-icon.png" width="2048" height="2048"/>
</svg>\n`;
  const legacy = current.replace(
    "BotBound phone Bot app icon: a friendly robot visibly gripping a violet receiver.",
    "Compatibility asset path rendering the BotBound phone Bot mark: a friendly robot visibly gripping a violet receiver.",
  );
  const favicon = current.replace(
    "BotBound phone Bot app icon: a friendly robot visibly gripping a violet receiver.",
    "BotBound phone Bot favicon with a visible hand and violet receiver.",
  );
  const extension = current.replace(
    'href="/brand/botbound-app-icon.png"',
    'href="../../../public/brand/botbound-app-icon.png"',
  );
  writeFileSync(resolve(root, "public/botbound-icon.svg"), current, "utf8");
  writeFileSync(resolve(root, "public/wireline-icon.svg"), legacy, "utf8");
  writeFileSync(resolve(root, "public/favicon.svg"), favicon, "utf8");
  writeFileSync(resolve(root, "apps/browser-extension/assets/icon.svg"), extension, "utf8");
}

function writeStripeLogoSource(appIcon) {
  const tokens = JSON.parse(readFileSync(resolve(root, "design-tokens/wireline.tokens.json"), "utf8"));
  const embeddedMark = appIcon.toString("base64");
  const brand = designToken(tokens, "color", "action", "primary", "default");
  const checkoutInk = designToken(tokens, "color", "canvas", "default");
  const checkoutMuted = designToken(tokens, "color", "text", "tertiary");
  const displayFont = designToken(tokens, "font", "family", "display");
  const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 360" role="img" aria-labelledby="title description">
  <title id="title">BotBound</title>
  <desc id="description">BotBound phone Bot with the AI employees for calls, texts, and email brand line.</desc>
  <image href="data:image/png;base64,${embeddedMark}" x="28" y="28" width="304" height="304"/>
  <text x="390" y="176" fill="${checkoutInk}" font-family="${displayFont}, sans-serif" font-size="104" font-weight="800" letter-spacing="-4.5">Bot<tspan fill="${brand}">Bound</tspan></text>
  <rect x="394" y="204" width="620" height="3" rx="1.5" fill="${brand}"/>
  <text x="394" y="258" fill="${checkoutMuted}" font-family="${displayFont}, sans-serif" font-size="28" font-weight="700" letter-spacing="3">AI EMPLOYEES FOR CALLS, TEXTS, AND EMAIL</text>
</svg>\n`;
  for (const out of ["public/botbound-stripe-logo.svg", "public/wireline-stripe-logo.svg"]) {
    writeFileSync(resolve(root, out), source, "utf8");
  }
  return source;
}

function writeOgSource(operator) {
  const embeddedOperator = operator.toString("base64");
  const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" role="img" aria-labelledby="title description">
  <title id="title">BotBound | Put Your Bot on the Line</title>
  <desc id="description">A friendly Bot grips a violet phone receiver beside the BotBound promise.</desc>
  <metadata>BotBound | PUT YOUR BOT ON THE LINE | AI employees for calls, texts, and email.</metadata>
  <defs>
    <radialGradient id="signal" cx="76%" cy="47%" r="54%"><stop stop-color="#8B5CF6" stop-opacity=".25"/><stop offset="1" stop-color="#8B5CF6" stop-opacity="0"/></radialGradient>
    <linearGradient id="canvas" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#14111F"/><stop offset=".52" stop-color="#0A0A0E"/><stop offset="1" stop-color="#050508"/></linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#canvas)"/>
  <rect width="1200" height="630" fill="url(#signal)"/>
  <path d="M0 570H1200" stroke="#A78BFA" stroke-opacity=".35"/>
  <text x="72" y="92" fill="#F5F4F8" font-family="Inter Tight, sans-serif" font-size="46" font-weight="800" letter-spacing="-2">Bot<tspan fill="#A78BFA">Bound</tspan></text>
  <text x="72" y="178" fill="#C4B5FD" font-family="IBM Plex Mono, monospace" font-size="20" font-weight="700" letter-spacing="4">THE AI EMPLOYEE THAT ANSWERS</text>
  <text x="68" y="286" fill="#F5F4F8" font-family="Inter Tight, sans-serif" font-size="80" font-weight="800" letter-spacing="-4">PUT YOUR BOT</text>
  <text x="68" y="364" fill="#F5F4F8" font-family="Inter Tight, sans-serif" font-size="80" font-weight="800" letter-spacing="-4">ON THE <tspan fill="#A78BFA">LINE.</tspan></text>
  <text x="72" y="428" fill="#B6B1C6" font-family="Inter, sans-serif" font-size="27" font-weight="500">Calls, texts, and email. Answered.</text>
  <rect x="72" y="484" width="296" height="52" rx="26" fill="#A78BFA"/>
  <text x="107" y="518" fill="#0E0B16" font-family="Inter Tight, sans-serif" font-size="20" font-weight="800" letter-spacing="1.4">BUILD YOUR BOT</text>
  <image href="data:image/png;base64,${embeddedOperator}" x="704" y="6" width="540" height="540"/>
</svg>\n`;
  writeFileSync(resolve(root, "public/og-image.svg"), source, "utf8");
  return source;
}

const appIcon = readFileSync(resolve(root, "public/brand/botbound-app-icon.png"));
const operator = readFileSync(resolve(root, "public/brand/botbound-operator-primary.png"));
const appIconSource = rasterSvg(
  appIcon,
  "BotBound",
  "A friendly Bot visibly gripping a violet telephone receiver.",
);

writeCompatibilitySvgSources();
const stripeLogoSource = writeStripeLogoSource(appIcon);
const ogSource = writeOgSource(operator);

const targets = [
  { source: appIconSource, out: "public/favicon.png", width: 64 },
  { source: ogSource, out: "public/og-image.png", width: 1200 },
  { source: appIconSource, out: "public/apple-touch-icon.png", width: 180 },
  { source: appIconSource, out: "public/botbound-icon-192.png", width: 192 },
  { source: appIconSource, out: "public/botbound-icon-512.png", width: 512 },
  { source: appIconSource, out: "public/botbound-stripe-icon.png", width: 512 },
  { source: appIconSource, out: "public/wireline-icon-192.png", width: 192 },
  { source: appIconSource, out: "public/wireline-icon-512.png", width: 512 },
  { source: appIconSource, out: "public/wireline-stripe-icon.png", width: 512 },
  { copy: appIcon, out: "ios/Wireline/Assets.xcassets/AppIcon.appiconset/icon.png", width: 1024 },
  { source: stripeLogoSource, out: "public/botbound-stripe-logo.png", width: 1200 },
  { source: stripeLogoSource, out: "public/wireline-stripe-logo.png", width: 1200 },
];

for (const target of targets) {
  const outputPath = resolve(root, target.out);
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  if (target.copy) {
    writeFileSync(outputPath, target.copy);
    console.log(`✔ copied ${target.out} (${target.copy.length} bytes)`);
    continue;
  }
  const resvg = new Resvg(target.source, {
    fitTo: { mode: "width", value: target.width },
    font: {
      fontFiles: [
        resolve(root, "public/fonts/NGSwv5HMAFg6IuGlBNMjxLsH8ag.woff2"),
        resolve(root, "public/fonts/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2"),
      ],
      loadSystemFonts: true,
      defaultFontFamily: "Inter Tight",
    },
  });
  const png = resvg.render().asPng();
  writeFileSync(outputPath, png);
  console.log(`✔ rendered ${target.out} (${png.length} bytes)`);
}

const extensionBuild = spawnSync(process.execPath, [resolve(root, "apps/browser-extension/scripts/build.mjs")], { cwd: root, encoding: "utf8", stdio: "inherit" });
if (extensionBuild.error) throw extensionBuild.error;
if (extensionBuild.status !== 0) throw new Error(`Browser-extension packaging failed with status ${extensionBuild.status}.`);
