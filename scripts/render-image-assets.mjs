// Canonical BotBound identity pipeline.
// FINAL masters in public/brand/ are authoritative:
//   A Presenting = marketing lockup, app tile, OG, store icons
//   B letterpress violet phone glyph = mark, favicon, PWA, Stripe, Studio, extension toolbar
// This script copies those masters into public/native/extension paths.
// It does not emit wireline-* brand twins and does not recreate landline/receiver art.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const publicDir = resolve(root, "public");
const brandDir = resolve(publicDir, "brand");
if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });
if (!existsSync(brandDir)) mkdirSync(brandDir, { recursive: true });

const RETIRED_WIRELINE_TWINS = [
  "public/wireline-icon.svg",
  "public/wireline-icon-192.png",
  "public/wireline-icon-512.png",
  "public/wireline-stripe-icon.jpg",
  "public/wireline-stripe-icon.png",
  "public/wireline-stripe-logo.jpg",
  "public/wireline-stripe-logo.png",
  "public/wireline-stripe-logo.svg",
  "public/wireline-chatgpt-app-icon.svg",
];

function abs(relative) {
  return resolve(root, relative);
}

function readBrand(name) {
  const path = resolve(brandDir, name);
  if (!existsSync(path)) throw new Error(`Missing brand master: public/brand/${name}`);
  return readFileSync(path);
}

function writeOut(relative, bytes) {
  const outputPath = abs(relative);
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputPath, bytes);
  const size = Buffer.isBuffer(bytes) ? bytes.length : Buffer.byteLength(bytes);
  console.log(`✔ wrote ${relative} (${size} bytes)`);
}

function copyOut(fromRelative, toRelative) {
  const from = abs(fromRelative);
  const to = abs(toRelative);
  if (!existsSync(from)) throw new Error(`Missing source: ${fromRelative}`);
  const outputDir = dirname(to);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  copyFileSync(from, to);
  console.log(`✔ copied ${fromRelative} → ${toRelative}`);
}

function titledGlyphSvg({ title, description }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" fill="none" role="img" aria-labelledby="title description">
  <title id="title">${title}</title>
  <desc id="description">${description}</desc>
  <rect x="184" y="128" width="656" height="768" rx="96" fill="#14141C"/>
  <rect x="232" y="176" width="560" height="672" rx="72" fill="#A78BFA"/>
  <rect x="392" y="208" width="240" height="36" rx="18" fill="#14141C"/>
</svg>
`;
}

function presentingIconSvg({ title, description, href }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-labelledby="title description">
  <title id="title">${title}</title>
  <desc id="description">${description}</desc>
  <image href="${href}" width="1024" height="1024"/>
</svg>
`;
}

function rasterSvgToPng(svg, width) {
  return new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: { loadSystemFonts: false },
  })
    .render()
    .asPng();
}

