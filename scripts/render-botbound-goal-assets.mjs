import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Resvg } from "@resvg/resvg-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const campaign = resolve(root, "brand-work/launch-2026-10-goal");
const output = resolve(campaign, "exports");
const operatorPath = resolve(root, "public/brand/botbound-operator-polished.png");
const photoPath = resolve(root, "brand-work/launch-2026-09-refresh/sources/stay-in-the-work.png");
const fontFiles = [
  "InterTight-ExtraBold.ttf",
  "Inter-Regular.ttf",
  "Inter-SemiBold.ttf",
  "IBMPlexMono-Bold.ttf",
].map((name) => resolve(root, "brand-work/fonts", name));
const operator = `data:image/png;base64,${readFileSync(operatorPath).toString("base64")}`;
const photo = `data:image/png;base64,${readFileSync(photoPath).toString("base64")}`;
const assets = [];

const escape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

function wordmark(x, y, size) {
  return `<text x="${x}" y="${y}" fill="#F5F4F8" font-family="Inter Tight" font-size="${size}" font-weight="800" letter-spacing="${(-0.047 * size).toFixed(2)}">Bot<tspan fill="#A78BFA">Bound</tspan></text>`;
}

function label(value, x, y, size = 18) {
  return `<text x="${x}" y="${y}" fill="#C4B5FD" font-family="IBM Plex Mono" font-size="${size}" font-weight="700" letter-spacing="${(size * 0.11).toFixed(2)}">${escape(value)}</text>`;
}

function headline(lines, x, y, size, gap) {
  return lines
    .map(
      (line, index) =>
        `<text x="${x}" y="${y + index * gap}" fill="${index === lines.length - 1 ? "#B9A0FF" : "#F5F4F8"}" font-family="Inter Tight" font-size="${size}" font-weight="800" letter-spacing="${(-0.04 * size).toFixed(2)}">${escape(line)}</text>`,
    )
    .join("");
}

function body(value, x, y, size = 26) {
  return `<text x="${x}" y="${y}" fill="#DED9E8" font-family="Inter" font-size="${size}" font-weight="400">${escape(value)}</text>`;
}

function cta(x, y, size = 22) {
  return `<g transform="translate(${x} ${y})"><rect width="230" height="58" rx="14" fill="#A78BFA"/><text x="26" y="39" fill="#100B19" font-family="Inter" font-size="${size}" font-weight="600">Start Free</text><path d="M178 29h26m-9-9 9 9-9 9" fill="none" stroke="#100B19" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></g>`;
}

