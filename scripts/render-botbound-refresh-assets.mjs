import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { Resvg } from "@resvg/resvg-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const campaign = resolve(root, "brand-work/launch-2026-09-refresh");
let outputArgument;
try {
  const { values, tokens } = parseArgs({
    args: process.argv.slice(2),
    options: { output: { type: "string" } },
    strict: true,
    allowPositionals: false,
    tokens: true,
  });
  if (tokens.filter((token) => token.kind === "option" && token.name === "output").length > 1) {
    throw new Error("--output may be supplied only once");
  }
  if (values.output !== undefined && values.output.trim().length === 0) {
    throw new Error("--output requires a directory path");
  }
  outputArgument = values.output;
} catch (error) {
  throw new Error(`Invalid renderer arguments: ${error.message}. No release assets were changed.`);
}
const output = outputArgument ? resolve(outputArgument) : resolve(campaign, "exports");
const reviewOutput = outputArgument ? resolve(output, "qa") : resolve(campaign, "qa");
const manifestPath = resolve(output, "manifest.json");
const fonts = [
  "InterTight-ExtraBold.ttf",
  "Inter-Regular.ttf",
  "Inter-SemiBold.ttf",
  "Inter-Bold.ttf",
].map((f) => resolve(root, "brand-work/fonts", f));
const photo = data(resolve(campaign, "sources/stay-in-the-work.png"));
const operator = data(resolve(root, "public/brand/botbound-operator-polished.png"));
const catalog = [];
function data(path) {
  return `data:image/png;base64,${readFileSync(path).toString("base64")}`;
}
function esc(s) {
  return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function text(s, x, y, size, fill = "#F8F7FC", weight = 800) {
  return `<text x="${x}" y="${y}" font-family="${weight === 800 ? "Inter Tight" : "Inter"}" font-size="${size}" font-weight="${weight}" letter-spacing="${weight === 800 ? -size * 0.035 : 0}" fill="${fill}">${esc(s)}</text>`;
}
function logo(x, y, size) {
  return `<text x="${x}" y="${y}" font-family="Inter Tight" font-size="${size}" font-weight="800" letter-spacing="${-size * 0.047}" fill="#F8F7FC">Bot<tspan fill="#A78BFA">Bound</tspan></text>`;
}
function lines(items, x, y, size, gap = size * 0.99) {
  return items
    .map((s, i) => text(s, x, y + i * gap, size, i === items.length - 1 ? "#C4B5FD" : "#F8F7FC"))
    .join("");
}
function cta(x, y, scale = 1) {
  return `<g transform="translate(${x} ${y}) scale(${scale})"><rect width="250" height="68" rx="12" fill="#B298FB"/>${text("Start Free", 24, 46, 30, "#100B19", 700)}<path d="M205 24l10 10-10 10m-20-10h29" fill="none" stroke="#100B19" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g>`;
}
function frame(w, h, title, content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img"><title>${esc(title)}</title><desc>BotBound advertising creative. Private testing is free; live activation is currently paused. Prepared artwork, not a product demonstration.</desc><defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#050508" stop-opacity=".76"/><stop offset=".36" stop-color="#050508" stop-opacity="0"/><stop offset=".74" stop-color="#050508" stop-opacity=".05"/><stop offset="1" stop-color="#050508" stop-opacity=".98"/></linearGradient><linearGradient id="side"><stop stop-color="#08070D"/><stop offset=".5" stop-color="#08070D"/><stop offset=".75" stop-color="#08070D" stop-opacity=".08"/></linearGradient><linearGradient id="photoFooter" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#08070D" stop-opacity="0"/><stop offset=".65" stop-color="#08070D" stop-opacity=".8"/><stop offset="1" stop-color="#08070D" stop-opacity=".88"/></linearGradient><radialGradient id="halo"><stop stop-color="#754AC9" stop-opacity=".38"/><stop offset="1" stop-color="#754AC9" stop-opacity="0"/></radialGradient></defs><rect width="${w}" height="${h}" fill="#08070D"/>${content}</svg>`;
}
function exportArt(name, w, h, title, content) {
  const svg = frame(w, h, title, content);
  const png = new Resvg(svg, {
    font: { fontFiles: fonts, loadSystemFonts: false, defaultFontFamily: "Inter" },
  })
    .render()
    .asPng();
  for (const ext of ["png", "svg"]) {
    mkdirSync(resolve(output, ext), { recursive: true });
    writeFileSync(resolve(output, ext, `${name}.${ext}`), ext === "png" ? png : svg);
  }
  catalog.push({
    name,
    width: w,
    height: h,
    title,
    bytes: png.length,
    sha256: createHash("sha256").update(png).digest("hex"),
    status:
      "Prepared review candidate; free private testing only, live activation paused; distribution unapproved",
  });
}

// Invalidate the prior batch before replacing any shared output. Failed rerenders
// must not leave a receipt that appears to approve a mixture of revisions.
rmSync(manifestPath, { force: true });

for (const [name, w, h] of [
  ["feed", 1080, 1350],
  ["story", 1080, 1920],
  ["square", 1080, 1080],
  ["wide", 1600, 900],
  ["email", 1200, 600],
]) {
  const tall = h > w;
  const wide = w > h;
  const story = name === "story";
  const m = wide ? 70 : 72;
  const top = story ? 172 : 100;
  let content;
  if (tall) {
    const imageY = 0,
      imageH = h;
    content = `<image href="${photo}" x="0" y="${imageY}" width="${w}" height="${imageH}" preserveAspectRatio="xMidYMid slice"/><rect width="${w}" height="${h}" fill="url(#shade)"/>${logo(m, top, 55)}${lines(["Stay in", "the Work."], m, top + 130, 122)}${text("Bots for calls, texts, and email.", m, top + 315, 31, "#E8E2EF", 500)}`;
    const foot = story ? 1538 : 1122;
    content +=
      cta(m, foot) +
      text("BotBound.app", w - 290, foot + 46, 31, "#F8F7FC", 600) +
      text("Private testing free. Live activation paused.", m, foot + 118, 28, "#D3CBDF", 400);
  } else {
    const size = wide ? (name === "email" ? 72 : 106) : 92;
    const logoY = wide ? 85 : 96;
    const headlineY = wide ? (name === "email" ? 205 : 285) : 230;
    const xPhoto = wide ? w * 0.46 : w * 0.42;
    const photoW = w - xPhoto;
    content = `<image href="${photo}" x="${xPhoto}" width="${photoW}" height="${h}" preserveAspectRatio="xMidYMid slice"/><rect width="${w}" height="${h}" fill="url(#side)"/>${wide ? `<rect y="${h - 140}" width="${w}" height="140" fill="url(#photoFooter)"/>` : ""}${logo(m, logoY, wide ? 48 : 52)}${lines(["Stay in", "the Work."], m, headlineY, size)}${text("Bots for calls, texts,", m, headlineY + size + 72, wide ? 27 : 29, "#D3CBDF", 400)}${text("and email.", m, headlineY + size + 112, wide ? 27 : 29, "#D3CBDF", 400)}`;
    const foot = name === "email" ? 440 : wide ? 675 : 817;
    content +=
      cta(m, foot, name === "email" ? 0.82 : 1) +
      text(
        "Private testing free. Live activation paused.",
        m,
        foot + (name === "email" ? 94 : 119),
        name === "email" ? 22 : 25,
        "#D3CBDF",
        400,
      ) +
      text("BotBound.app", w - 260, h - 40, 27, "#F8F7FC", 600);
  }
  exportArt(`botbound-stay-in-the-work-${name}`, w, h, "Stay in the Work", content);

  const brandY = story ? 175 : wide ? 82 : 102;
  const headlineY = story ? 342 : wide ? (name === "email" ? 200 : 263) : 242;
  const headlineSize = wide ? (name === "email" ? 70 : 104) : 104;
  const opSize = tall ? (story ? 800 : 680) : wide ? h * 0.9 : 650;
  const opX = tall ? (w - opSize) / 2 : wide ? w - opSize - 25 : w - opSize + 35;
  const opY = tall ? (story ? 640 : 476) : wide ? h - opSize : 325;
  let broad = `<ellipse cx="${opX + opSize * 0.5}" cy="${opY + opSize * 0.55}" rx="${opSize * 0.65}" ry="${opSize * 0.6}" fill="url(#halo)"/><image href="${operator}" x="${opX}" y="${opY}" width="${opSize}" height="${opSize}"/>${logo(m, brandY, wide ? 48 : 55)}${lines(["Small Team.", "Bigger Reach."], m, headlineY, headlineSize)}${text("Inbound & Outbound Bots", m, headlineY + headlineSize + 64, wide ? (name === "email" ? 24 : 30) : 31, "#E8E2EF", 600)}`;
  const broadFoot = story ? 1538 : tall ? 1122 : wide ? (name === "email" ? 440 : 675) : 860;
  broad +=
    `<defs><linearGradient id="footer" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#08070D" stop-opacity="0"/><stop offset=".6" stop-color="#08070D" stop-opacity=".95"/><stop offset="1" stop-color="#08070D"/></linearGradient></defs><rect y="${broadFoot - 150}" width="${w}" height="${h - broadFoot + 150}" fill="url(#footer)"/>` +
    cta(m, broadFoot, name === "email" ? 0.82 : 1) +
    text(
      "Private testing free. Live activation paused.",
      m,
      broadFoot + (name === "email" ? 94 : 119),
      name === "email" ? 22 : 28,
      "#D3CBDF",
      400,
    );
  if (tall) broad += text("BotBound.app", w - 290, broadFoot + 46, 31, "#F8F7FC", 600);
  else broad += text("BotBound.app", w - 260, h - 40, 27, "#F8F7FC", 600);
  exportArt(`botbound-small-team-${name}`, w, h, "Small Team. Bigger Reach.", broad);
}
mkdirSync(reviewOutput, { recursive: true });
const thumbW = 360,
  thumbH = 690;
const review = catalog
  .map((item, i) => {
    const x = (i % 5) * thumbW,
      y = Math.floor(i / 5) * thumbH;
    return `<image href="${data(resolve(output, "png", item.name + ".png"))}" x="${x + 12}" y="${y + 35}" width="336" height="605" preserveAspectRatio="xMidYMin meet"/>${text(item.name.replace("botbound-", ""), x + 12, y + 20, 12, "#F8F7FC", 400)}`;
  })
  .join("");
writeFileSync(
  resolve(reviewOutput, "contact-sheet.png"),
  new Resvg(frame(1800, 1380, "Campaign Contact Sheet", review), {
    font: { fontFiles: fonts, loadSystemFonts: false },
  })
    .render()
    .asPng(),
);
const stagedManifestPath = resolve(output, `manifest-${process.pid}.tmp`);
try {
  writeFileSync(
    stagedManifestPath,
    JSON.stringify(
      {
        campaign: "Stay in the Work / Small Team. Bigger Reach.",
        generated: new Date().toISOString(),
        assets: catalog,
      },
      null,
      2,
    ) + "\n",
  );
  renameSync(stagedManifestPath, manifestPath);
} finally {
  rmSync(stagedManifestPath, { force: true });
}
console.log(`Rendered ${catalog.length} PNG and ${catalog.length} editable SVG assets.`);
