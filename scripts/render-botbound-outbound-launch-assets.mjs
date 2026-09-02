import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Resvg } from "@resvg/resvg-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const campaignRoot = resolve(root, "brand-work/launch-2026-09-outbound");
const outputRoot = resolve(campaignRoot, "exports");
const sourceRoot = resolve(campaignRoot, "sources");
const websiteRoot = resolve(outputRoot, "website");
const motionRoot = resolve(outputRoot, "motion");
const manifestPath = resolve(campaignRoot, "manifest.json");
const checksumPath = resolve(campaignRoot, "SHA256SUMS.txt");
const investorPdfPath = resolve(
  outputRoot,
  "investor/botbound-outbound-investor-one-pager-2026-09.pdf",
);
const investorPdfBuilder = resolve(root, "scripts/build-botbound-outbound-investor-pdf.py");
const approvedMotionMasters = [
  "botbound-first-move-15s-vertical-1080x1920.mp4",
  "botbound-first-move-10s-square-1080x1080.mp4",
  "botbound-first-move-6s-vertical-1080x1920.mp4",
].sort();
const fonts = [
  resolve(root, "brand-work/fonts/InterTight-ExtraBold.ttf"),
  resolve(root, "brand-work/fonts/Inter-Regular.ttf"),
  resolve(root, "brand-work/fonts/Inter-SemiBold.ttf"),
  resolve(root, "brand-work/fonts/Inter-Bold.ttf"),
  resolve(root, "brand-work/fonts/Inter-ExtraBold.ttf"),
  resolve(root, "brand-work/fonts/IBMPlexMono-Bold.ttf"),
];

const palette = {
  obsidian: "#050508",
  ink: "#0A0A0E",
  violet: "#A78BFA",
  violetLight: "#C4B5FD",
  platinum: "#F8F7FC",
  mist: "#C9C5D6",
  muted: "#8B8798",
  green: "#5EE6A8",
};

const appIcon = resolve(root, "public/brand/botbound-app-icon.png");
const operator = resolve(root, "public/brand/botbound-operator-polished.png");
const wideSource = resolve(sourceRoot, "botbound-first-move-runway-wide.png");
const portraitSource = resolve(sourceRoot, "botbound-first-move-runway-portrait.png");

function dataUri(filePath) {
  const extension = extname(filePath).toLowerCase();
  const mime = extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${readFileSync(filePath).toString("base64")}`;
}

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function buildInvestorPdf() {
  const bundledPython =
    process.platform === "win32"
      ? resolve(dirname(process.execPath), "../../python/python.exe")
      : resolve(dirname(process.execPath), "../../python/bin/python3");
  const candidates = [
    process.env.BOTBOUND_PYTHON,
    process.env.PYTHON,
    bundledPython,
    "python3",
    "python",
  ].filter((candidate, index, all) => candidate && all.indexOf(candidate) === index);
  const failures = [];

  rmSync(investorPdfPath, { force: true });
  for (const candidate of candidates) {
    const result = spawnSync(candidate, [investorPdfBuilder, "--output", investorPdfPath], {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
    });
    if (result.status === 0 && existsSync(investorPdfPath)) {
      const bytes = readFileSync(investorPdfPath);
      if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-" || bytes.length < 20_000) {
        throw new Error("Investor PDF builder returned an invalid or incomplete document.");
      }
      return investorPdfPath;
    }

    rmSync(investorPdfPath, { force: true });
    failures.push(
      `${candidate}: ${result.error?.message || result.stderr?.trim() || `exit ${result.status}`}`,
    );
  }

  throw new Error(`Unable to build the investor PDF. ${failures.join(" | ")}`);
}

function assertApprovedOutboundMotion() {
  const actualMasters = readdirSync(motionRoot)
    .filter((name) => name.toLowerCase().endsWith(".mp4"))
    .sort();
  if (JSON.stringify(actualMasters) !== JSON.stringify(approvedMotionMasters)) {
    throw new Error(
      `Outbound motion inventory is not the approved 6s/10s/15s set: ${actualMasters.join(", ")}`,
    );
  }

  const metadata = JSON.parse(readFileSync(resolve(motionRoot, "metadata.json"), "utf8"));
  const deliveryByFile = new Map(
    (metadata.deliveries || []).map((delivery) => [String(delivery.file || ""), delivery]),
  );
  const checksumByFile = new Map(
    readFileSync(resolve(motionRoot, "SHA256SUMS.txt"), "utf8")
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^([0-9a-f]{64})\s{2}(.+)$/i);
        if (!match) throw new Error(`Invalid outbound motion checksum entry: ${line}`);
        return [match[2], match[1].toLowerCase()];
      }),
  );
  if (
    deliveryByFile.size !== approvedMotionMasters.length ||
    checksumByFile.size !== approvedMotionMasters.length
  ) {
    throw new Error("Outbound motion approval metadata does not match the exact master set.");
  }
  for (const filename of approvedMotionMasters) {
    const digest = sha256File(resolve(motionRoot, filename));
    const delivery = deliveryByFile.get(filename);
    if (!delivery || delivery.sha256 !== digest || checksumByFile.get(filename) !== digest) {
      throw new Error(`Outbound motion master is not bound to current QA approval: ${filename}`);
    }
  }

  const expectedQaFiles = [
    ...approvedMotionMasters.flatMap((filename) =>
      ["find", "call", "book", "end"].map((position) => `${filename.slice(0, -4)}-${position}.png`),
    ),
    "botbound-first-move-motion-qa-contact-sheet.png",
  ].sort();
  const actualQaFiles = readdirSync(resolve(motionRoot, "qa")).sort();
  if (JSON.stringify(actualQaFiles) !== JSON.stringify(expectedQaFiles)) {
    throw new Error("Outbound motion QA frame inventory is stale or incomplete.");
  }
}

function writePng(relativePath, svg, width) {
  const destination = resolve(outputRoot, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  const image = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: { fontFiles: fonts, loadSystemFonts: false, defaultFontFamily: "Inter" },
  })
    .render()
    .asPng();
  writeFileSync(destination, image);
  console.log(`Created ${relativePath} (${image.length} bytes)`);
  return destination;
}

function svgFrame({ width, height, title, description, content, defs = "" }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${esc(title)}</title>
  <desc id="desc">${esc(description)}</desc>
  <defs>${baseDefs()}${defs}</defs>
  ${content}
</svg>`;
}

