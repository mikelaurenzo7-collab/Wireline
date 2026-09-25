import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Resvg } from "@resvg/resvg-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const campaignRoot = resolve(root, "brand-work/launch-2026-09");
const outputRoot = resolve(campaignRoot, "exports");
const fonts = [
  resolve(root, "brand-work/fonts/InterTight-ExtraBold.ttf"),
  resolve(root, "brand-work/fonts/Inter-Regular.ttf"),
  resolve(root, "brand-work/fonts/Inter-SemiBold.ttf"),
  resolve(root, "brand-work/fonts/Inter-Bold.ttf"),
  resolve(root, "brand-work/fonts/Inter-ExtraBold.ttf"),
  resolve(root, "brand-work/fonts/IBMPlexMono-Bold.ttf"),
];

const generatedBakery = resolve(campaignRoot, "sources/botbound-hands-full-bakery-original.png");
const generatedBadTiming = resolve(
  campaignRoot,
  "sources/botbound-impeccably-bad-timing-florist-portrait.png",
);
const generatedSignal = resolve(campaignRoot, "sources/botbound-the-signal-ooh-wide.png");
const existingFlorist = resolve(
  root,
  "brand-work/launch-stills/botbound-second-ring-florist-story-1440x2560.jpg",
);
const appIcon = resolve(root, "public/brand/botbound-app-icon.png");
const operator = resolve(root, "public/brand/botbound-operator-polished.png");
const reviewedOg = resolve(root, "public/og-image.png");
if (!existsSync(reviewedOg)) {
  throw new Error(
    "Missing public/og-image.png. Run npm run assets and review the generated OG before npm run brand:launch. No release assets were changed.",
  );
}

function dataUri(filePath) {
  const extension = filePath.toLowerCase().split(".").pop();
  const mime = extension === "jpg" || extension === "jpeg" ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${readFileSync(filePath).toString("base64")}`;
}

function writePng(relativePath, svg, width) {
  const destination = resolve(outputRoot, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  const image = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: {
      fontFiles: fonts,
      loadSystemFonts: false,
      defaultFontFamily: "Inter",
    },
  })
    .render()
    .asPng();
  writeFileSync(destination, image);
  console.log(`Created ${relativePath} (${image.length} bytes)`);
  return destination;
}

function frame({ width, height, title, description, defs = "", content }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
  <title id="title">${title}</title>
  <desc id="description">${description}</desc>
  <defs>${defs}</defs>
  ${content}
</svg>`;
}

function wordmark(x, y, size, color = "#F8F7FC") {
  return `<text x="${x}" y="${y}" fill="${color}" font-family="Inter Tight" font-size="${size}" font-weight="800" letter-spacing="${-size * 0.047}">Bot<tspan fill="#A78BFA">Bound</tspan></text>`;
}

function brandLockup(x, y, size, iconData) {
  return `<image href="${iconData}" x="${x}" y="${y}" width="${size}" height="${size}"/>
    ${wordmark(x + size + size * 0.18, y + size * 0.68, size * 0.55)}`;
}

function signalRings(cx, cy, base, count = 4) {
  return Array.from({ length: count }, (_, index) => {
    const radius = base + index * base * 0.46;
    const opacity = (0.46 - index * 0.085).toFixed(2);
    return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#A78BFA" stroke-width="${Math.max(3, base * 0.035)}" opacity="${opacity}"/>`;
  }).join("");
}

function canvasDefs() {
  return `<linearGradient id="canvas" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#181126"/><stop offset=".48" stop-color="#0A0A0E"/><stop offset="1" stop-color="#050508"/></linearGradient>
    <radialGradient id="aura" cx="78%" cy="42%" r="58%"><stop stop-color="#8B5CF6" stop-opacity=".24"/><stop offset="1" stop-color="#8B5CF6" stop-opacity="0"/></radialGradient>
    <linearGradient id="photoShade" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#050508" stop-opacity=".98"/><stop offset=".56" stop-color="#08070B" stop-opacity=".82"/><stop offset=".84" stop-color="#08070B" stop-opacity=".08"/></linearGradient>
    <linearGradient id="verticalShade" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#050508" stop-opacity=".88"/><stop offset=".3" stop-color="#050508" stop-opacity=".12"/><stop offset=".7" stop-color="#050508" stop-opacity=".08"/><stop offset="1" stop-color="#050508" stop-opacity=".92"/></linearGradient>`;
}