function frame(width, height, title, content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(title)}"><title>${escape(title)}</title><desc>BotBound campaign art with the approved robot operator. Inbound and outbound voice Bots can answer and place calls; Computer work is a separately started browser task. This is prepared creative, not a customer result.</desc><defs>
    <linearGradient id="canvas" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#171020"/><stop offset=".56" stop-color="#0A0A0E"/><stop offset="1" stop-color="#050508"/></linearGradient>
    <radialGradient id="halo"><stop stop-color="#8B5CF6" stop-opacity=".27"/><stop offset="1" stop-color="#8B5CF6" stop-opacity="0"/></radialGradient>
    <linearGradient id="photoShade" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#08070D" stop-opacity=".3"/><stop offset=".54" stop-color="#08070D" stop-opacity="0"/><stop offset="1" stop-color="#08070D" stop-opacity=".9"/></linearGradient>
  </defs><rect width="${width}" height="${height}" fill="url(#canvas)"/>${content}</svg>`;
}

function emit(name, width, height, content) {
  const title = "Give Your Bot a Goal. | BotBound";
  const svg = frame(width, height, title, content);
  const png = new Resvg(svg, {
    font: { fontFiles, loadSystemFonts: false, defaultFontFamily: "Inter" },
  })
    .render()
    .asPng();
  mkdirSync(output, { recursive: true });
  const path = resolve(output, `${name}.png`);
  writeFileSync(path, png);
  assets.push({
    file: `${name}.png`,
    width,
    height,
    bytes: png.length,
    sha256: createHash("sha256").update(png).digest("hex"),
  });
}

function wide(width, height, name) {
  const compact = height < 500;
  const x = compact ? 62 : 66;
  const headlineSize = compact ? 70 : 86;
  const headlineY = compact ? 190 : 292;
  const operatorSize = compact ? 390 : 610;
  const operatorX = width - operatorSize + (compact ? 16 : 30);
  const operatorY = compact ? 10 : 20;
  emit(
    name,
    width,
    height,
    `<ellipse cx="${operatorX + operatorSize * 0.5}" cy="${operatorY + operatorSize * 0.54}" rx="${operatorSize * 0.68}" ry="${operatorSize * 0.64}" fill="url(#halo)"/>
      <image href="${operator}" x="${operatorX}" y="${operatorY}" width="${operatorSize}" height="${operatorSize}"/>
      ${wordmark(x, compact ? 72 : 86, compact ? 43 : 46)}
      ${label("INBOUND + OUTBOUND", x, compact ? 116 : 150, compact ? 16 : 18)}
      ${headline(["Give Your Bot", "a Goal."], x, headlineY, headlineSize, compact ? 72 : 88)}
      ${body("Answer calls. Make calls. Work online.", x, compact ? 323 : 466, compact ? 21 : 26)}
      ${compact ? label("BOTBOUND.APP", x, 372, 17) : `${cta(x, 506)}${body("BOTBOUND.APP", 324, 544, 20)}`}`,
  );
}

wide(1200, 630, "botbound-goal-wide-1200x630");
wide(1200, 400, "botbound-goal-email-1200x400");

for (const [name, width, height] of [
  ["botbound-goal-feed-1080x1350", 1080, 1350],
  ["botbound-goal-story-1080x1920", 1080, 1920],
  ["botbound-goal-square-1080x1080", 1080, 1080],
]) {
  const story = height > 1500;
  const square = height === width;
  const photoTop = story ? 710 : square ? 480 : 510;
  const copyX = 72;
  const headlineY = story ? 340 : square ? 235 : 260;
  const headlineSize = story ? 104 : square ? 82 : 92;
  const operatorSize = story ? 380 : square ? 290 : 335;
  const operatorY = story ? 180 : square ? 115 : 147;
  const footerTop = height - (story ? 270 : square ? 196 : 230);
  emit(
    name,
    width,
    height,
    `<image href="${photo}" x="0" y="${photoTop}" width="${width}" height="${height - photoTop}" preserveAspectRatio="xMidYMid slice"/>
      <rect x="0" y="${photoTop}" width="${width}" height="${height - photoTop}" fill="url(#photoShade)"/>
      <ellipse cx="${width - 190}" cy="${operatorY + 190}" rx="250" ry="300" fill="url(#halo)"/>
      <image href="${operator}" x="${width - operatorSize - 30}" y="${operatorY}" width="${operatorSize}" height="${operatorSize}"/>
      ${wordmark(copyX, story ? 122 : 90, story ? 56 : 50)}
      ${label("INBOUND + OUTBOUND", copyX, story ? 190 : 146, story ? 22 : 19)}
      ${headline(["Give Your", "Bot a Goal."], copyX, headlineY, headlineSize, story ? 108 : square ? 82 : 94)}
      ${body("Answer calls. Make calls.", copyX, story ? 518 : square ? 393 : 427, story ? 32 : 27)}
      ${body("Work online.", copyX, story ? 561 : square ? 430 : 464, story ? 32 : 27)}
      <rect x="0" y="${footerTop}" width="${width}" height="${height - footerTop}" fill="#08070D" opacity=".82"/>
      ${cta(copyX, footerTop + 50, story ? 22 : 21)}
      ${body("BotBound.app", copyX, footerTop + 161, story ? 30 : 26)}`,
  );
}

const inputFiles = [operatorPath, photoPath, ...fontFiles].map((path) => ({
  file: path.slice(root.length + 1).replaceAll("\\", "/"),
  sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
}));
writeFileSync(
  resolve(output, "manifest.json"),
  `${JSON.stringify(
    {
      status:
        "Prepared review candidates; publication and paid placement not approved by rendering",
      destination: "https://botbound.app/signup?plan=free",
      claimBoundary:
        "Computer browser tasks are started separately; Email depends on selected plan",
      inputs: inputFiles,
      assets,
    },
    null,
    2,
  )}\n`,
);
console.log(`Rendered ${assets.length} BotBound Goal assets to ${output}`);