function baseDefs() {
  return `<linearGradient id="canvas" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#171022"/><stop offset=".42" stop-color="#0A0A0E"/><stop offset="1" stop-color="#050508"/>
    </linearGradient>
    <radialGradient id="aura" cx="76%" cy="46%" r="62%">
      <stop stop-color="#8B5CF6" stop-opacity=".34"/><stop offset=".55" stop-color="#8B5CF6" stop-opacity=".08"/><stop offset="1" stop-color="#8B5CF6" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="leftShade" x1="0" y1="0" x2="1" y2="0">
      <stop stop-color="#050508" stop-opacity="1"/><stop offset=".48" stop-color="#050508" stop-opacity=".91"/><stop offset=".8" stop-color="#050508" stop-opacity=".18"/><stop offset="1" stop-color="#050508" stop-opacity=".04"/>
    </linearGradient>
    <linearGradient id="verticalShade" x1="0" y1="0" x2="0" y2="1">
      <stop stop-color="#050508" stop-opacity=".95"/><stop offset=".42" stop-color="#050508" stop-opacity=".58"/><stop offset=".76" stop-color="#050508" stop-opacity=".12"/><stop offset="1" stop-color="#050508" stop-opacity=".94"/>
    </linearGradient>
    <linearGradient id="violetLine" x1="0" y1="0" x2="1" y2="0">
      <stop stop-color="#6D52B5"/><stop offset=".62" stop-color="#A78BFA"/><stop offset="1" stop-color="#F8F7FC"/>
    </linearGradient>
    <filter id="glow" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="18" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="softGlow" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="8" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <pattern id="grid" width="64" height="64" patternUnits="userSpaceOnUse">
      <path d="M64 0H0V64" fill="none" stroke="#C4B5FD" stroke-opacity=".045" stroke-width="1"/>
    </pattern>`;
}

function wordmark(x, y, size, color = palette.platinum) {
  return `<text x="${x}" y="${y}" fill="${color}" font-family="Inter Tight" font-size="${size}" font-weight="800" letter-spacing="${-size * 0.047}">Bot<tspan fill="${palette.violet}">Bound</tspan></text>`;
}

function brandLockup(x, y, size, iconData, dark = true) {
  return `<image href="${iconData}" x="${x}" y="${y}" width="${size}" height="${size}"/>
    ${wordmark(x + size * 1.17, y + size * 0.68, size * 0.55, dark ? palette.platinum : palette.ink)}`;
}

function eyebrow(text, x, y, size = 22, color = palette.violetLight) {
  return `<text x="${x}" y="${y}" fill="${color}" font-family="IBM Plex Mono" font-size="${size}" font-weight="700" letter-spacing="${size * 0.18}">${esc(text)}</text>`;
}

function ctaPill(text, x, y, width, height, fontSize = 22) {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${height / 2}" fill="${palette.violet}"/>
    <text x="${x + width / 2}" y="${y + height / 2 + fontSize * 0.36}" text-anchor="middle" fill="${palette.ink}" font-family="Inter" font-size="${fontSize}" font-weight="800" letter-spacing="${fontSize * 0.04}">${esc(text)}</text>`;
}

function seededNodes(width, height, count = 88, seed = 17) {
  let state = seed >>> 0;
  const rand = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const nodes = [];
  for (let index = 0; index < count; index += 1) {
    const x = width * (0.08 + rand() * 0.86);
    const y = height * (0.1 + rand() * 0.8);
    const r = 2 + rand() * 6;
    const hot = rand() > 0.86;
    nodes.push(
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(hot ? r * 1.5 : r).toFixed(1)}" fill="${hot ? palette.violetLight : palette.platinum}" opacity="${hot ? 0.82 : 0.18}"${hot ? ' filter="url(#softGlow)"' : ""}/>`,
    );
  }
  return nodes.join("");
}

function signalPath(width, height, { vertical = false } = {}) {
  if (vertical) {
    return `<path d="M${width * 0.84} ${height * 0.92} C${width * 0.74} ${height * 0.8}, ${width * 0.78} ${height * 0.72}, ${width * 0.62} ${height * 0.64} S${width * 0.3} ${height * 0.5}, ${width * 0.44} ${height * 0.36} S${width * 0.68} ${height * 0.25}, ${width * 0.54} ${height * 0.12}" fill="none" stroke="url(#violetLine)" stroke-width="10" stroke-linecap="round" filter="url(#glow)" opacity=".9"/>
      <circle cx="${width * 0.84}" cy="${height * 0.92}" r="18" fill="${palette.violet}" filter="url(#glow)"/>
      <circle cx="${width * 0.54}" cy="${height * 0.12}" r="14" fill="${palette.platinum}" filter="url(#glow)"/>`;
  }
  return `<path d="M${width * 0.54} ${height * 0.7} C${width * 0.63} ${height * 0.58}, ${width * 0.69} ${height * 0.66}, ${width * 0.75} ${height * 0.48} S${width * 0.87} ${height * 0.36}, ${width * 0.95} ${height * 0.24}" fill="none" stroke="url(#violetLine)" stroke-width="10" stroke-linecap="round" filter="url(#glow)" opacity=".92"/>
    <circle cx="${width * 0.54}" cy="${height * 0.7}" r="18" fill="${palette.violet}" filter="url(#glow)"/>
    <circle cx="${width * 0.95}" cy="${height * 0.24}" r="14" fill="${palette.platinum}" filter="url(#glow)"/>`;
}

const iconData = dataUri(appIcon);
const operatorData = dataUri(operator);
const wideData = existsSync(wideSource) ? dataUri(wideSource) : null;
const portraitData = existsSync(portraitSource) ? dataUri(portraitSource) : null;

