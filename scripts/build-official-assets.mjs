/**
 * Build official Wireline marketing / app-store / social / ad assets
 * from the latest visual-qa + marketing-kit captures.
 *
 *   node scripts/build-official-assets.mjs
 *
 * Outputs: official-assets/
 *   web/ app-store/ social/ ads/ reels/ copy/
 * Also mirrors a zip to ~/Downloads.
 */
import { chromium } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { mkdir, rm, writeFile, copyFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = path.join(repoRoot, "official-assets");
const visualQa = path.join(repoRoot, "visual-qa");
const marketingKit = path.join(repoRoot, "marketing-kit");
const downloadsDir = path.join(homedir(), "Downloads");

function loadEnv(filePath) {
  try {
    const text = readFileSync(filePath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.startsWith("#")) continue;
      const i = line.indexOf("=");
      if (i < 0) continue;
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch {}
}
loadEnv(path.join(repoRoot, ".env.visual-qa"));

const baseURL = process.env.E2E_BASE_URL || "https://trywireline.com";
const email =
  process.env.DEMO_EMAIL ||
  process.env.DOGFOOD_EMAIL ||
  process.env.WIRELINE_E2E_EMAIL ||
  process.env.E2E_USER_EMAIL ||
  "";
const password =
  process.env.DEMO_PASSWORD ||
  process.env.DOGFOOD_PASSWORD ||
  process.env.WIRELINE_E2E_PASSWORD ||
  process.env.E2E_USER_PASSWORD ||
  "";

function parseSetCookie(header) {
  const [pair, ...attrs] = header.split(";").map((s) => s.trim());
  const eq = pair.indexOf("=");
  const cookie = { name: pair.slice(0, eq), value: pair.slice(eq + 1), path: "/", expires: Math.floor(Date.now() / 1000) + 7200 };
  for (const a of attrs) {
    const [k, v] = a.split("=");
    if (k.toLowerCase() === "max-age" && v) cookie.expires = Math.floor(Date.now() / 1000) + Number(v);
  }
  return cookie;
}

async function signIn() {
  const res = await fetch(`${baseURL}/api/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  const cookie = res.headers.getSetCookie().map(parseSetCookie).find((c) => c.name === "wireline_session");
  if (!data.user || !cookie) throw new Error("signin failed");
  return cookie;
}

async function ensureDir(p) {
  await mkdir(p, { recursive: true });
}

async function copyIfExists(src, dest) {
  if (!existsSync(src)) return false;
  await ensureDir(path.dirname(dest));
  await copyFile(src, dest);
  return true;
}

async function captureSized(page, route, file, size, fullPage = false) {
  await page.setViewportSize(size);
  await page.goto(`${baseURL}${route}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(1800);
  for (const sel of ['button:has-text("Skip")', 'button:has-text("Got it")', '[aria-label="Close"]', 'button:has-text("Not now")', 'button:has-text("Dismiss")']) {
    const el = page.locator(sel).first();
    if (await el.isVisible().catch(() => false)) await el.click().catch(() => {});
  }
  await page.waitForTimeout(500);
  await ensureDir(path.dirname(file));
  await page.screenshot({ path: file, fullPage, animations: "disabled" });
}

async function main() {
  console.log("Building official assets…");
  await rm(outRoot, { recursive: true, force: true });
  await ensureDir(outRoot);

  const cookie = await signIn();
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    reducedMotion: "reduce",
    deviceScaleFactor: 2,
  });
  await ctx.addCookies([
    {
      name: cookie.name,
      value: cookie.value,
      domain: "trywireline.com",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      expires: cookie.expires,
    },
  ]);
  await ctx.addInitScript(() => {
    localStorage.setItem("wireline_cookie_consent", "acknowledged");
    localStorage.setItem("wireline_tour_seen", "true");
    localStorage.setItem("wireline_onboarding_completed", "true");
  });
  const page = await ctx.newPage();

  // --- Web hero / OG / landing ---
  const web = path.join(outRoot, "web");
  await captureSized(page, "/", path.join(web, "og-1200x630.png"), { width: 1200, height: 630 });
  await captureSized(page, "/", path.join(web, "hero-1920x1080.png"), { width: 1920, height: 1080 });
  await captureSized(page, "/pricing", path.join(web, "pricing-1920x1080.png"), { width: 1920, height: 1080 });
  await captureSized(page, "/showcase", path.join(web, "showcase-1920x1080.png"), { width: 1920, height: 1080 });
  await captureSized(page, "/compare", path.join(web, "compare-1920x1080.png"), { width: 1920, height: 1080 });
  await captureSized(page, "/for/sales", path.join(web, "vertical-sales-1920x1080.png"), { width: 1920, height: 1080 });
  console.log("✓ web");

  // --- App Store / Play Store ---
  const store = path.join(outRoot, "app-store");
  // iPhone 6.7" ~1290x2796 @3x marketing stills (capture at logical then note)
  await captureSized(page, "/overview", path.join(store, "iphone-6.7-01-overview.png"), { width: 430, height: 932 });
  await captureSized(page, "/studio", path.join(store, "iphone-6.7-02-studio.png"), { width: 430, height: 932 });
  await captureSized(page, "/phone", path.join(store, "iphone-6.7-03-phone.png"), { width: 430, height: 932 });
  await captureSized(page, "/insights", path.join(store, "iphone-6.7-04-insights.png"), { width: 430, height: 932 });
  await captureSized(page, "/approvals", path.join(store, "iphone-6.7-05-approvals.png"), { width: 430, height: 932 });
  await captureSized(page, "/connections", path.join(store, "iphone-6.7-06-connections.png"), { width: 430, height: 932 });
  // iPad 12.9"
  await captureSized(page, "/overview", path.join(store, "ipad-12.9-01-overview.png"), { width: 1024, height: 1366 });
  await captureSized(page, "/studio", path.join(store, "ipad-12.9-02-studio.png"), { width: 1024, height: 1366 });
  await captureSized(page, "/phone", path.join(store, "ipad-12.9-03-phone.png"), { width: 1024, height: 1366 });
  // Android phone
  await captureSized(page, "/overview", path.join(store, "android-phone-01-overview.png"), { width: 412, height: 915 });
  await captureSized(page, "/studio", path.join(store, "android-phone-02-studio.png"), { width: 412, height: 915 });
  await captureSized(page, "/phone", path.join(store, "android-phone-03-phone.png"), { width: 412, height: 915 });
  console.log("✓ app-store");

  // --- Social ---
  const social = path.join(outRoot, "social");
  await captureSized(page, "/", path.join(social, "instagram-feed-1080.png"), { width: 1080, height: 1080 });
  await captureSized(page, "/pricing", path.join(social, "instagram-feed-pricing-1080.png"), { width: 1080, height: 1080 });
  await captureSized(page, "/overview", path.join(social, "linkedin-1200x627.png"), { width: 1200, height: 627 });
  await captureSized(page, "/studio", path.join(social, "linkedin-studio-1200x627.png"), { width: 1200, height: 627 });
  await captureSized(page, "/", path.join(social, "twitter-x-1600x900.png"), { width: 1600, height: 900 });
  await captureSized(page, "/showcase", path.join(social, "facebook-1200x630.png"), { width: 1200, height: 630 });
  console.log("✓ social");

  // --- Ads ---
  const ads = path.join(outRoot, "ads");
  await captureSized(page, "/", path.join(ads, "meta-feed-1080.png"), { width: 1080, height: 1080 });
  await captureSized(page, "/pricing", path.join(ads, "meta-feed-pricing-1080.png"), { width: 1080, height: 1080 });
  await captureSized(page, "/overview", path.join(ads, "meta-story-1080x1920.png"), { width: 1080, height: 1920 });
  await captureSized(page, "/studio", path.join(ads, "meta-story-studio-1080x1920.png"), { width: 1080, height: 1920 });
  await captureSized(page, "/", path.join(ads, "google-landscape-1200x628.png"), { width: 1200, height: 628 });
  await captureSized(page, "/for/sales", path.join(ads, "google-square-1200.png"), { width: 1200, height: 1200 });
  await captureSized(page, "/phone", path.join(ads, "linkedin-ad-1200x627.png"), { width: 1200, height: 627 });
  console.log("✓ ads");

  // --- Reels / Stories stills (9:16) ---
  const reels = path.join(outRoot, "reels");
  const reelRoutes = [
    { id: "01-home", route: "/" },
    { id: "02-overview", route: "/overview" },
    { id: "03-studio", route: "/studio" },
    { id: "04-phone", route: "/phone" },
    { id: "05-connections", route: "/connections" },
    { id: "06-pricing", route: "/pricing" },
    { id: "07-showcase", route: "/showcase" },
    { id: "08-sales", route: "/for/sales" },
  ];
  for (const r of reelRoutes) {
    await captureSized(page, r.route, path.join(reels, `still-${r.id}.png`), { width: 1080, height: 1920 });
  }
  console.log("✓ reels stills");

  await browser.close();

  // Pull best screenshots from visual-qa / marketing-kit if present
  const gallery = path.join(outRoot, "product-gallery");
  await ensureDir(gallery);
  const galleryMap = [
    ["visual-qa/settled/desktop/overview.png", "desktop-overview.png"],
    ["visual-qa/settled/desktop/studio.png", "desktop-studio.png"],
    ["visual-qa/settled/desktop/phone.png", "desktop-phone.png"],
    ["visual-qa/settled/desktop/approvals.png", "desktop-approvals.png"],
    ["visual-qa/settled/desktop/connections.png", "desktop-connections.png"],
    ["visual-qa/settled/desktop/insights.png", "desktop-insights.png"],
    ["visual-qa/settled/desktop/inbox.png", "desktop-inbox.png"],
    ["visual-qa/settled/mobile/overview.png", "mobile-overview.png"],
    ["visual-qa/settled/mobile/studio.png", "mobile-studio.png"],
    ["visual-qa/settled/mobile/phone.png", "mobile-phone.png"],
    ["visual-qa/settled/mobile/approvals.png", "mobile-approvals.png"],
    ["visual-qa/marketing/desktop/home.png", "marketing-home.png"],
    ["visual-qa/marketing/desktop/pricing.png", "marketing-pricing.png"],
    ["visual-qa/marketing/desktop/showcase.png", "marketing-showcase.png"],
    ["visual-qa/marketing/mobile/home.png", "marketing-home-mobile.png"],
    ["marketing-kit/screenshots/desktop/overview.png", "kit-overview.png"],
    ["marketing-kit/screenshots/reel/overview.png", "kit-reel-overview.png"],
  ];
  for (const [rel, name] of galleryMap) {
    await copyIfExists(path.join(repoRoot, rel), path.join(gallery, name));
  }

  // Copy videos from marketing-kit if any
  const videoOut = path.join(outRoot, "videos");
  await ensureDir(videoOut);
  const kitVideos = path.join(marketingKit, "videos");
  if (existsSync(kitVideos)) {
    for (const f of await readdir(kitVideos)) {
      if (f.endsWith(".webm") || f.endsWith(".mp4")) {
        await copyFile(path.join(kitVideos, f), path.join(videoOut, f));
      }
    }
  }

  const copyMd = `# Wireline official asset pack

Generated ${new Date().toISOString()} from production (${baseURL}) as ${email}.

## Folders

| Folder | Use |
|--------|-----|
| \`web/\` | Website OG, hero, pricing, showcase, compare |
| \`app-store/\` | App Store / Play Store screenshots (iPhone, iPad, Android) |
| \`social/\` | Instagram, LinkedIn, X/Twitter, Facebook |
| \`ads/\` | Meta feed/story, Google Display, LinkedIn ads |
| \`reels/\` | 9:16 stills for Reels / TikTok / Stories |
| \`videos/\` | Screen-recorded webm reels (import to CapCut/Premiere) |
| \`product-gallery/\` | Best product UI stills from visual QA |

## Suggested captions

### LinkedIn
Wire your agent. Outbound, inbound, or hybrid — one trained line, one visible outcome.
Start free → trywireline.com

### Instagram / Reels hook (15s)
"Your phone operation shouldn't live in five tabs."
Cut: Home → Overview → Studio → Phone → Pricing
CTA: Link in bio

### Meta ad primary text
Create and train a phone agent for free. Live work draws from Conversation Balance.
Personal · Team · Business — clear rates, no surprise math.

### App Store subtitle
AI phone agents for sales & support

### App Store promo text
Wireline trains outbound and inbound agents that book meetings, log CRM, and keep a clean outcome ledger.

## Notes
- Prefer \`product-gallery/desktop-*\` for SaaS website screenshots.
- Prefer \`app-store/iphone-*\` for mobile store listings.
- Convert \`videos/*.webm\` to H.264 MP4 in CapCut for Instagram/TikTok upload.
`;
  await writeFile(path.join(outRoot, "README.md"), copyMd, "utf8");
  await ensureDir(path.join(outRoot, "copy"));
  await writeFile(path.join(outRoot, "copy", "captions.md"), copyMd, "utf8");

  console.log(`Done → ${outRoot}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
