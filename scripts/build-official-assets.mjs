/**
 * Build official Wireline marketing, app-store, social, and ad assets from
 * production or an explicitly supplied E2E_BASE_URL.
 *
 *   node scripts/build-official-assets.mjs
 *
 * Outputs: official-assets/
 *   web/ app-store/ social/ ads/ reels/ copy/
 */
import { chromium } from "@playwright/test";
import { chromiumLaunchOptions } from "./lib/resolve-preinstalled-chromium.mjs";
import { readFileSync, existsSync } from "node:fs";
import { mkdir, rm, writeFile, copyFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  requireCanonicalCredentialTarget,
  requireCompleteCredentialPair,
} from "./dogfood-credentials.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = path.join(repoRoot, "official-assets");
const visualQa = path.join(repoRoot, "visual-qa");
const marketingKit = path.join(repoRoot, "marketing-kit");

function loadEnv(filePath) {
  try {
    const text = readFileSync(filePath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.startsWith("#")) continue;
      const i = line.indexOf("=");
      if (i < 0) continue;
      const key = line.slice(0, i).trim();
      let value = line.slice(i + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // Optional local file.
  }
}

loadEnv(path.join(repoRoot, ".env.visual-qa"));

const baseUrl = new URL(requireCanonicalCredentialTarget(process.env.E2E_BASE_URL));
const { email, password } = requireCompleteCredentialPair(
  [
    { label: "DEMO", email: process.env.DEMO_EMAIL, password: process.env.DEMO_PASSWORD },
    {
      label: "DOGFOOD",
      email: process.env.DOGFOOD_EMAIL,
      password: process.env.DOGFOOD_PASSWORD,
    },
    {
      label: "WIRELINE_E2E",
      email: process.env.WIRELINE_E2E_EMAIL,
      password: process.env.WIRELINE_E2E_PASSWORD,
    },
    {
      label: "E2E_USER",
      email: process.env.E2E_USER_EMAIL,
      password: process.env.E2E_USER_PASSWORD,
    },
  ],
  "Set DEMO_EMAIL/DEMO_PASSWORD or one complete documented E2E credential pair.",
);

function appUrl(route) {
  return new URL(route, baseUrl).toString();
}

function parseSetCookie(header) {
  const [pair, ...attrs] = header.split(";").map((part) => part.trim());
  const eq = pair.indexOf("=");
  if (eq <= 0) return null;

  const cookie = {
    name: pair.slice(0, eq),
    value: pair.slice(eq + 1),
    expires: Math.floor(Date.now() / 1000) + 7200,
  };

  for (const attr of attrs) {
    const [key, value] = attr.split("=");
    if (key.toLowerCase() === "max-age" && value) {
      cookie.expires = Math.floor(Date.now() / 1000) + Number(value);
    }
  }
  return cookie;
}

function responseSetCookies(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const combined = headers.get("set-cookie");
  return combined ? [combined] : [];
}

async function signIn() {
  const res = await fetch(appUrl("/api/auth/signin"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  const cookie = responseSetCookies(res.headers)
    .map(parseSetCookie)
    .find((candidate) => candidate?.name === "wireline_session");

  if (!res.ok || !data.user || !cookie) {
    throw new Error(`Asset capture sign-in failed with HTTP ${res.status}.`);
  }
  return cookie;
}

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

async function copyIfExists(src, dest) {
  if (!existsSync(src)) return false;
  await ensureDir(path.dirname(dest));
  await copyFile(src, dest);
  return true;
}

async function captureSized(page, route, file, size, fullPage = false) {
  await page.setViewportSize(size);
  await page.goto(appUrl(route), { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(1800);

  for (const selector of [
    'button:has-text("Skip")',
    'button:has-text("Got it")',
    '[aria-label="Close"]',
    'button:has-text("Not now")',
    'button:has-text("Dismiss")',
  ]) {
    const control = page.locator(selector).first();
    if (await control.isVisible().catch(() => false)) {
      await control.click().catch(() => {});
    }
  }

  await page.waitForTimeout(500);
  await ensureDir(path.dirname(file));
  await page.screenshot({ path: file, fullPage, animations: "disabled" });
}

async function captureProductAssets(page) {
  const web = path.join(outRoot, "web");
  await captureSized(page, "/", path.join(web, "og-1200x630.png"), {
    width: 1200,
    height: 630,
  });
  await captureSized(page, "/", path.join(web, "hero-1920x1080.png"), {
    width: 1920,
    height: 1080,
  });
  await captureSized(page, "/pricing", path.join(web, "pricing-1920x1080.png"), {
    width: 1920,
    height: 1080,
  });
  await captureSized(page, "/showcase", path.join(web, "showcase-1920x1080.png"), {
    width: 1920,
    height: 1080,
  });
  await captureSized(page, "/compare", path.join(web, "compare-1920x1080.png"), {
    width: 1920,
    height: 1080,
  });
  await captureSized(page, "/for/sales", path.join(web, "vertical-sales-1920x1080.png"), {
    width: 1920,
    height: 1080,
  });
  console.log("✓ web");

  const store = path.join(outRoot, "app-store");
  for (const [route, name] of [
    ["/overview", "iphone-6.7-01-overview.png"],
    ["/studio", "iphone-6.7-02-studio.png"],
    ["/phone", "iphone-6.7-03-phone.png"],
    ["/insights", "iphone-6.7-04-insights.png"],
    ["/approvals", "iphone-6.7-05-approvals.png"],
    ["/connections", "iphone-6.7-06-connections.png"],
  ]) {
    await captureSized(page, route, path.join(store, name), { width: 430, height: 932 });
  }
  for (const [route, name] of [
    ["/overview", "ipad-12.9-01-overview.png"],
    ["/studio", "ipad-12.9-02-studio.png"],
    ["/phone", "ipad-12.9-03-phone.png"],
  ]) {
    await captureSized(page, route, path.join(store, name), { width: 1024, height: 1366 });
  }
  for (const [route, name] of [
    ["/overview", "android-phone-01-overview.png"],
    ["/studio", "android-phone-02-studio.png"],
    ["/phone", "android-phone-03-phone.png"],
  ]) {
    await captureSized(page, route, path.join(store, name), { width: 412, height: 915 });
  }
  console.log("✓ app-store");

  const social = path.join(outRoot, "social");
  await captureSized(page, "/", path.join(social, "instagram-feed-1080.png"), {
    width: 1080,
    height: 1080,
  });
  await captureSized(page, "/pricing", path.join(social, "instagram-feed-pricing-1080.png"), {
    width: 1080,
    height: 1080,
  });
  await captureSized(page, "/overview", path.join(social, "linkedin-1200x627.png"), {
    width: 1200,
    height: 627,
  });
  await captureSized(page, "/studio", path.join(social, "linkedin-studio-1200x627.png"), {
    width: 1200,
    height: 627,
  });
  await captureSized(page, "/", path.join(social, "twitter-x-1600x900.png"), {
    width: 1600,
    height: 900,
  });
  await captureSized(page, "/showcase", path.join(social, "facebook-1200x630.png"), {
    width: 1200,
    height: 630,
  });
  console.log("✓ social");

  const ads = path.join(outRoot, "ads");
  await captureSized(page, "/", path.join(ads, "meta-feed-1080.png"), {
    width: 1080,
    height: 1080,
  });
  await captureSized(page, "/pricing", path.join(ads, "meta-feed-pricing-1080.png"), {
    width: 1080,
    height: 1080,
  });
  await captureSized(page, "/overview", path.join(ads, "meta-story-1080x1920.png"), {
    width: 1080,
    height: 1920,
  });
  await captureSized(page, "/studio", path.join(ads, "meta-story-studio-1080x1920.png"), {
    width: 1080,
    height: 1920,
  });
  await captureSized(page, "/", path.join(ads, "google-landscape-1200x628.png"), {
    width: 1200,
    height: 628,
  });
  await captureSized(page, "/for/sales", path.join(ads, "google-square-1200.png"), {
    width: 1200,
    height: 1200,
  });
  await captureSized(page, "/phone", path.join(ads, "linkedin-ad-1200x627.png"), {
    width: 1200,
    height: 627,
  });
  console.log("✓ ads");

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
  for (const item of reelRoutes) {
    await captureSized(page, item.route, path.join(reels, `still-${item.id}.png`), {
      width: 1080,
      height: 1920,
    });
  }
  console.log("✓ reels stills");
}

async function copyExistingProductMedia() {
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
  for (const [relativePath, name] of galleryMap) {
    await copyIfExists(path.join(repoRoot, relativePath), path.join(gallery, name));
  }

  const videoOut = path.join(outRoot, "videos");
  await ensureDir(videoOut);
  const kitVideos = path.join(marketingKit, "videos");
  if (!existsSync(kitVideos)) return;

  for (const file of await readdir(kitVideos)) {
    if (file.endsWith(".webm") || file.endsWith(".mp4")) {
      await copyFile(path.join(kitVideos, file), path.join(videoOut, file));
    }
  }
}

async function writeCopyPack() {
  const copyMd = `# Wireline official asset pack

Generated ${new Date().toISOString()} from ${baseUrl.origin} as ${email}.

## Folders

| Folder | Use |
|--------|-----|
| \`web/\` | Website OG, hero, pricing, showcase, compare |
| \`app-store/\` | App Store and Play Store screenshots for iPhone, iPad, and Android |
| \`social/\` | Instagram, LinkedIn, X, and Facebook |
| \`ads/\` | Meta feed and story, Google Display, and LinkedIn ads |
| \`reels/\` | 9:16 stills for Reels, TikTok, and Stories |
| \`videos/\` | Screen recordings ready for editing |
| \`product-gallery/\` | Selected product UI stills from visual QA |

## Suggested captions

### LinkedIn
Wire your agent. Choose outbound, inbound, or hybrid. One trained agent. One visible outcome.
Start free at trywireline.com.

### Instagram and Reels hook
"Your phone operation should not live in five tabs."
Cut: Home, Overview, Studio, Phone, Pricing
CTA: Link in bio

### Meta ad primary text
Create and train a voice agent for free. Live work draws from prepaid Runtime Balance.
Free Builder, Starter, Starter Plus, and Pro. Scale is custom. Clear rates. No surprise math.

### App Store subtitle
Voice agents for sales and support

### App Store promo text
Wireline trains outbound and inbound agents that book meetings, update your systems, and keep a clean outcome record.

## Notes
- Prefer \`product-gallery/desktop-*\` for SaaS website screenshots.
- Prefer \`app-store/iphone-*\` for mobile store listings.
- Convert \`videos/*.webm\` to H.264 MP4 before social upload.
`;

  await writeFile(path.join(outRoot, "README.md"), copyMd, "utf8");
  await ensureDir(path.join(outRoot, "copy"));
  await writeFile(path.join(outRoot, "copy", "captions.md"), copyMd, "utf8");
}

async function main() {
  console.log(`Building official assets from ${baseUrl.origin}`);
  await rm(outRoot, { recursive: true, force: true });
  await ensureDir(outRoot);

  const cookie = await signIn();
  const browser = await chromium.launch({ headless: true, ...chromiumLaunchOptions() });
  try {
    const context = await browser.newContext({
      reducedMotion: "reduce",
      deviceScaleFactor: 2,
    });
    await context.addCookies([
      {
        name: cookie.name,
        value: cookie.value,
        url: baseUrl.origin,
        httpOnly: true,
        secure: baseUrl.protocol === "https:",
        sameSite: "Lax",
        expires: cookie.expires,
      },
    ]);
    await context.addInitScript(() => {
      localStorage.setItem("wireline_cookie_consent", "acknowledged");
      localStorage.setItem("wireline_tour_seen", "true");
      localStorage.setItem("wireline_onboarding_completed", "true");
    });

    const page = await context.newPage();
    await captureProductAssets(page);
  } finally {
    await browser.close();
  }

  await copyExistingProductMedia();
  await writeCopyPack();
  console.log(`Done: ${outRoot}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
