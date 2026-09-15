import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// This renderer owns the historical Second Ring campaign only. Require an
// explicit archive request before reading inputs or creating any output.
if (!process.argv.includes("--historical-second-ring")) {
  console.error(
    "The Second Ring renderer is retired. Use brand-work/CURRENT-ASSET-INDEX.md " +
      "for the current AI sales-bot campaign. For historical reproduction only, " +
      "run npm run brand:launch:archive; it writes only to brand-work/archives/second-ring/exports.",
  );
  process.exit(1);
}
const work = resolve(root, "brand-work");
const output = resolve(work, "archives/second-ring/exports");
const fonts = [
  resolve(root, "brand-work/fonts/InterTight-ExtraBold.ttf"),
  resolve(root, "brand-work/fonts/Inter-Regular.ttf"),
  resolve(root, "brand-work/fonts/Inter-SemiBold.ttf"),
  resolve(root, "brand-work/fonts/Inter-Bold.ttf"),
  resolve(root, "brand-work/fonts/Inter-ExtraBold.ttf"),
  resolve(root, "brand-work/fonts/IBMPlexMono-Bold.ttf"),
];

function imageData(relativePath) {
  const mime =
    relativePath.endsWith(".jpg") || relativePath.endsWith(".jpeg") ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${readFileSync(resolve(root, relativePath)).toString("base64")}`;
}

function writePng(relativePath, svg, width) {
  const destination = resolve(output, relativePath);
  const destinationDirectory = dirname(destination);
  if (!existsSync(destinationDirectory)) mkdirSync(destinationDirectory, { recursive: true });
  const image = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: { fontFiles: fonts, loadSystemFonts: false, defaultFontFamily: "Inter Tight" },
  })
    .render()
    .asPng();
  writeFileSync(destination, image);
  console.log(`✔ ${relativePath} (${image.length} bytes)`);
}

function wordmark(x, y, size, bot = "#F5F4F8", bound = "#A78BFA") {
  return `<text x="${x}" y="${y}" fill="${bot}" font-family="Inter Tight, sans-serif" font-size="${size}" font-weight="800" letter-spacing="${-size * 0.045}">Bot<tspan fill="${bound}">Bound</tspan></text>`;
}

function frame({ width, height, background, content, title, description }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
  <title id="title">${title}</title>
  <desc id="description">${description}</desc>
  ${background}
  ${content}
</svg>`;
}

const appIcon = imageData("public/brand/botbound-app-icon.png");
const operator = imageData("public/brand/botbound-operator-polished.png");
const bakery = imageData("brand-work/launch-stills/botbound-second-ring-bakery-hero-2560x1440.jpg");
const auto = imageData("brand-work/launch-stills/botbound-hands-full-auto-social-1600-square.jpg");
const florist = imageData(
  "brand-work/launch-stills/botbound-second-ring-florist-story-1440x2560.jpg",
);

const obsidianLockup = frame({
  width: 1600,
  height: 480,
  title: "BotBound primary horizontal lockup on obsidian",
  description: "The approved BotBound robot and unbroken wordmark.",
  background: `<defs><radialGradient id="g" cx="18%" cy="24%" r="90%"><stop stop-color="#24183C"/><stop offset=".5" stop-color="#0A0A0E"/><stop offset="1" stop-color="#050508"/></radialGradient></defs><rect width="1600" height="480" fill="url(#g)"/>`,
  content: `<image href="${appIcon}" x="88" y="64" width="352" height="352"/>${wordmark(492, 286, 164)}<text x="500" y="348" fill="#B6B1C6" font-family="Inter, sans-serif" font-size="28" font-weight="600" letter-spacing="1.4">YOUR BOT FOR CALLS, TEXTS, AND EMAIL.</text>`,
});
writePng("identity/botbound-lockup-obsidian-1600x480.png", obsidianLockup, 1600);

const platinumLockup = frame({
  width: 1600,
  height: 480,
  title: "BotBound primary horizontal lockup on platinum",
  description: "The approved BotBound robot and unbroken wordmark for light surfaces.",
  background: `<rect width="1600" height="480" fill="#F5F4F8"/>`,
  content: `<image href="${appIcon}" x="88" y="64" width="352" height="352"/>${wordmark(492, 286, 164, "#0A0A0E", "#6D3DEB")}<text x="500" y="348" fill="#5B556B" font-family="Inter, sans-serif" font-size="28" font-weight="600" letter-spacing="1.4">YOUR BOT FOR CALLS, TEXTS, AND EMAIL.</text>`,
});
writePng("identity/botbound-lockup-platinum-1600x480.png", platinumLockup, 1600);