const iconData = dataUri(appIcon);
const operatorData = dataUri(operator);
const bakeryData = dataUri(generatedBakery);
const badTimingSource = existsSync(generatedBadTiming) ? generatedBadTiming : existingFlorist;
const badTimingData = dataUri(badTimingSource);
const signalData = existsSync(generatedSignal) ? dataUri(generatedSignal) : null;

writePng(
  "billboard/botbound-second-ring-signal-billboard-3840x2160.png",
  frame({
    width: 3840,
    height: 2160,
    title: "The Second Ring Belongs to Your Bot",
    description:
      "A minimal BotBound billboard with the approved phone Bot and violet signal rings.",
    defs: canvasDefs(),
    content: `${signalData ? `<image href="${signalData}" width="3840" height="2160" preserveAspectRatio="xMidYMid slice"/>` : `<rect width="3840" height="2160" fill="url(#canvas)"/><rect width="3840" height="2160" fill="url(#aura)"/>`}
      <rect width="3840" height="2160" fill="url(#photoShade)" opacity=".9"/>
      ${brandLockup(210, 170, 150, iconData)}
      <text x="204" y="720" fill="#C4B5FD" font-family="IBM Plex Mono" font-size="56" font-weight="700" letter-spacing="12">The Second Ring</text>
      <text x="192" y="1000" fill="#F8F7FC" font-family="Inter Tight" font-size="278" font-weight="800" letter-spacing="-6.9"><tspan x="192">Belongs to</tspan><tspan x="192" dy="280" fill="#A78BFA">Your Bot.</tspan></text>
      <text x="210" y="1810" fill="#B6B1C6" font-family="Inter" font-size="66" font-weight="600">Bots for calls, texts, and email.</text>
      <text x="210" y="1965" fill="#F8F7FC" font-family="IBM Plex Mono" font-size="62" font-weight="700" letter-spacing="10">BOTBOUND.APP</text>
      <rect x="210" y="2040" width="3320" height="8" rx="4" fill="#A78BFA" opacity=".75"/>`,
  }),
  3840,
);

writePng(
  "social/botbound-hands-full-linkedin-1200x627.png",
  frame({
    width: 1200,
    height: 627,
    title: "Hands Full? Bot on the Line.",
    description:
      "BotBound launch creative showing a baker at work with the approved Bot answering.",
    defs: canvasDefs(),
    content: `<image href="${bakeryData}" width="1200" height="675" y="-24" preserveAspectRatio="xMidYMid slice"/>
      <rect width="1200" height="627" fill="url(#photoShade)"/>
      ${wordmark(62, 70, 42)}
      <text x="62" y="168" fill="#C4B5FD" font-family="IBM Plex Mono" font-size="17" font-weight="700" letter-spacing="3.4">The Second Ring</text>
      <text x="58" y="262" fill="#F8F7FC" font-family="Inter Tight" font-size="68" font-weight="800" letter-spacing="-1.66"><tspan x="58">Hands Full?</tspan><tspan x="58" dy="84" fill="#A78BFA">Bot on the Line.</tspan></text>
      <text x="62" y="552" fill="#F8F7FC" font-family="Inter" font-size="23" font-weight="650">Start Free at BotBound.app</text>
      <rect x="62" y="572" width="240" height="4" rx="2" fill="#A78BFA"/><text x="62" y="603" fill="#B6B1C6" font-family="Inter" font-size="16">Private rehearsal. Paid live activation.</text>
      ${signalRings(1083, 484, 50, 3)}
      <image href="${operatorData}" x="972" y="382" width="250" height="250"/>`,
  }),
  1200,
);

writePng(
  "social/botbound-impeccably-bad-timing-feed-1080x1350.png",
  frame({
    width: 1080,
    height: 1350,
    title: "Of Course It Rang Now",
    description:
      "A comedic BotBound launch ad about a call arriving while a florist has both hands full.",
    defs: canvasDefs(),
    content: `<image href="${badTimingData}" width="1080" height="1350" preserveAspectRatio="xMidYMid slice"/>
      <rect width="1080" height="1350" fill="url(#verticalShade)"/>
      ${brandLockup(62, 54, 66, iconData)}
      <text x="60" y="260" fill="#C4B5FD" font-family="IBM Plex Mono" font-size="22" font-weight="700" letter-spacing="3.8">Impeccably Bad Timing</text>
      <text x="54" y="382" fill="#F8F7FC" font-family="Inter Tight" font-size="104" font-weight="800" letter-spacing="-2.48"><tspan x="54">Of Course</tspan><tspan x="54" dy="103">It Rang</tspan><tspan x="54" dy="103" fill="#A78BFA">Now.</tspan></text>
      <rect x="58" y="1124" width="964" height="2" fill="#A78BFA" opacity=".58"/>
      <text x="58" y="1206" fill="#F8F7FC" font-family="Inter Tight" font-size="48" font-weight="800">Keep Your Hands on the Work.</text>
      <text x="60" y="1270" fill="#C7CCD6" font-family="Inter" font-size="27" font-weight="600">Start Free at BotBound.app</text>
      <text x="60" y="1316" fill="#C7CCD6" font-family="Inter" font-size="19">Private rehearsal. Paid live activation.</text>`,
  }),
  1080,
);

