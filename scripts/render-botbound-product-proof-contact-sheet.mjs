import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Resvg } from "@resvg/resvg-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const proofRoot = resolve(root, "brand-work/launch-2026-09/exports/product-proof");
const output = resolve(proofRoot, "botbound-exact-worktree-proof-contact-sheet-1920x1400.png");
const fontFiles = [
  resolve(root, "brand-work/fonts/InterTight-ExtraBold.ttf"),
  resolve(root, "brand-work/fonts/Inter-Regular.ttf"),
  resolve(root, "brand-work/fonts/Inter-Bold.ttf"),
  resolve(root, "brand-work/fonts/IBMPlexMono-Bold.ttf"),
];

const frames = [
  ["HOME · DESKTOP", "01-home-desktop-1600x1000-exact-worktree-preview.png"],
  ["HOME · MOBILE", "02-home-mobile-hero-430x630-exact-worktree-preview.png"],
  ["FEATURES · DESKTOP", "03-features-desktop-1600x1000-exact-worktree-preview.png"],
  ["FEATURES · MOBILE", "04-features-mobile-430x932-exact-worktree-preview.png"],
  ["PRICING · DESKTOP", "05-pricing-desktop-1600x1000-exact-worktree-preview.png"],
  ["PRICING · MOBILE", "06-pricing-mobile-430x932-exact-worktree-preview.png"],
];

const tileMarkup = frames
  .map(([label, filename], index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = 52 + col * 620;
    const y = 214 + row * 574;
    const data = readFileSync(resolve(proofRoot, filename)).toString("base64");
    return `<rect x="${x}" y="${y}" width="574" height="530" rx="26" fill="#111018" stroke="#3A334B" stroke-width="2"/>
      <image href="data:image/png;base64,${data}" x="${x + 18}" y="${y + 18}" width="538" height="438" preserveAspectRatio="xMidYMid meet"/>
      <text x="${x + 24}" y="${y + 494}" fill="#F5F4F8" font-family="IBM Plex Mono" font-size="19" font-weight="700" letter-spacing="2.4">${label}</text>`;
  })
  .join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1400" viewBox="0 0 1920 1400">
  <defs>
    <radialGradient id="signal" cx="72%" cy="0%" r="95%"><stop offset="0" stop-color="#261B41"/><stop offset="0.55" stop-color="#0A0A0E"/><stop offset="1" stop-color="#050508"/></radialGradient>
  </defs>
  <rect width="1920" height="1400" fill="url(#signal)"/>
  <text x="54" y="74" fill="#C4B5FD" font-family="IBM Plex Mono" font-size="17" font-weight="700" letter-spacing="3.6">BOTBOUND · RELEASE PREVIEW · 2026-09-01</text>
  <text x="52" y="142" fill="#F5F4F8" font-family="Inter Tight" font-size="54" font-weight="800" letter-spacing="-2">EXACT WORKTREE PREVIEW</text>
  <text x="52" y="183" fill="#A78BFA" font-family="Inter" font-size="24" font-weight="700">Not deployed production · public surfaces only · dirty worktree at 13fd4807</text>
  ${tileMarkup}
  <line x1="54" y1="1326" x2="1866" y2="1326" stroke="#8B5CF6" stroke-width="3"/>
  <text x="54" y="1366" fill="#B6B1C6" font-family="Inter" font-size="18">Authenticated Studio proof intentionally omitted. See the adjacent JSON manifest and README for capture boundaries.</text>
</svg>`;

const png = new Resvg(svg, {
  fitTo: { mode: "width", value: 1920 },
  font: { fontFiles, loadSystemFonts: false, defaultFontFamily: "Inter" },
}).render().asPng();

writeFileSync(output, png);
console.log(output);