function atmosphericBackground(width, height, sourceData, { vertical = false, shade = true } = {}) {
  return `${sourceData ? `<image href="${sourceData}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>` : `<rect width="${width}" height="${height}" fill="url(#canvas)"/><rect width="${width}" height="${height}" fill="url(#aura)"/>${seededNodes(width, height, vertical ? 110 : 100, vertical ? 31 : 17)}${signalPath(width, height, { vertical })}`}
    <rect width="${width}" height="${height}" fill="url(#grid)"/>
    ${shade ? `<rect width="${width}" height="${height}" fill="${vertical ? "url(#verticalShade)" : "url(#leftShade)"}"/>` : ""}`;
}

const generated = [];
// Invalidate the prior approval pair before deleting or replacing any release
// asset. A failed render must leave no stale manifest claiming success.
rmSync(manifestPath, { force: true });
rmSync(checksumPath, { force: true });
assertApprovedOutboundMotion();
const rendererOwnedDirectories = [
  "hero",
  "social",
  "roles",
  "carousel",
  "workflow",
  "email",
  "investor",
  "website",
  "contact-sheet",
].map((name) => resolve(outputRoot, name));
for (const directory of rendererOwnedDirectories) {
  const ownedRelativePath = relative(outputRoot, directory);
  if (!ownedRelativePath || ownedRelativePath.startsWith("..")) {
    throw new Error(
      `Refusing to clean an output path outside the campaign export root: ${directory}`,
    );
  }
  rmSync(directory, { recursive: true, force: true });
}

const render = (path, options, width) => {
  generated.push(writePng(path, svgFrame(options), width));
};

render(
  "hero/botbound-first-move-ooh-3840x2160.png",
  {
    width: 3840,
    height: 2160,
    title: "Finds the lead. Makes the call. Books the next step.",
    description: "BotBound outbound launch master for The First Move campaign.",
    content: `${atmosphericBackground(3840, 2160, wideData)}
      ${brandLockup(210, 160, 148, iconData)}
      ${eyebrow("THE FIRST MOVE", 210, 610, 52)}
      <text x="190" y="910" fill="${palette.platinum}" font-family="Inter Tight" font-size="252" font-weight="800" letter-spacing="-13">
        <tspan x="190">FINDS THE LEAD.</tspan><tspan x="190" dy="250">MAKES THE CALL.</tspan><tspan x="190" dy="250" fill="${palette.violet}">BOOKS THE NEXT STEP.</tspan>
      </text>
      <text x="210" y="1870" fill="${palette.platinum}" font-family="IBM Plex Mono" font-size="58" font-weight="700" letter-spacing="9">BOTBOUND.ME</text>
      <text x="210" y="1990" fill="${palette.mist}" font-family="Inter" font-size="52" font-weight="600">GET YOUR SALES BOT</text>
      <rect x="210" y="2050" width="3300" height="8" rx="4" fill="${palette.violet}" opacity=".86"/>`,
  },
  3840,
);

render(
  "hero/botbound-first-move-operator-1920x1080.png",
  {
    width: 1920,
    height: 1080,
    title: "Find. Call. Book.",
    description: "BotBound operator hero for the outbound launch campaign.",
    content: `${atmosphericBackground(1920, 1080, wideData)}
      <ellipse cx="1510" cy="982" rx="500" ry="92" fill="#050508" opacity=".7"/>
      <circle cx="1510" cy="570" r="480" fill="${palette.violet}" opacity=".09" filter="url(#glow)"/>
      <image href="${operatorData}" x="1080" y="130" width="820" height="820" preserveAspectRatio="xMidYMid meet"/>
      ${brandLockup(88, 68, 84, iconData)}
      ${eyebrow("OUTBOUND HAS A BOT", 90, 286, 20)}
      <text x="82" y="448" fill="${palette.platinum}" font-family="Inter Tight" font-size="142" font-weight="800" letter-spacing="-7.4">
        <tspan x="82">FIND.</tspan><tspan x="82" dy="138">CALL.</tspan><tspan x="82" dy="138" fill="${palette.violet}">BOOK.</tspan>
      </text>
      ${ctaPill("GET YOUR SALES BOT", 90, 894, 360, 74, 20)}
      <text x="90" y="1020" fill="${palette.platinum}" font-family="IBM Plex Mono" font-size="18" font-weight="700" letter-spacing="2.6">BOTBOUND.ME</text>`,
  },
  1920,
);

render(
  "social/botbound-first-move-linkedin-1200x627.png",
  {
    width: 1200,
    height: 627,
    title: "Find. Call. Book.",
    description: "LinkedIn launch ad for BotBound outbound Bots.",
    content: `${atmosphericBackground(1200, 627, wideData)}
      ${wordmark(58, 66, 42)}
      ${eyebrow("THE FIRST MOVE", 60, 145, 15)}
      <text x="56" y="259" fill="${palette.platinum}" font-family="Inter Tight" font-size="86" font-weight="800" letter-spacing="-4.6">
        <tspan x="56">FIND.</tspan><tspan x="56" dy="86">CALL.</tspan><tspan x="56" dy="86" fill="${palette.violet}">BOOK.</tspan>
      </text>
      ${ctaPill("GET YOUR SALES BOT", 60, 518, 292, 58, 17)}
      <text x="1138" y="572" text-anchor="end" fill="${palette.platinum}" font-family="IBM Plex Mono" font-size="18" font-weight="700" letter-spacing="2.4">BOTBOUND.ME</text>`,
  },
  1200,
);

render(
  "social/botbound-list-wont-call-itself-1080x1080.png",
  {
    width: 1080,
    height: 1080,
    title: "The list will not call itself.",
    description: "Square BotBound outbound campaign ad.",
    content: `${atmosphericBackground(1080, 1080, portraitData, { vertical: true })}
      ${brandLockup(62, 54, 68, iconData)}
      ${eyebrow("OUTBOUND HAS A BOT", 62, 240, 19)}
      <text x="54" y="386" fill="${palette.platinum}" font-family="Inter Tight" font-size="112" font-weight="800" letter-spacing="-6">
        <tspan x="54">THE LIST</tspan><tspan x="54" dy="110">WON'T CALL</tspan><tspan x="54" dy="110" fill="${palette.violet}">ITSELF.</tspan>
      </text>
      <text x="62" y="868" fill="${palette.platinum}" font-family="Inter Tight" font-size="42" font-weight="800">YOUR BOT CAN.</text>
      ${ctaPill("GET YOUR SALES BOT", 62, 924, 344, 70, 20)}
      <text x="1016" y="982" text-anchor="end" fill="${palette.platinum}" font-family="IBM Plex Mono" font-size="17" font-weight="700" letter-spacing="2.4">BOTBOUND.ME</text>`,
  },
  1080,
);

render(
  "social/botbound-find-call-book-story-1080x1920.png",
  {
    width: 1080,
    height: 1920,
    title: "Find. Call. Book.",
    description: "Vertical BotBound outbound story master.",
    content: `${atmosphericBackground(1080, 1920, portraitData, { vertical: true })}
      ${brandLockup(68, 72, 76, iconData)}
      ${eyebrow("THE FIRST MOVE", 68, 326, 20)}
      <text x="58" y="520" fill="${palette.platinum}" font-family="Inter Tight" font-size="160" font-weight="800" letter-spacing="-8">
        <tspan x="58">FIND.</tspan><tspan x="58" dy="158">CALL.</tspan><tspan x="58" dy="158" fill="${palette.violet}">BOOK.</tspan>
      </text>
      <rect x="66" y="1408" width="948" height="3" fill="${palette.violet}" opacity=".72"/>
      <text x="66" y="1500" fill="${palette.platinum}" font-family="Inter Tight" font-size="52" font-weight="800">YOUR BOT MAKES THE FIRST MOVE.</text>
      ${ctaPill("GET YOUR SALES BOT", 66, 1566, 402, 82, 23)}
      <text x="1014" y="1634" text-anchor="end" fill="${palette.platinum}" font-family="IBM Plex Mono" font-size="19" font-weight="700" letter-spacing="2.8">BOTBOUND.ME</text>`,
  },
  1080,
);

render(
  "social/botbound-get-your-sales-bot-1080x1350.png",
  {
    width: 1080,
    height: 1350,
    title: "Find. Call. Book.",
    description: "BotBound operator social ad for outbound Sales Bots.",
    content: `${atmosphericBackground(1080, 1350, portraitData, { vertical: true })}
      ${brandLockup(62, 54, 66, iconData)}
      ${eyebrow("THE FIRST MOVE", 62, 252, 19)}
      <text x="54" y="400" fill="${palette.platinum}" font-family="Inter Tight" font-size="112" font-weight="800" letter-spacing="-6">
        <tspan x="54">FIND.</tspan><tspan x="54" dy="108">CALL.</tspan><tspan x="54" dy="108" fill="${palette.violet}">BOOK.</tspan>
      </text>
      <circle cx="782" cy="900" r="318" fill="${palette.violet}" opacity=".11" filter="url(#glow)"/>
      <image href="${operatorData}" x="430" y="570" width="660" height="660" preserveAspectRatio="xMidYMid meet"/>
      ${ctaPill("GET YOUR SALES BOT", 62, 1192, 354, 72, 19)}
      <text x="1018" y="1249" text-anchor="end" fill="${palette.platinum}" font-family="IBM Plex Mono" font-size="17" font-weight="700" letter-spacing="2.4">BOTBOUND.ME</text>`,
  },
  1080,
);

render(
  "social/botbound-point-it-at-a-market-1080x1350.png",
  {
    width: 1080,
    height: 1350,
    title: "Point it at a market. It finds. Calls. Books.",
    description:
      "BotBound outbound Sales Bot launch ad showing a configured target moving toward a booked meeting.",
    defs: `<linearGradient id="launchBand" x1="0" y1="0" x2="1" y2="0">
        <stop stop-color="#A78BFA"/><stop offset=".56" stop-color="#7C5CE4"/><stop offset="1" stop-color="#4C3492"/>
      </linearGradient>
      <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
        <stop stop-color="#24202E" stop-opacity=".96"/><stop offset="1" stop-color="#0D0B12" stop-opacity=".84"/>
      </linearGradient>
      <filter id="cardShadow" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="18" stdDeviation="24" flood-color="#050508" flood-opacity=".72"/>
      </filter>`,
    content: `${atmosphericBackground(1080, 1350, portraitData, { vertical: true, shade: false })}
      <rect width="1080" height="1350" fill="#050508" opacity=".54"/>
      <rect width="1080" height="1350" fill="url(#verticalShade)" opacity=".84"/>
      ${brandLockup(62, 54, 66, iconData)}
      <text x="1018" y="94" text-anchor="end" fill="${palette.muted}" font-family="IBM Plex Mono" font-size="17" font-weight="700" letter-spacing="2.8">LAUNCH MASTER / 01</text>
      ${eyebrow("AUTONOMOUS OUTBOUND", 62, 246, 19)}
      <text x="54" y="390" fill="${palette.platinum}" font-family="Inter Tight" font-size="118" font-weight="800" letter-spacing="-6.2">
        <tspan x="54">POINT IT</tspan><tspan x="54" dy="112" fill="${palette.violet}">AT A MARKET.</tspan>
      </text>

      <circle cx="790" cy="784" r="338" fill="${palette.violet}" opacity=".12" filter="url(#glow)"/>
      <circle cx="790" cy="784" r="278" fill="none" stroke="${palette.violetLight}" stroke-opacity=".16" stroke-width="2"/>
      <circle cx="790" cy="784" r="216" fill="none" stroke="${palette.violetLight}" stroke-opacity=".12" stroke-width="2"/>
      <image href="${operatorData}" x="438" y="512" width="650" height="650" preserveAspectRatio="xMidYMid meet"/>

      <g transform="translate(62 638)" filter="url(#cardShadow)">
        <rect width="390" height="150" rx="28" fill="url(#glass)" stroke="${palette.violetLight}" stroke-opacity=".28" stroke-width="2"/>
        <circle cx="36" cy="38" r="8" fill="${palette.violet}" filter="url(#softGlow)"/>
        <text x="58" y="45" fill="${palette.muted}" font-family="IBM Plex Mono" font-size="15" font-weight="700" letter-spacing="2.1">TARGET</text>
        <text x="30" y="105" fill="${palette.platinum}" font-family="Inter Tight" font-size="39" font-weight="800">YOUR MARKET</text>
        <text x="30" y="132" fill="${palette.mist}" font-family="Inter" font-size="15" font-weight="600">ROLE · REGION · COMPANY</text>
      </g>
      <path d="M452 713C532 713 536 860 594 860" fill="none" stroke="${palette.violet}" stroke-width="5" stroke-linecap="round" stroke-dasharray="3 16" opacity=".9" filter="url(#softGlow)"/>
      <circle cx="594" cy="860" r="9" fill="${palette.platinum}" filter="url(#softGlow)"/>
      <g transform="translate(570 900)" filter="url(#cardShadow)">
        <rect width="448" height="154" rx="28" fill="url(#glass)" stroke="${palette.violet}" stroke-opacity=".62" stroke-width="2"/>
        <rect x="24" y="24" width="104" height="30" rx="15" fill="${palette.green}" fill-opacity=".13"/>
        <text x="76" y="45" text-anchor="middle" fill="${palette.green}" font-family="IBM Plex Mono" font-size="12" font-weight="700" letter-spacing="1.4">BOOKED</text>
        <text x="24" y="101" fill="${palette.platinum}" font-family="Inter Tight" font-size="39" font-weight="800">NEXT STEP</text>
        <text x="24" y="130" fill="${palette.mist}" font-family="Inter" font-size="15" font-weight="600">CALENDAR · CRM · HANDOFF</text>
      </g>

      <rect x="0" y="1086" width="1080" height="264" fill="${palette.ink}" opacity=".96"/>
      <rect x="0" y="1086" width="1080" height="8" fill="url(#launchBand)"/>
      <text x="62" y="1168" fill="${palette.platinum}" font-family="Inter Tight" font-size="53" font-weight="800" letter-spacing="-2.2">IT FINDS. CALLS. <tspan fill="${palette.violet}">BOOKS.</tspan></text>
      ${ctaPill("GET YOUR SALES BOT", 62, 1214, 354, 72, 19)}
      <text x="1018" y="1262" text-anchor="end" fill="${palette.platinum}" font-family="IBM Plex Mono" font-size="17" font-weight="700" letter-spacing="2.4">BOTBOUND.ME</text>`,
  },
  1080,
);

const roles = [
  {
    slug: "sales",
    label: "SALES BOT",
    lines: ["FINDS LEADS.", "BOOKS MEETINGS."],
    cta: "GET YOUR SALES BOT",
    code: "01",
  },
  {
    slug: "recruiting",
    label: "RECRUITING BOT",
    lines: ["WORKS THE LIST.", "BOOKS INTERVIEWS."],
    cta: "GET YOUR RECRUITING BOT",
    code: "02",
  },
  {
    slug: "appointments",
    label: "APPOINTMENT BOT",
    lines: ["CALLS THE WAITLIST.", "BOOKS THE OPENING."],
    cta: "GET YOUR APPOINTMENT BOT",
    code: "03",
  },
  {
    slug: "reactivation",
    label: "WIN-BACK BOT",
    lines: ["OLD LEAD.", "NEW CONVERSATION."],
    cta: "GET YOUR WIN-BACK BOT",
    code: "04",
  },
  {
    slug: "debt-resolution-intake",
    label: "INTAKE BOT",
    lines: ["WORKS THE LIST.", "BOOKS CONSULTATIONS."],
    cta: "GET YOUR INTAKE BOT",
    code: "05",
  },
];

function roleOutcomeScene(index) {
  const panel = `<rect x="0" y="0" width="880" height="300" rx="34" fill="#0E0D14" fill-opacity=".86" stroke="#C4B5FD" stroke-opacity=".2" stroke-width="2"/>
    <rect x="26" y="26" width="828" height="248" rx="24" fill="#14121B" fill-opacity=".72"/>
    <circle cx="58" cy="58" r="7" fill="${palette.violet}" filter="url(#softGlow)"/>
    <text x="82" y="65" fill="${palette.muted}" font-family="IBM Plex Mono" font-size="15" font-weight="700" letter-spacing="2.4">OUTBOUND SIGNAL</text>`;

  if (index === 0) {
    return `<g transform="translate(100 742)">${panel}
      <path d="M72 144H328" stroke="#6A6475" stroke-width="4" stroke-linecap="round"/>
      <circle cx="92" cy="144" r="14" fill="${palette.violet}" filter="url(#softGlow)"/>
      <circle cx="194" cy="144" r="10" fill="${palette.violetLight}" opacity=".7"/>
      <circle cx="304" cy="144" r="10" fill="${palette.platinum}" opacity=".8"/>
      <path d="M328 144H414" stroke="${palette.violet}" stroke-width="4"/>
      <path d="M398 132L414 144L398 156" fill="none" stroke="${palette.violet}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="454" y="100" width="336" height="110" rx="22" fill="#201A31" stroke="${palette.violet}" stroke-opacity=".6"/>
      <text x="486" y="142" fill="${palette.muted}" font-family="IBM Plex Mono" font-size="14" font-weight="700" letter-spacing="1.8">NEXT STEP</text>
      <text x="486" y="183" fill="${palette.platinum}" font-family="Inter Tight" font-size="31" font-weight="800">MEETING BOOKED</text>
    </g>`;
  }

  if (index === 1) {
    return `<g transform="translate(100 742)">${panel}
      ${[0, 1, 2].map((row) => `<circle cx="88" cy="${126 + row * 55}" r="17" fill="${row === 1 ? palette.violet : "#292633"}"/><rect x="124" y="${113 + row * 55}" width="250" height="10" rx="5" fill="${row === 1 ? palette.violetLight : "#575161"}" opacity="${row === 1 ? ".88" : ".55"}"/><rect x="124" y="${132 + row * 55}" width="166" height="7" rx="3.5" fill="#575161" opacity=".36"/>`).join("")}
      <path d="M406 164H478" stroke="${palette.violet}" stroke-width="4"/><path d="M462 152L478 164L462 176" fill="none" stroke="${palette.violet}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="516" y="105" width="286" height="118" rx="22" fill="#201A31" stroke="${palette.violet}" stroke-opacity=".6"/>
      <text x="548" y="147" fill="${palette.muted}" font-family="IBM Plex Mono" font-size="14" font-weight="700" letter-spacing="1.8">INTERVIEW</text>
      <text x="548" y="190" fill="${palette.platinum}" font-family="Inter Tight" font-size="34" font-weight="800">BOOKED</text>
    </g>`;
  }

  if (index === 2) {
    const cells = Array.from({ length: 15 }, (_, cell) => {
      const x = 78 + (cell % 5) * 86;
      const y = 112 + Math.floor(cell / 5) * 55;
      const filled = [2, 6, 9, 13].includes(cell);
      return `<rect x="${x}" y="${y}" width="62" height="34" rx="10" fill="${filled ? palette.violet : "#292633"}" opacity="${filled ? ".92" : ".7"}"/>`;
    }).join("");
    return `<g transform="translate(100 742)">${panel}${cells}
      <rect x="586" y="105" width="214" height="118" rx="22" fill="#201A31" stroke="${palette.violet}" stroke-opacity=".6"/>
      <text x="618" y="147" fill="${palette.muted}" font-family="IBM Plex Mono" font-size="14" font-weight="700" letter-spacing="1.8">OPENING</text>
      <text x="618" y="190" fill="${palette.platinum}" font-family="Inter Tight" font-size="34" font-weight="800">BOOKED</text>
    </g>`;
  }

  if (index === 3) {
    const dormant = Array.from(
      { length: 10 },
      (_, dot) =>
        `<circle cx="${78 + dot * 45}" cy="164" r="${dot === 7 ? 16 : 9}" fill="${dot === 7 ? palette.violet : "#514C59"}" opacity="${dot === 7 ? "1" : ".45"}"${dot === 7 ? ' filter="url(#softGlow)"' : ""}/>`,
    ).join("");
    return `<g transform="translate(100 742)">${panel}${dormant}
      <path d="M548 164H610" stroke="${palette.violet}" stroke-width="4"/><path d="M594 152L610 164L594 176" fill="none" stroke="${palette.violet}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="646" y="105" width="156" height="118" rx="22" fill="#201A31" stroke="${palette.violet}" stroke-opacity=".6"/>
      <text x="678" y="147" fill="${palette.muted}" font-family="IBM Plex Mono" font-size="14" font-weight="700" letter-spacing="1.8">LEAD</text>
      <text x="678" y="190" fill="${palette.platinum}" font-family="Inter Tight" font-size="28" font-weight="800">ACTIVE</text>
    </g>`;
  }

  return `<g transform="translate(100 742)">${panel}
    ${[0, 1, 2].map((row) => `<rect x="78" y="${112 + row * 58}" width="34" height="34" rx="9" fill="${row === 2 ? palette.violet : "#292633"}"/><path d="M87 ${127 + row * 58}l7 7 13-16" fill="none" stroke="${row === 2 ? palette.ink : palette.violetLight}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><rect x="138" y="${122 + row * 58}" width="250" height="10" rx="5" fill="#575161" opacity="${row === 2 ? ".8" : ".46"}"/>`).join("")}
    <path d="M426 164H496" stroke="${palette.violet}" stroke-width="4"/><path d="M480 152L496 164L480 176" fill="none" stroke="${palette.violet}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="532" y="105" width="270" height="118" rx="22" fill="#201A31" stroke="${palette.violet}" stroke-opacity=".6"/>
    <text x="564" y="147" fill="${palette.muted}" font-family="IBM Plex Mono" font-size="14" font-weight="700" letter-spacing="1.8">CONSULTATION</text>
    <text x="564" y="190" fill="${palette.platinum}" font-family="Inter Tight" font-size="32" font-weight="800">BOOKED</text>
  </g>`;
}

for (const [index, role] of roles.entries()) {
  const roleFontSize = Math.max(...role.lines.map((line) => line.length)) > 16 ? 86 : 112;
  render(
    `roles/botbound-${role.slug}-bot-1080x1350.png`,
    {
      width: 1080,
      height: 1350,
      title: `${role.label}: ${role.lines.join(" ")}`,
      description: `Outbound campaign ad for the BotBound ${role.label.toLowerCase()}.`,
      content: `${atmosphericBackground(1080, 1350, portraitData, { vertical: true })}
        ${brandLockup(62, 54, 66, iconData)}
        <text x="1018" y="94" text-anchor="end" fill="${palette.muted}" font-family="IBM Plex Mono" font-size="17" font-weight="700" letter-spacing="2.8">${role.code} / 05</text>
        ${eyebrow(role.label, 62, 284, 20)}
        <text x="54" y="450" fill="${palette.platinum}" font-family="Inter Tight" font-size="${roleFontSize}" font-weight="800" letter-spacing="${-roleFontSize * 0.052}">
          <tspan x="54">${esc(role.lines[0])}</tspan><tspan x="54" dy="${roleFontSize + 10}" fill="${palette.violet}">${esc(role.lines[1])}</tspan>
        </text>
        ${roleOutcomeScene(index)}
        <rect x="62" y="1120" width="956" height="2" fill="${palette.violet}" opacity=".54"/>
        ${ctaPill(role.cta, 62, 1172, role.cta.length > 22 ? 420 : 360, 72, 19)}
        <text x="1018" y="1230" text-anchor="end" fill="${palette.platinum}" font-family="IBM Plex Mono" font-size="17" font-weight="700" letter-spacing="2.4">BOTBOUND.ME</text>`,
    },
    1080,
  );
}

const carousel = [
  {
    title: ["FIND.", "CALL.", "BOOK."],
    label: "THE FIRST MOVE",
    note: "LEAD HUNT + OUTBOUND BOT",
    accent: 2,
  },
  {
    title: ["DEFINE", "THE TARGET."],
    label: "01 / TARGET",
    note: "ROLE · REGION · COMPANY SIZE",
    accent: 1,
  },
  {
    title: ["LEAD HUNT FINDS", "THE PROSPECTS."],
    label: "02 / FIND",
    note: "CONNECTED PROSPECT INTELLIGENCE",
    accent: 1,
  },
  {
    title: ["REVIEW.", "THEN QUEUE."],
    label: "03 / APPROVE",
    note: "SELECTED CONTACTS · APPROVED CAMPAIGN",
    accent: 1,
  },
  {
    title: ["YOUR BOT CALLS.", "YOU TAKE MEETINGS."],
    label: "04 / CALL + BOOK",
    note: "YOUR PLAYBOOK · CALENDAR · OUTCOME",
    accent: 1,
    fontSize: 94,
    lineHeight: 100,
  },
];

for (const [index, slide] of carousel.entries()) {
  const titleFontSize = slide.fontSize ?? 112;
  const titleLineHeight = slide.lineHeight ?? 112;
  const titleLines = slide.title
    .map(
      (line, lineIndex) =>
        `<tspan x="54" dy="${lineIndex === 0 ? 0 : titleLineHeight}" fill="${lineIndex === slide.accent ? palette.violet : palette.platinum}">${esc(line)}</tspan>`,
    )
    .join("");
  render(
    `carousel/botbound-lead-hunt-${String(index + 1).padStart(2, "0")}-1080x1350.png`,
    {
      width: 1080,
      height: 1350,
      title: slide.title.join(" "),
      description: `Slide ${index + 1} of BotBound's Lead Hunt carousel.`,
      content: `<rect width="1080" height="1350" fill="url(#canvas)"/><rect width="1080" height="1350" fill="url(#aura)"/><rect width="1080" height="1350" fill="url(#grid)"/>
        ${brandLockup(62, 54, 66, iconData)}
        <text x="1018" y="94" text-anchor="end" fill="${palette.muted}" font-family="IBM Plex Mono" font-size="17" font-weight="700" letter-spacing="2.8">${String(index + 1).padStart(2, "0")} / 05</text>
        ${eyebrow(slide.label, 62, 300, 20)}
        <text x="54" y="474" fill="${palette.platinum}" font-family="Inter Tight" font-size="${titleFontSize}" font-weight="800" letter-spacing="${slide.fontSize ? -5.1 : -6}">${titleLines}</text>
        <g transform="translate(330 760)">${seededNodes(700, 340, 58, 77 + index * 19)}${signalPath(700, 340)}</g>
        <text x="62" y="1220" fill="${palette.mist}" font-family="IBM Plex Mono" font-size="18" font-weight="700" letter-spacing="2.4">${esc(slide.note)}</text>
        <rect x="62" y="1260" width="956" height="4" fill="${palette.violet}" opacity=".72"/>
        <text x="62" y="1308" fill="${palette.platinum}" font-family="IBM Plex Mono" font-size="16" font-weight="700" letter-spacing="2.2">BOTBOUND.ME</text>`,
    },
    1080,
  );
}