const transparentLockup = frame({
  width: 1600,
  height: 480,
  title: "BotBound transparent horizontal lockup",
  description: "The approved BotBound robot and unbroken wordmark on transparency.",
  background: "",
  content: `<image href="${appIcon}" x="88" y="64" width="352" height="352"/>${wordmark(492, 286, 164)}<text x="500" y="348" fill="#B6B1C6" font-family="Inter, sans-serif" font-size="28" font-weight="600" letter-spacing="1.4">YOUR BOT FOR CALLS, TEXTS, AND EMAIL.</text>`,
});
writePng("identity/botbound-lockup-transparent-1600x480.png", transparentLockup, 1600);

const linkedIn = frame({
  width: 1200,
  height: 627,
  title: "BotBound launch social hero",
  description: "The Second Ring campaign in a working bakery.",
  background: `<defs><linearGradient id="shade" x1="0" x2="1"><stop offset="0" stop-color="#050508" stop-opacity=".98"/><stop offset=".53" stop-color="#08070B" stop-opacity=".86"/><stop offset=".78" stop-color="#08070B" stop-opacity=".08"/></linearGradient></defs><image href="${bakery}" width="1200" height="675" y="-24" preserveAspectRatio="xMidYMid slice"/><rect width="1200" height="627" fill="url(#shade)"/>`,
  content: `${wordmark(64, 78, 46)}<text x="64" y="192" fill="#C4B5FD" font-family="IBM Plex Mono, monospace" font-size="18" font-weight="700" letter-spacing="3">THE SECOND RING</text><text x="60" y="284" fill="#F5F4F8" font-family="Inter Tight, sans-serif" font-size="66" font-weight="800" letter-spacing="-3"><tspan x="60">EVERY MISSED CALL</tspan><tspan x="60" dy="68">IS SOMEONE TRYING</tspan><tspan x="60" dy="68">THE NEXT NAME.</tspan></text><text x="64" y="528" fill="#F5F4F8" font-family="Inter, sans-serif" font-size="25" font-weight="600">Put your Bot on the line.</text><rect x="64" y="558" width="222" height="4" rx="2" fill="#A78BFA"/>`,
});
writePng("social/botbound-launch-linkedin-1200x627.png", linkedIn, 1200);

const square = frame({
  width: 1080,
  height: 1080,
  title: "BotBound square launch social",
  description: "A working mechanic and the BotBound phone Bot.",
  background: `<defs><linearGradient id="shade" y1="0" y2="1"><stop stop-color="#050508" stop-opacity=".94"/><stop offset=".46" stop-color="#08070B" stop-opacity=".08"/><stop offset="1" stop-color="#050508" stop-opacity=".7"/></linearGradient></defs><image href="${auto}" width="1080" height="1080"/><rect width="1080" height="1080" fill="url(#shade)"/>`,
  content: `${wordmark(64, 84, 54)}<text x="62" y="178" fill="#F5F4F8" font-family="Inter Tight, sans-serif" font-size="82" font-weight="800" letter-spacing="-3.5"><tspan x="62">BUSY DOING</tspan><tspan x="62" dy="82">THE WORK?</tspan></text><rect x="64" y="354" width="102" height="8" rx="4" fill="#A78BFA"/><text x="64" y="965" fill="#F5F4F8" font-family="Inter Tight, sans-serif" font-size="44" font-weight="800">YOUR BOT CAN ANSWER.</text><text x="66" y="1010" fill="#C4B5FD" font-family="IBM Plex Mono, monospace" font-size="17" font-weight="700" letter-spacing="2.5">CALL · TEXT · EMAIL</text>`,
});
writePng("social/botbound-launch-instagram-1080-square.png", square, 1080);

const story = frame({
  width: 1080,
  height: 1920,
  title: "BotBound vertical launch story",
  description: "A florist working while the BotBound phone Bot answers.",
  background: `<defs><linearGradient id="shade" y1="0" y2="1"><stop stop-color="#050508" stop-opacity=".97"/><stop offset=".38" stop-color="#08070B" stop-opacity=".12"/><stop offset=".79" stop-color="#08070B" stop-opacity=".08"/><stop offset="1" stop-color="#050508" stop-opacity=".88"/></linearGradient></defs><image href="${florist}" width="1080" height="1920"/><rect width="1080" height="1920" fill="url(#shade)"/>`,
  content: `${wordmark(72, 112, 58)}<text x="70" y="245" fill="#C4B5FD" font-family="IBM Plex Mono, monospace" font-size="21" font-weight="700" letter-spacing="4">THE SECOND RING</text><text x="66" y="390" fill="#F5F4F8" font-family="Inter Tight, sans-serif" font-size="104" font-weight="800" letter-spacing="-5"><tspan x="66">THE CALL</tspan><tspan x="66" dy="105">STILL GETS</tspan><tspan x="66" dy="105" fill="#A78BFA">ANSWERED.</tspan></text><rect x="70" y="1715" width="940" height="2" fill="#A78BFA" fill-opacity=".55"/><text x="70" y="1790" fill="#F5F4F8" font-family="Inter Tight, sans-serif" font-size="46" font-weight="800">PUT YOUR BOT ON THE LINE.</text><text x="72" y="1848" fill="#B6B1C6" font-family="Inter, sans-serif" font-size="26" font-weight="600">Build free at BotBound.me</text>`,
});
writePng("social/botbound-launch-story-1080x1920.png", story, 1080);