writePng(
  "social/botbound-impeccably-bad-timing-story-1080x1920.png",
  frame({
    width: 1080,
    height: 1920,
    title: "Keep Your Hands on the Work",
    description: "Vertical BotBound story creative showing an inconveniently timed call.",
    defs: canvasDefs(),
    content: `<image href="${badTimingData}" width="1080" height="1920" preserveAspectRatio="xMidYMid slice"/>
      <rect width="1080" height="1920" fill="url(#verticalShade)"/>
      ${brandLockup(96, 236, 72, iconData)}
      <text x="96" y="390" fill="#C4B5FD" font-family="IBM Plex Mono" font-size="22" font-weight="700" letter-spacing="4">Impeccably Bad Timing</text>
      <text x="90" y="526" fill="#F8F7FC" font-family="Inter Tight" font-size="118" font-weight="800" letter-spacing="-2.76"><tspan x="90">Of Course</tspan><tspan x="90" dy="116">It Rang</tspan><tspan x="90" dy="116" fill="#A78BFA">Now.</tspan></text>
      <rect x="96" y="1328" width="840" height="3" fill="#A78BFA" opacity=".66"/>
      <text x="96" y="1418" fill="#F8F7FC" font-family="Inter Tight" font-size="66" font-weight="800"><tspan x="96">Keep Your Hands</tspan><tspan x="96" dy="70">on the Work.</tspan></text>
      <text x="96" y="1554" fill="#F8F7FC" font-family="Inter" font-size="31" font-weight="600">Start Free at BotBound.app</text>
      <text x="96" y="1610" fill="#C7CCD6" font-family="Inter" font-size="23">Private rehearsal. Paid live activation.</text>`,
  }),
  1080,
);

function carouselBase(slideNumber, content, title, description) {
  return frame({
    width: 1080,
    height: 1350,
    title,
    description,
    defs: canvasDefs(),
    content: `<rect width="1080" height="1350" fill="url(#canvas)"/>
      <rect width="1080" height="1350" fill="url(#aura)"/>
      ${brandLockup(62, 54, 66, iconData)}
      <text x="1018" y="96" fill="#B6B1C6" font-family="IBM Plex Mono" font-size="18" font-weight="700" text-anchor="end" letter-spacing="3">${String(slideNumber).padStart(2, "0")} / 05</text>
      ${content}
      <text x="62" y="1284" fill="#B6B1C6" font-family="IBM Plex Mono" font-size="17" font-weight="700" letter-spacing="2.8">BOTBOUND.APP · OpenAI Voice Roster</text>`,
  });
}

writePng(
  "voice-carousel/botbound-openai-voices-01-1080x1350.png",
  carouselBase(
    1,
    `<text x="58" y="306" fill="#C4B5FD" font-family="IBM Plex Mono" font-size="22" font-weight="700" letter-spacing="4">Voice Is Part of the Business</text>
      <text x="54" y="470" fill="#F8F7FC" font-family="Inter Tight" font-size="108" font-weight="800" letter-spacing="-2.67"><tspan x="54">A Voice</tspan><tspan x="54" dy="108">For Your</tspan><tspan x="54" dy="108" fill="#A78BFA">Business.</tspan></text>
      ${signalRings(760, 930, 122, 4)}
      <image href="${operatorData}" x="585" y="755" width="440" height="440"/>
      <text x="60" y="750" fill="#F8F7FC" font-family="Inter" font-size="30" font-weight="600">Preview voices. Pick your tone.</text>`,
    "A voice for your business",
    "The first slide in BotBound's OpenAI voice carousel.",
  ),
  1080,
);

