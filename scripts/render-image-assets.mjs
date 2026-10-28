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
  if (!current || typeof current.$value !== "string")
    throw new Error(`Missing design token: ${segments.join(".")}`);
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
  const tokens = JSON.parse(
    readFileSync(resolve(root, "design-tokens/wireline.tokens.json"), "utf8"),
  );
  const embeddedMark = appIcon.toString("base64");
  const brand = designToken(tokens, "color", "action", "primary", "default");
  const checkoutInk = designToken(tokens, "color", "canvas", "default");
  const checkoutMuted = designToken(tokens, "color", "text", "tertiary");
  const displayFont = designToken(tokens, "font", "family", "display");
  const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 360" role="img" aria-labelledby="title description">
  <title id="title">BotBound</title>
  <desc id="description">BotBound phone Bot beside the brand promise: voice Bots for calls and web work.</desc>
  <image href="data:image/png;base64,${embeddedMark}" x="28" y="28" width="304" height="304"/>
  <text x="390" y="176" fill="${checkoutInk}" font-family="${displayFont}, sans-serif" font-size="104" font-weight="800" letter-spacing="-4.5">Bot<tspan fill="${brand}">Bound</tspan></text>
  <rect x="394" y="204" width="620" height="3" rx="1.5" fill="${brand}"/>
  <text x="394" y="258" fill="${checkoutMuted}" font-family="${displayFont}, sans-serif" font-size="28" font-weight="700" letter-spacing="3">Voice Bots for Calls and Web Work</text>
</svg>\n`;
  for (const out of ["public/botbound-stripe-logo.svg", "public/wireline-stripe-logo.svg"]) {
    writeFileSync(resolve(root, out), source, "utf8");
  }
  return source;
}

function writeOgSource(brandMark) {
  const embeddedImage = brandMark.toString("base64");
  const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" role="img" aria-labelledby="title description">
  <title id="title">BotBound | Your next hire is a bot.</title>
  <desc id="description">Your next hire is a bot. Inbound and outbound calls, SMS, email, and computer tasks for small businesses.</desc>
  <metadata>BotBound launch identity. Generated from code and the approved phone Bot mark.</metadata>
  <defs><radialGradient id="wash"><stop stop-color="#eee7fc"/><stop offset="1" stop-color="#f7f7f3"/></radialGradient></defs>
  <rect width="1200" height="630" fill="#f7f7f3"/>
  <ellipse cx="1070" cy="100" rx="450" ry="440" fill="url(#wash)"/>
  <image href="data:image/png;base64,${embeddedImage}" x="936" y="52" width="184" height="184"/>
  <g font-family="Inter, sans-serif">
    <text x="76" y="108" fill="#19191d" font-size="38" font-weight="800" letter-spacing="-1.8">Bot<tspan fill="#7040d7">Bound</tspan></text>
    <text x="76" y="280" fill="#19191d" font-size="78" font-weight="800" letter-spacing="-3">YOUR NEXT HIRE</text>
    <text x="76" y="372" fill="#7040d7" font-size="78" font-weight="800" letter-spacing="-3">IS A BOT.</text>
    <text x="80" y="449" fill="#626268" font-size="28">Inbound and outbound calls, SMS,</text>
    <text x="80" y="488" fill="#626268" font-size="28">email, and computer tasks for small businesses.</text>
    <text x="80" y="568" fill="#626268" font-size="22">botbound.app</text>
  </g>
</svg>\n`;
  writeFileSync(resolve(root, "public/og-image.svg"), source, "utf8");
  return source;
}

const ogImage = readFileSync(resolve(root, "public/brand/botbound-operator-polished.png"));
const ogImageSource = writeOgSource(ogImage);
if (process.argv.includes("--og-only")) {
  const png = new Resvg(ogImageSource, {
    fitTo: { mode: "width", value: 1200 },
    font: {
      fontFiles: [
        resolve(root, "brand-work/fonts/Inter-Regular.ttf"),
        resolve(root, "brand-work/fonts/Inter-ExtraBold.ttf"),
      ],
      loadSystemFonts: false,
      defaultFontFamily: "Inter",
    },
  })
    .render()
    .asPng();
  writeFileSync(resolve(publicDir, "og-image.png"), png);
  writeFileSync(resolve(publicDir, "brand/botbound-current-offer-og.png"), png);
  console.log(`✔ rendered public/og-image.png (${png.length} bytes)`);
  process.exit(0);
}

const appIcon = readFileSync(resolve(root, "public/brand/botbound-app-icon.png"));
const appIconSource = rasterSvg(
  appIcon,
  "BotBound",
  "A friendly Bot visibly gripping a violet telephone receiver.",
);

writeCompatibilitySvgSources();
const stripeLogoSource = writeStripeLogoSource(appIcon);

const targets = [
  { source: appIconSource, out: "public/favicon.png", width: 64 },
  { source: ogImageSource, out: "public/og-image.png", width: 1200 },
  { source: ogImageSource, out: "public/brand/botbound-current-offer-og.png", width: 1200 },
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
        resolve(root, "brand-work/fonts/InterTight-ExtraBold.ttf"),
        resolve(root, "brand-work/fonts/Inter-Regular.ttf"),
        resolve(root, "brand-work/fonts/Inter-SemiBold.ttf"),
        resolve(root, "brand-work/fonts/Inter-Bold.ttf"),
        resolve(root, "brand-work/fonts/Inter-ExtraBold.ttf"),
        resolve(root, "brand-work/fonts/IBMPlexMono-Bold.ttf"),
      ],
      loadSystemFonts: false,
      defaultFontFamily: "Inter Tight",
    },
  });
  const png = resvg.render().asPng();
  writeFileSync(outputPath, png);
  console.log(`✔ rendered ${target.out} (${png.length} bytes)`);
}

const extensionBuild = spawnSync(
  process.execPath,
  [resolve(root, "apps/browser-extension/scripts/build.mjs")],
  { cwd: root, encoding: "utf8", stdio: "inherit" },
);
if (extensionBuild.error) throw extensionBuild.error;
if (extensionBuild.status !== 0)
  throw new Error(`Browser-extension packaging failed with status ${extensionBuild.status}.`);