const workflowPhases = [
  ["TARGET", "FIND"],
  ["REVIEW", "QUEUE"],
  ["CALL", "QUALIFY"],
  ["BOOK", "REPORT"],
];
const workflowNodes = workflowPhases
  .map(([first, second], index) => {
    const x = 60 + index * 282;
    const active = index === workflowPhases.length - 1;
    return `${index > 0 ? `<path d="M${x - 34} 365H${x - 10}" stroke="${palette.violet}" stroke-width="4" stroke-linecap="round" opacity=".8"/><path d="M${x - 20} 356L${x - 8} 365L${x - 20} 374" fill="none" stroke="${palette.violet}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>` : ""}
      <rect x="${x}" y="292" width="248" height="148" rx="24" fill="${active ? "#201A31" : "#111017"}" stroke="${active ? palette.violet : palette.violetLight}" stroke-opacity="${active ? ".9" : ".3"}" stroke-width="2"/>
      <text x="${x + 24}" y="330" fill="${active ? palette.violetLight : palette.muted}" font-family="IBM Plex Mono" font-size="13" font-weight="700" letter-spacing="1.8">0${index + 1}</text>
      <text x="${x + 24}" y="374" fill="${palette.platinum}" font-family="Inter Tight" font-size="25" font-weight="800">${first}</text>
      <text x="${x + 24}" y="410" fill="${active ? palette.violetLight : palette.platinum}" font-family="Inter Tight" font-size="25" font-weight="800">${second}</text>`;
  })
  .join("");

render(
  "workflow/botbound-outbound-workflow-1200x627.png",
  {
    width: 1200,
    height: 627,
    title: "Target, find, review, queue, call, qualify, book, report.",
    description: "Configured example of the BotBound outbound operating path.",
    content: `<rect width="1200" height="627" fill="url(#canvas)"/><rect width="1200" height="627" fill="url(#aura)"/><rect width="1200" height="627" fill="url(#grid)"/>
      ${wordmark(58, 64, 42)}
      ${eyebrow("CONFIGURED EXAMPLE", 60, 136, 14)}
      <text x="58" y="228" fill="${palette.platinum}" font-family="Inter Tight" font-size="62" font-weight="800" letter-spacing="-3">FROM TARGET TO <tspan fill="${palette.violet}">OUTCOME.</tspan></text>
      ${workflowNodes}
      <text x="60" y="556" fill="${palette.mist}" font-family="Inter" font-size="17" font-weight="600">Connected source. Selected contacts. Approved queue. Recorded outcome.</text>
      <text x="1140" y="556" text-anchor="end" fill="${palette.platinum}" font-family="IBM Plex Mono" font-size="16" font-weight="700" letter-spacing="2">BOTBOUND.ME</text>`,
  },
  1200,
);

const outcomeRows = [
  ["09:03", "CALLING LIST", "APPROVED"],
  ["09:06", "PROSPECT", "CALLED"],
  ["09:10", "FIT", "QUALIFIED"],
  ["09:14", "NEXT STEP", "BOOKED"],
  ["09:16", "OUTCOME", "REPORTED"],
];
const rows = outcomeRows
  .map(([time, item, result], index) => {
    const y = 396 + index * 108;
    return `<rect x="62" y="${y}" width="956" height="86" rx="18" fill="rgba(255,255,255,.045)" stroke="rgba(196,181,253,.14)"/>
      <text x="92" y="${y + 53}" fill="${palette.muted}" font-family="IBM Plex Mono" font-size="17" font-weight="700">${time}</text>
      <text x="250" y="${y + 54}" fill="${palette.platinum}" font-family="Inter Tight" font-size="28" font-weight="800">${item}</text>
      <text x="982" y="${y + 54}" text-anchor="end" fill="${index === 3 ? palette.green : palette.violetLight}" font-family="IBM Plex Mono" font-size="18" font-weight="700" letter-spacing="1.8">${result}</text>`;
  })
  .join("");

render(
  "social/botbound-outbound-call-sheet-1080x1080.png",
  {
    width: 1080,
    height: 1080,
    title: "The queue moved.",
    description: "Outbound outcome sheet for a BotBound campaign example.",
    content: `<rect width="1080" height="1080" fill="url(#canvas)"/><rect width="1080" height="1080" fill="url(#aura)"/><rect width="1080" height="1080" fill="url(#grid)"/>
      ${brandLockup(62, 54, 68, iconData)}
      ${eyebrow("THE OUTBOUND CALL SHEET", 62, 236, 18)}
      <text x="56" y="334" fill="${palette.platinum}" font-family="Inter Tight" font-size="82" font-weight="800" letter-spacing="-4.2">THE QUEUE <tspan fill="${palette.violet}">MOVED.</tspan></text>
      ${rows}
      <text x="62" y="1018" fill="${palette.mist}" font-family="Inter" font-size="16" font-weight="600">Illustrative workflow. Outcomes depend on configuration and the conversation.</text>
      <text x="1018" y="1018" text-anchor="end" fill="${palette.platinum}" font-family="IBM Plex Mono" font-size="16" font-weight="700" letter-spacing="2.2">BOTBOUND.ME</text>`,
  },
  1080,
);

render(
  "email/botbound-first-move-email-header-1200x400.png",
  {
    width: 1200,
    height: 400,
    title: "Find. Call. Book.",
    description: "BotBound outbound launch email header.",
    content: `${atmosphericBackground(1200, 400, wideData)}
      ${wordmark(56, 70, 42)}
      ${eyebrow("THE FIRST MOVE", 58, 145, 14)}
      <text x="54" y="262" fill="${palette.platinum}" font-family="Inter Tight" font-size="82" font-weight="800" letter-spacing="-4.6">FIND. CALL. <tspan fill="${palette.violet}">BOOK.</tspan></text>
      <text x="58" y="334" fill="${palette.mist}" font-family="Inter" font-size="24" font-weight="600">GET YOUR SALES BOT · BOTBOUND.ME</text>`,
  },
  1200,
);

render(
  "investor/botbound-outbound-investor-one-pager-1600x2071.png",
  {
    width: 1600,
    height: 2071,
    title: "BotBound outbound investor brief.",
    description: "One-page investor brief for BotBound's outbound wedge.",
    content: `<rect width="1600" height="2071" fill="#F6F3EC"/>
      <rect x="0" y="0" width="1600" height="520" fill="${palette.ink}"/>
      <rect x="0" y="0" width="1600" height="520" fill="url(#aura)"/>
      ${brandLockup(92, 72, 86, iconData)}
      ${eyebrow("INVESTOR BRIEF · OUTBOUND WEDGE", 94, 250, 20)}
      <text x="86" y="390" fill="${palette.platinum}" font-family="Inter Tight" font-size="126" font-weight="800" letter-spacing="-6.8">FIND. CALL. <tspan fill="${palette.violet}">BOOK.</tspan></text>
      <text x="92" y="474" fill="${palette.mist}" font-family="Inter" font-size="31" font-weight="600">Autonomous Bots find prospects, make calls, and drive clear outcomes.</text>

      <text x="92" y="644" fill="${palette.ink}" font-family="IBM Plex Mono" font-size="20" font-weight="700" letter-spacing="3">THE WEDGE</text>
      <text x="88" y="734" fill="${palette.ink}" font-family="Inter Tight" font-size="58" font-weight="800" letter-spacing="-2.8"><tspan x="88">OUTBOUND IS STILL A STACK.</tspan><tspan x="88" dy="66" fill="#6D52B5">BOTBOUND MAKES IT A BOT.</tspan></text>
      <text x="92" y="904" fill="#36323E" font-family="Inter" font-size="27" font-weight="600">
        <tspan x="92">Lead discovery, lists, scripts, calls, calendars, CRM updates,</tspan><tspan x="92" dy="42">follow-up, and review become one job-specific operating loop.</tspan>
      </text>

      <rect x="92" y="1030" width="1416" height="300" rx="36" fill="${palette.ink}"/>
      <text x="138" y="1102" fill="${palette.violetLight}" font-family="IBM Plex Mono" font-size="18" font-weight="700" letter-spacing="3">THE OPERATING PATH</text>
      <text x="138" y="1188" fill="${palette.platinum}" font-family="Inter Tight" font-size="45" font-weight="800"><tspan x="138">TARGET / FIND / REVIEW / QUEUE</tspan><tspan x="138" dy="54">CALL / QUALIFY / BOOK / REPORT</tspan></text>
      <text x="138" y="1296" fill="${palette.mist}" font-family="Inter" font-size="24" font-weight="600">Connected source or approved list. Intentional handoff. Clear outcome.</text>

      <text x="92" y="1450" fill="${palette.ink}" font-family="IBM Plex Mono" font-size="20" font-weight="700" letter-spacing="3">WHY BOTBOUND</text>
      <text x="92" y="1534" fill="${palette.ink}" font-family="Inter Tight" font-size="38" font-weight="800">JOB-SPECIFIC BOTS</text>
      <text x="92" y="1582" fill="#514C59" font-family="Inter" font-size="23" font-weight="600">Sales · Recruiting · Appointments · Reactivation · Intake</text>
      <text x="92" y="1688" fill="${palette.ink}" font-family="Inter Tight" font-size="38" font-weight="800">ONE WORKSPACE. EVERY OUTBOUND JOB.</text>
      <text x="92" y="1736" fill="#514C59" font-family="Inter" font-size="23" font-weight="600">Land with Sales. Expand into Recruiting, Appointments, Reactivation, and Intake.</text>
      <text x="92" y="1842" fill="${palette.ink}" font-family="Inter Tight" font-size="38" font-weight="800">BUILD FREE. LIVE FROM $19/MO.</text>
      <text x="92" y="1890" fill="#514C59" font-family="Inter" font-size="23" font-weight="600">Private simulation before live work. Capacity grows with the account.</text>

      <rect x="92" y="1972" width="1416" height="2" fill="#C9C3B7"/>
      <text x="92" y="2028" fill="${palette.ink}" font-family="IBM Plex Mono" font-size="18" font-weight="700" letter-spacing="2.2">BOTBOUND.ME</text>
      <text x="1508" y="2028" text-anchor="end" fill="#6D52B5" font-family="Inter" font-size="21" font-weight="800">PUT YOUR BOT ON THE LINE</text>`,
  },
  1600,
);

const investorPdf = buildInvestorPdf();
console.log(
  `Created investor/${relative(resolve(outputRoot, "investor"), investorPdf).replaceAll("\\", "/")} (${statSync(investorPdf).size} bytes)`,
);

function findReleaseFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (["qa-draft", "_rejected"].includes(entry.name.toLowerCase())) return [];
      return findReleaseFiles(full);
    }
    if (entry.name === "manifest.json") return [];
    if (full === resolve(campaignRoot, "SHA256SUMS.txt")) return [];
    return [full];
  });
}

mkdirSync(websiteRoot, { recursive: true });
const websiteOgSvg = resolve(websiteRoot, "botbound-find-call-book-og-1200x630.svg");
const websiteOgMarkup = svgFrame({
  width: 1200,
  height: 630,
  title: "Find. Call. Book.",
  description: "BotBound outbound Sales Bot campaign share card.",
  content: `${atmosphericBackground(1200, 630, null)}
    <ellipse cx="955" cy="580" rx="260" ry="44" fill="#050508" opacity=".74"/>
    <circle cx="960" cy="330" r="300" fill="${palette.violet}" opacity=".08" filter="url(#glow)"/>
    <image href="${operatorData}" x="720" y="84" width="474" height="474" preserveAspectRatio="xMidYMid meet"/>
    ${brandLockup(56, 42, 58, iconData)}
    ${eyebrow("THE FIRST MOVE", 58, 164, 15)}
    <text x="52" y="282" fill="${palette.platinum}" font-family="Inter Tight" font-size="92" font-weight="800" letter-spacing="-5">
      <tspan x="52">FIND.</tspan><tspan x="52" dy="86">CALL.</tspan><tspan x="52" dy="86" fill="${palette.violet}">BOOK.</tspan>
    </text>
    ${ctaPill("GET YOUR SALES BOT", 58, 530, 292, 58, 17)}
    <text x="1142" y="572" text-anchor="end" fill="${palette.platinum}" font-family="IBM Plex Mono" font-size="18" font-weight="700" letter-spacing="2.4">BOTBOUND.ME</text>`,
});
writeFileSync(websiteOgSvg, websiteOgMarkup);
console.log(
  `Created website/botbound-find-call-book-og-1200x630.svg (${Buffer.byteLength(websiteOgMarkup)} bytes)`,
);
generated.push(writePng("website/botbound-find-call-book-og-1200x630.png", websiteOgMarkup, 1200));

const reviewFiles = generated.filter((path) => !path.includes("contact-sheet"));
const thumbWidth = 520;
const thumbHeight = 390;
const columns = 4;
const rowsCount = Math.ceil(reviewFiles.length / columns);
const sheetWidth = 2400;
const sheetHeight = 330 + rowsCount * 500;
const tiles = reviewFiles
  .map((file, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = 90 + column * 570;
    const y = 260 + row * 500;
    const label = relative(outputRoot, file).replaceAll("\\", "/");
    return `<rect x="${x}" y="${y}" width="${thumbWidth}" height="${thumbHeight}" rx="20" fill="#121018" stroke="rgba(196,181,253,.18)"/>
      <image href="${dataUri(file)}" x="${x + 10}" y="${y + 10}" width="${thumbWidth - 20}" height="${thumbHeight - 70}" preserveAspectRatio="xMidYMid meet"/>
      <text x="${x + 16}" y="${y + thumbHeight - 22}" fill="${palette.mist}" font-family="IBM Plex Mono" font-size="13" font-weight="700">${esc(label.length > 53 ? `${label.slice(0, 50)}...` : label)}</text>`;
  })
  .join("");

const contactSheet = writePng(
  "contact-sheet/botbound-outbound-launch-contact-sheet.png",
  svgFrame({
    width: sheetWidth,
    height: sheetHeight,
    title: "BotBound outbound launch contact sheet.",
    description: "Complete review sheet for The First Move outbound campaign.",
    content: `<rect width="${sheetWidth}" height="${sheetHeight}" fill="${palette.ink}"/><rect width="${sheetWidth}" height="${sheetHeight}" fill="url(#grid)"/>
      ${brandLockup(88, 56, 72, iconData)}
      ${eyebrow("THE FIRST MOVE · COMPLETE STATIC ASSET REVIEW", 88, 190, 20)}
      ${tiles}`,
  }),
  sheetWidth,
);
generated.push(contactSheet);

const releaseRoots = [
  resolve(campaignRoot, "README.md"),
  resolve(campaignRoot, "CAMPAIGN_COPY.md"),
  resolve(campaignRoot, "WEBSITE_MESSAGING.md"),
  resolve(campaignRoot, "INVESTOR_ONE_PAGER.md"),
  resolve(campaignRoot, "ALT_TEXT_AND_ACCESSIBILITY.md"),
  resolve(campaignRoot, "PLACEMENT_MATRIX.md"),
  resolve(campaignRoot, "PROVENANCE.md"),
  sourceRoot,
  resolve(outputRoot, "hero"),
  resolve(outputRoot, "social"),
  resolve(outputRoot, "roles"),
  resolve(outputRoot, "carousel"),
  resolve(outputRoot, "workflow"),
  resolve(outputRoot, "email"),
  resolve(outputRoot, "investor"),
  resolve(outputRoot, "motion"),
  websiteRoot,
  resolve(outputRoot, "contact-sheet"),
];
const manifestFiles = releaseRoots
  .flatMap((releaseRoot) => {
    if (!existsSync(releaseRoot)) return [];
    return statSync(releaseRoot).isDirectory() ? findReleaseFiles(releaseRoot) : [releaseRoot];
  })
  .filter((filePath, index, files) => files.indexOf(filePath) === index)
  .map((filePath) => {
    const bytes = readFileSync(filePath);
    return {
      path: relative(campaignRoot, filePath).replaceAll("\\", "/"),
      bytes: statSync(filePath).size,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  })
  .sort((a, b) => a.path.localeCompare(b.path));

const approvalStagingDirectory = resolve(
  outputRoot,
  "_rejected",
  `.approval-staging-${process.pid}-${Date.now()}`,
);
mkdirSync(approvalStagingDirectory, { recursive: true });
const stagedManifestPath = resolve(approvalStagingDirectory, "manifest.json");
const stagedChecksumPath = resolve(approvalStagingDirectory, "SHA256SUMS.txt");
try {
  writeFileSync(
    stagedManifestPath,
    `${JSON.stringify(
      {
        campaign: "The First Move",
        scope: "outbound-only creative release",
        generatedAt: new Date().toISOString(),
        renderer: "scripts/render-botbound-outbound-launch-assets.mjs",
        files: manifestFiles,
      },
      null,
      2,
    )}\n`,
  );

  const checksumFiles = [
    ...manifestFiles,
    {
      path: "manifest.json",
      bytes: statSync(stagedManifestPath).size,
      sha256: createHash("sha256").update(readFileSync(stagedManifestPath)).digest("hex"),
    },
  ].sort((a, b) => a.path.localeCompare(b.path));
  writeFileSync(
    stagedChecksumPath,
    `${checksumFiles.map((file) => `${file.sha256}  ${file.path}`).join("\n")}\n`,
  );

  // Publish the manifest last: it is the approval marker for the complete set.
  renameSync(stagedChecksumPath, checksumPath);
  renameSync(stagedManifestPath, manifestPath);
  console.log(`Wrote ${manifestFiles.length} approved release manifest entries.`);
  console.log(`Wrote ${checksumFiles.length} approved release checksums.`);
} finally {
  rmSync(approvalStagingDirectory, { recursive: true, force: true });
}