const voiceNames = [
  "Alloy",
  "Ash",
  "Ballad",
  "Coral",
  "Echo",
  "Sage",
  "Shimmer",
  "Verse",
  "Marin",
  "Cedar",
];
const voiceCards = voiceNames
  .map((name, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = 60 + col * 494;
    const y = 460 + row * 124;
    const selected = name === "Coral";
    return `<rect x="${x}" y="${y}" width="466" height="94" rx="28" fill="${selected ? "#A78BFA" : "rgba(255,255,255,.055)"}" stroke="${selected ? "#C4B5FD" : "rgba(196,181,253,.18)"}" stroke-width="2"/>
      <circle cx="${x + 48}" cy="${y + 47}" r="16" fill="${selected ? "#0A0A0E" : "#8B5CF6"}"/>
      <text x="${x + 82}" y="${y + 58}" fill="${selected ? "#0A0A0E" : "#F8F7FC"}" font-family="Inter Tight" font-size="31" font-weight="800" letter-spacing="1.2">${name}</text>`;
  })
  .join("");

writePng(
  "voice-carousel/botbound-openai-voices-02-1080x1350.png",
  carouselBase(
    2,
    `<text x="58" y="294" fill="#F8F7FC" font-family="Inter Tight" font-size="104" font-weight="800" letter-spacing="-2.48"><tspan x="58">10 Built-In</tspan><tspan x="58" dy="106" fill="#A78BFA">OpenAI Voices.</tspan></text>
      ${voiceCards}`,
    "Ten built-in OpenAI voices",
    "The ten current OpenAI voice choices available in BotBound.",
  ),
  1080,
);

const wave = Array.from({ length: 54 }, (_, index) => {
  const x = 74 + index * 17.2;
  const height = 26 + ((index * 37) % 112);
  return `<rect x="${x}" y="${865 - height / 2}" width="8" height="${height}" rx="4" fill="${index > 9 && index < 45 ? "#A78BFA" : "#4C3B73"}"/>`;
}).join("");

writePng(
  "voice-carousel/botbound-openai-voices-03-1080x1350.png",
  carouselBase(
    3,
    `<text x="58" y="318" fill="#C4B5FD" font-family="IBM Plex Mono" font-size="22" font-weight="700" letter-spacing="4">Your Bot. Your Tone.</text>
      <text x="54" y="476" fill="#F8F7FC" font-family="Inter Tight" font-size="118" font-weight="800" letter-spacing="-2.76"><tspan x="54">Choose</tspan><tspan x="54" dy="116" fill="#A78BFA">The Voice.</tspan></text>
      <rect x="58" y="716" width="964" height="300" rx="42" fill="rgba(255,255,255,.055)" stroke="rgba(196,181,253,.24)" stroke-width="2"/>
      ${wave}
      <circle cx="128" cy="1092" r="22" fill="#A78BFA"/><text x="174" y="1105" fill="#F8F7FC" font-family="Inter Tight" font-size="42" font-weight="800">Coral</text>
      <text x="58" y="1188" fill="#B6B1C6" font-family="Inter" font-size="29" font-weight="600">Preview. Compare. Pick what fits the job.</text>`,
    "Choose the voice",
    "A BotBound voice selection concept using Coral from the current OpenAI roster.",
  ),
  1080,
);

writePng(
  "voice-carousel/botbound-openai-voices-04-1080x1350.png",
  carouselBase(
    4,
    `<text x="58" y="292" fill="#C4B5FD" font-family="IBM Plex Mono" font-size="22" font-weight="700" letter-spacing="4">Consistency Is the Feature</text>
      <text x="54" y="442" fill="#F8F7FC" font-family="Inter Tight" font-size="112" font-weight="800" letter-spacing="-2.3"><tspan x="54">One Voice.</tspan><tspan x="54" dy="112">The Whole</tspan><tspan x="54" dy="112" fill="#A78BFA">Call.</tspan></text>
      <path d="M72 920 C160 780 234 1032 326 884 S492 744 580 912 S752 1050 830 870 S956 792 1012 900" fill="none" stroke="#A78BFA" stroke-width="15" stroke-linecap="round"/>
      ${signalRings(540, 916, 128, 4)}
      <text x="58" y="1136" fill="#F8F7FC" font-family="Inter" font-size="32" font-weight="600">Your chosen voice, throughout the call.</text>`,
    "One selected voice through the conversation",
    "BotBound keeps the selected OpenAI voice consistent through each runtime session.",
  ),
  1080,
);