const ooh = frame({
  width: 3840,
  height: 2160,
  title: "BotBound The Second Ring billboard",
  description: "A widescreen BotBound billboard for the hands-full bakery story.",
  background: `<defs><linearGradient id="shade" x1="0" x2="1"><stop stop-color="#050508" stop-opacity=".99"/><stop offset=".5" stop-color="#08070B" stop-opacity=".88"/><stop offset=".76" stop-color="#08070B" stop-opacity=".05"/></linearGradient></defs><image href="${bakery}" width="3840" height="2160"/><rect width="3840" height="2160" fill="url(#shade)"/>`,
  content: `${wordmark(226, 280, 146)}<text x="218" y="770" fill="#F5F4F8" font-family="Inter Tight, sans-serif" font-size="270" font-weight="800" letter-spacing="-13"><tspan x="218">YOU CAN'T ANSWER</tspan><tspan x="218" dy="276">EVERY CALL.</tspan><tspan x="218" dy="276" fill="#A78BFA">YOUR BOT CAN.</tspan></text><text x="228" y="1830" fill="#F5F4F8" font-family="Inter, sans-serif" font-size="78" font-weight="600">Calls · Texts · Email</text><text x="228" y="1958" fill="#C4B5FD" font-family="IBM Plex Mono, monospace" font-size="64" font-weight="700" letter-spacing="8">BOTBOUND.ME</text>`,
});
writePng("ooh/botbound-second-ring-billboard-4k.png", ooh, 3840);

const email = frame({
  width: 1200,
  height: 400,
  title: "BotBound launch email header",
  description: "A concise BotBound campaign email header.",
  background: `<defs><radialGradient id="signal" cx="82%" cy="44%" r="62%"><stop stop-color="#8B5CF6" stop-opacity=".28"/><stop offset="1" stop-color="#8B5CF6" stop-opacity="0"/></radialGradient><linearGradient id="canvas" x1="0" x2="1"><stop stop-color="#050508"/><stop offset="1" stop-color="#14111F"/></linearGradient></defs><rect width="1200" height="400" fill="url(#canvas)"/><rect width="1200" height="400" fill="url(#signal)"/>`,
  content: `${wordmark(52, 70, 44)}<text x="50" y="186" fill="#F5F4F8" font-family="Inter Tight, sans-serif" font-size="70" font-weight="800" letter-spacing="-3"><tspan x="50">PUT YOUR BOT</tspan><tspan x="50" dy="72">ON THE <tspan fill="#A78BFA">LINE.</tspan></tspan></text><text x="54" y="344" fill="#B6B1C6" font-family="Inter, sans-serif" font-size="24" font-weight="600">Your Bot. Every channel.</text><image href="${operator}" x="790" y="-52" width="490" height="490"/>`,
});
writePng("email/botbound-launch-email-header-1200x400.png", email, 1200);

const endFrame = frame({
  width: 3840,
  height: 2160,
  title: "BotBound commercial end frame",
  description: "The approved robot and BotBound launch promise on obsidian.",
  background: `<defs><radialGradient id="signal" cx="50%" cy="50%" r="58%"><stop stop-color="#8B5CF6" stop-opacity=".25"/><stop offset="1" stop-color="#8B5CF6" stop-opacity="0"/></radialGradient><linearGradient id="canvas" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#181126"/><stop offset=".5" stop-color="#0A0A0E"/><stop offset="1" stop-color="#050508"/></linearGradient></defs><rect width="3840" height="2160" fill="url(#canvas)"/><rect width="3840" height="2160" fill="url(#signal)"/>`,
  content: `<image href="${operator}" x="1360" y="68" width="1120" height="1120"/>${wordmark(1020, 1450, 348)}<text x="1920" y="1648" fill="#F5F4F8" font-family="Inter Tight, sans-serif" font-size="116" font-weight="800" text-anchor="middle" letter-spacing="2">PUT YOUR BOT ON THE LINE.</text><text x="1920" y="1790" fill="#B6B1C6" font-family="Inter, sans-serif" font-size="62" font-weight="600" text-anchor="middle">Your Bot for calls, texts, and email.</text><rect x="1584" y="1882" width="672" height="154" rx="77" fill="#A78BFA"/><text x="1920" y="1983" fill="#0E0B16" font-family="Inter Tight, sans-serif" font-size="58" font-weight="800" text-anchor="middle" letter-spacing="5">BOTBOUND.ME</text>`,
});
writePng("commercial/botbound-commercial-endframe-4k.png", endFrame, 3840);