function rasterPngToPng(png, width) {
  const embedded = png.toString("base64");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><image href="data:image/png;base64,${embedded}" width="1024" height="1024"/></svg>`;
  return rasterSvgToPng(svg, width);
}

const glyphSvg = titledGlyphSvg({
  title: "BotBound",
  description:
    "BotBound letterpress violet phone glyph used as the in-product mark, favicon, and PWA icon.",
});
const extensionGlyphSvg = titledGlyphSvg({
  title: "BotBound",
  description: "BotBound letterpress violet phone glyph for the BotBound Command toolbar icon.",
});
const appleTouchSvg = titledGlyphSvg({
  title: "BotBound",
  description: "BotBound letterpress violet phone glyph for the Apple touch icon.",
});
const iosAppIconSvg = presentingIconSvg({
  title: "BotBound",
  description: "BotBound Presenting marketing app tile for the iOS store icon. No wordmark.",
  href: "../public/brand/botbound-app-icon.png",
});

writeOut("public/favicon.svg", glyphSvg);
writeOut("public/botbound-icon.svg", glyphSvg);
writeOut("public/brand/botbound-mark.svg", glyphSvg);
writeOut("apps/browser-extension/assets/icon.svg", extensionGlyphSvg);
writeOut("scripts/apple-touch-icon.svg", appleTouchSvg);
writeOut("scripts/ios-app-icon.svg", iosAppIconSvg);

copyOut("public/brand/botbound-mark.png", "public/brand/botbound-operator-primary.png");
copyOut("public/brand/botbound-mark.png", "public/brand/botbound-operator-polished.png");

copyOut(
  "public/brand/botbound-app-icon-1024.png",
  "ios/Wireline/Assets.xcassets/AppIcon.appiconset/icon.png",
);
copyOut(
  "public/brand/botbound-app-icon.png",
  "android/app/src/main/res/drawable-nodpi/botbound_launcher_foreground.png",
);
copyOut("public/brand/botbound-app-icon.png", "apps/botbound-film/public/brand/botbound-app-icon.png");
copyOut(
  "public/brand/botbound-operator-primary.png",
  "apps/botbound-film/public/brand/botbound-operator-primary.png",
);
copyOut(
  "public/brand/botbound-operator-primary.png",
  "brand-work/selected/botbound-operator-primary.png",
);

copyOut("public/brand/apple-touch-icon.png", "public/apple-touch-icon.png");
copyOut("public/brand/og-image.png", "public/og-image.png");
copyOut("public/brand/favicon.ico", "public/favicon.ico");
copyOut("public/brand/botbound-icon-192.png", "public/botbound-icon-192.png");
copyOut("public/brand/botbound-icon-512.png", "public/botbound-icon-512.png");
copyOut("public/brand/botbound-icon-192-maskable.png", "public/botbound-icon-192-maskable.png");
copyOut("public/brand/botbound-icon-512-maskable.png", "public/botbound-icon-512-maskable.png");
copyOut("public/brand/botbound-stripe-icon.png", "public/botbound-stripe-icon.png");
copyOut("public/brand/botbound-stripe-logo.png", "public/botbound-stripe-logo.png");
copyOut("public/brand/botbound-stripe-logo.svg", "public/botbound-stripe-logo.svg");

writeOut("public/favicon.png", rasterSvgToPng(glyphSvg, 64));

const ogSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" role="img" aria-labelledby="title description">
  <title id="title">BotBound</title>
  <desc id="description">BotBound Presenting lockup. Find. Call. Book. OUTBOUND SALES. INBOUND CALLS. Outbound sales. Inbound calls. Marketing OG uses the Presenting character with a cell phone beside the BotBound wordmark on an obsidian canvas.</desc>
  <rect width="1200" height="630" fill="#0A0A0E"/>
  <image href="/brand/og-image.png" width="1200" height="630"/>
</svg>
`;
writeOut("public/og-image.svg", ogSvg);

const androidMipmaps = [
  ["android/app/src/main/res/mipmap-mdpi/ic_launcher.png", 48],
  ["android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png", 48],
  ["android/app/src/main/res/mipmap-hdpi/ic_launcher.png", 72],
  ["android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png", 72],
  ["android/app/src/main/res/mipmap-xhdpi/ic_launcher.png", 96],
  ["android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png", 96],
  ["android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png", 144],
  ["android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png", 144],
  ["android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png", 192],
  ["android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png", 192],
];
const presentingPng = readBrand("botbound-app-icon.png");
for (const [out, width] of androidMipmaps) {
  writeOut(out, rasterPngToPng(presentingPng, width));
  const webpTwin = out.replace(/\.png$/, ".webp");
  if (existsSync(abs(webpTwin))) {
    unlinkSync(abs(webpTwin));
    console.log(`✔ removed retired ${webpTwin}`);
  }
}

for (const twin of RETIRED_WIRELINE_TWINS) {
  const path = abs(twin);
  if (existsSync(path)) {
    unlinkSync(path);
    console.log(`✔ removed retired ${twin}`);
  }
}

const extensionBuild = spawnSync(
  process.execPath,
  [resolve(root, "apps/browser-extension/scripts/build.mjs")],
  { cwd: root, encoding: "utf8", stdio: "inherit" },
);
if (extensionBuild.error) throw extensionBuild.error;
if (extensionBuild.status !== 0)
  throw new Error(`Browser-extension packaging failed with status ${extensionBuild.status}.`);