writePng(
  "voice-carousel/botbound-openai-voices-05-1080x1350.png",
  carouselBase(
    5,
    `${signalRings(540, 540, 180, 5)}
      <image href="${operatorData}" x="260" y="250" width="560" height="560"/>
      <text x="540" y="926" fill="#F8F7FC" font-family="Inter Tight" font-size="98" font-weight="800" text-anchor="middle" letter-spacing="-2.3"><tspan x="540">Put Your Bot</tspan><tspan x="540" dy="100" fill="#A78BFA">on the Line.</tspan></text>
      <rect x="330" y="1110" width="420" height="88" rx="44" fill="#A78BFA"/>
      <text x="540" y="1168" fill="#0A0A0E" font-family="Inter Tight" font-size="32" font-weight="800" text-anchor="middle" letter-spacing="2">Start Free</text>
      <text x="540" y="1230" text-anchor="middle" fill="#B6B1C6" font-family="Inter" font-size="22">Private rehearsal. Paid live activation.</text>`,
    "Put your Bot on the line",
    "The closing slide in BotBound's OpenAI voice carousel.",
  ),
  1080,
);

const channels = [
  ["Calls", "Inbound and approved outbound."],
  ["Texts", "Keep the conversation moving."],
  ["Email", "Follow up with shared context."],
];
const outcomeCards = channels
  .map(([label, detail], index) => {
    const x = 62 + index * 372;
    return `<rect x="${x}" y="332" width="340" height="172" rx="28" fill="rgba(255,255,255,.055)" stroke="rgba(196,181,253,.22)" stroke-width="2"/>
      <circle cx="${x + 32}" cy="369" r="7" fill="#A78BFA"/>
      <text x="${x + 24}" y="427" fill="#F8F7FC" font-family="Inter Tight" font-size="40" font-weight="800">${label}</text>
      <text x="${x + 24}" y="472" fill="#B6B1C6" font-family="Inter" font-size="17" font-weight="600">${detail}</text>`;
  })
  .join("");

writePng(
  "social/botbound-ring-to-next-action-1200x627.png",
  frame({
    width: 1200,
    height: 627,
    title: "Inbound &amp; Outbound Bots",
    description:
      "A BotBound capability card for calls, texts, and email; connected channels and owner rules apply.",
    defs: canvasDefs(),
    content: `<rect width="1200" height="627" fill="url(#canvas)"/><rect width="1200" height="627" fill="url(#aura)"/>
      ${wordmark(62, 68, 42)}
      <text x="60" y="162" fill="#C4B5FD" font-family="IBM Plex Mono" font-size="17" font-weight="700" letter-spacing="3.2">Calls · Texts · Email</text>
      <text x="58" y="256" fill="#F8F7FC" font-family="Inter Tight" font-size="64" font-weight="800" letter-spacing="-1.52">Inbound &amp; Outbound Bots</text>
      <path d="M92 300 H1108" stroke="#8B5CF6" stroke-width="5" stroke-linecap="round" opacity=".7"/>
      ${outcomeCards}
      <text x="62" y="582" fill="#C7CCD6" font-family="Inter" font-size="18" font-weight="600">Free private rehearsal. Paid live activation, connected channels, and permissions apply.</text>`,
  }),
  1200,
);

writePng(
  "social/botbound-call-sheet-1080-square.png",
  frame({
    width: 1080,
    height: 1080,
    title: "The Call Sheet",
    description:
      "A bold BotBound social concept showing the inconvenient moments when a Bot can answer.",
    defs: canvasDefs(),
    content: `<rect width="1080" height="1080" fill="#050508"/><rect width="1080" height="1080" fill="url(#aura)"/>
      ${brandLockup(58, 50, 68, iconData)}
      <text x="58" y="232" fill="#C4B5FD" font-family="IBM Plex Mono" font-size="22" font-weight="700" letter-spacing="4">Illustrative Call Sheet</text>
      <text x="54" y="352" fill="#F8F7FC" font-family="Inter Tight" font-size="102" font-weight="800" letter-spacing="-2.48">Bad Timing.</text>
      <g font-family="IBM Plex Mono" font-size="24" font-weight="700" letter-spacing="1.8">
        <text x="58" y="492" fill="#B6B1C6">8:03 PM</text><text x="230" y="492" fill="#F8F7FC">Hands Full</text><text x="1008" y="492" fill="#6A6673" text-anchor="end">Ringing</text>
        <path d="M58 526 H1022" stroke="#2B2834" stroke-width="2"/>
        <text x="58" y="610" fill="#B6B1C6">8:06 PM</text><text x="230" y="610" fill="#F8F7FC">With a Customer</text><text x="1008" y="610" fill="#6A6673" text-anchor="end">Ringing</text>
        <path d="M58 644 H1022" stroke="#2B2834" stroke-width="2"/>
        <text x="58" y="728" fill="#B6B1C6">8:10 PM</text><text x="230" y="728" fill="#F8F7FC">Under the Hood</text><text x="1008" y="728" fill="#6A6673" text-anchor="end">Ringing</text>
        <path d="M58 762 H1022" stroke="#A78BFA" stroke-width="3"/>
        <text x="58" y="846" fill="#C4B5FD">8:12 PM</text><text x="230" y="846" fill="#A78BFA">Your Bot</text><text x="1008" y="846" fill="#F8F7FC" text-anchor="end">Answered</text>
      </g>
      <text x="58" y="956" fill="#F8F7FC" font-family="Inter Tight" font-size="43" font-weight="800">The Phone Doesn't Wait.</text>
      <text x="58" y="1018" fill="#B6B1C6" font-family="Inter" font-size="26" font-weight="600">Start Free at BotBound.app</text>
      <text x="58" y="1052" fill="#B6B1C6" font-family="Inter" font-size="18">Private rehearsal. Paid live activation.</text>`,
  }),
  1080,
);

writePng(
  "email/botbound-launch-email-header-1200x400.png",
  frame({
    width: 1200,
    height: 400,
    title: "Put Your Bot on the Line",
    description: "BotBound launch email header with the approved operator.",
    defs: canvasDefs(),
    content: `<rect width="1200" height="400" fill="url(#canvas)"/><rect width="1200" height="400" fill="url(#aura)"/>
      ${wordmark(52, 68, 42)}
      <text x="50" y="178" fill="#F8F7FC" font-family="Inter Tight" font-size="70" font-weight="800" letter-spacing="-1.66"><tspan x="50">Put Your Bot</tspan><tspan x="50" dy="70">on the <tspan fill="#A78BFA">Line.</tspan></tspan></text>
      <text x="54" y="344" fill="#B6B1C6" font-family="Inter" font-size="24" font-weight="600">Bots for calls, texts, and email.</text>
      ${signalRings(965, 188, 92, 4)}<image href="${operatorData}" x="792" y="-44" width="456" height="456"/>`,
  }),
  1200,
);

const contactAssets = [
  ["Hands Full", "social/botbound-hands-full-linkedin-1200x627.png"],
  ["Bad Timing", "social/botbound-impeccably-bad-timing-feed-1080x1350.png"],
  ["The Signal", "billboard/botbound-second-ring-signal-billboard-3840x2160.png"],
  ["Voice Choice", "voice-carousel/botbound-openai-voices-02-1080x1350.png"],
  ["Voice Consistency", "voice-carousel/botbound-openai-voices-04-1080x1350.png"],
  ["Connected Channels", "social/botbound-ring-to-next-action-1200x627.png"],
];
const tiles = contactAssets
  .map(([label, relativePath], index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = 54 + col * 620;
    const y = 190 + row * 620;
    const imageData = dataUri(resolve(outputRoot, relativePath));
    return `<rect x="${x}" y="${y}" width="570" height="520" rx="30" fill="#111018" stroke="rgba(196,181,253,.2)"/>
      <image href="${imageData}" x="${x + 20}" y="${y + 20}" width="530" height="420" preserveAspectRatio="xMidYMid meet"/>
      <text x="${x + 24}" y="${y + 482}" fill="#F8F7FC" font-family="IBM Plex Mono" font-size="22" font-weight="700" letter-spacing="3">${label}</text>`;
  })
  .join("");

writePng(
  "contact-sheet/botbound-launch-campaign-contact-sheet-1920x1400.png",
  frame({
    width: 1920,
    height: 1400,
    title: "BotBound Launch Campaign Contact Sheet",
    description: "A review sheet for The Second Ring launch campaign system.",
    defs: canvasDefs(),
    content: `<rect width="1920" height="1400" fill="url(#canvas)"/>
      ${brandLockup(58, 54, 72, iconData)}
      <text x="1860" y="88" fill="#B6B1C6" font-family="IBM Plex Mono" font-size="18" font-weight="700" text-anchor="end" letter-spacing="3">The Second Ring · September 2026</text>
      ${tiles}`,
  }),
  1920,
);

console.log(`Launch perfection assets rendered from ${badTimingSource}`);

const releaseOg = resolve(outputRoot, "brand/botbound-og-image-1200x630.png");
mkdirSync(dirname(releaseOg), { recursive: true });
copyFileSync(reviewedOg, releaseOg);
console.log("Copied current product OG into the release brand folder.");
