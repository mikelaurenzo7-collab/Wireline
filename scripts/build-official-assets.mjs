/**
 * Build official BotBound marketing, app-store, social, and ad assets from
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
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CAMPAIGN_VO,
  assertGeneratedMp3,
  campaignTrackFingerprintFromProvenance,
} from "./generate-campaign-vo.mjs";
import { audioProvenanceMatches, readAudioProvenance } from "./lib/audio-provenance.mjs";
import { verifyCertifiedMediaRecord } from "./lib/certified-media.mjs";
import {
  assertCleanCheckout,
  resolveSourceCommit,
  verifyRemoteSourceCommit,
} from "./lib/release-source-verification.mjs";
import {
  requireCanonicalCredentialTarget,
  requireCompleteCredentialPair,
} from "./dogfood-credentials.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = path.join(repoRoot, "official-assets");
const marketingKit = path.join(repoRoot, "marketing-kit");
const generatedOutputNames = [
  "web",
  "app-store",
  "social",
  "ads",
  "reels",
  "copy",
  "videos",
  "product-gallery",
  "README.md",
];

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

async function copyExistingProductMedia(sourceCommit) {
  const releaseRecordPath = path.join(marketingKit, "release-record.json");
  if (!existsSync(releaseRecordPath)) {
    console.log("Skipping optional marketing-kit media: no certified release record.");
    return;
  }
  const releaseRecord = JSON.parse(readFileSync(releaseRecordPath, "utf8"));
  if (releaseRecord.publishable !== true || !/^[0-9a-f]{40}$/i.test(releaseRecord.sourceCommit)) {
    throw new Error(
      "Marketing-kit media is not release-certified and cannot enter official assets.",
    );
  }
  if (sourceCommit !== releaseRecord.sourceCommit.toLowerCase()) {
    throw new Error(
      `Certified marketing-kit media is from ${releaseRecord.sourceCommit}, not the current checkout ${sourceCommit}.`,
    );
  }

  const gallery = path.join(outRoot, "product-gallery");
  await ensureDir(gallery);
  const galleryMap = [
    {
      layout: "desktop",
      path: "marketing-kit/screenshots/desktop/overview.png",
      name: "kit-overview.png",
    },
    {
      layout: "reel",
      path: "marketing-kit/screenshots/reel/overview.png",
      name: "kit-reel-overview.png",
    },
  ];
  const screenshotLayouts = Array.isArray(releaseRecord.authenticatedScreenshots)
    ? releaseRecord.authenticatedScreenshots
    : [];
  for (const selected of galleryMap) {
    const layouts = screenshotLayouts.filter((record) => record?.layout === selected.layout);
    if (layouts.length !== 1 || !Array.isArray(layouts[0].frames)) {
      throw new Error(`Certified ${selected.layout} screenshot records are missing or ambiguous.`);
    }
    const frames = layouts[0].frames.filter((record) => record?.id === "overview");
    if (frames.length !== 1) {
      throw new Error(`Certified ${selected.layout} overview screenshot is missing or ambiguous.`);
    }
    const verifiedBytes = await verifyCertifiedMediaRecord(frames[0], {
      repoRoot,
      marketingRoot: marketingKit,
      expectedPath: selected.path,
      allowedExtensions: [".png"],
      minSizeBytes: 1_024,
    });
    await writeFile(path.join(gallery, selected.name), verifiedBytes);
  }

  const videoOut = path.join(outRoot, "videos");
  await ensureDir(videoOut);
  const videoRecords = Array.isArray(releaseRecord.videos) ? releaseRecord.videos : [];
  if (videoRecords.length !== 3) {
    throw new Error(`Expected exactly 3 certified launch videos; found ${videoRecords.length}.`);
  }
  const expectedVideos = [
    "reel-46s-master-walkthrough",
    "reel-30s-product-loop",
    "reel-15s-missed-call",
  ].map((id) => ({ id, path: `marketing-kit/videos/${id}.webm` }));
  for (const expected of expectedVideos) {
    const records = videoRecords.filter((record) => record?.id === expected.id);
    if (records.length !== 1) {
      throw new Error(`Certified launch video ${expected.id} is missing or ambiguous.`);
    }
    const verifiedBytes = await verifyCertifiedMediaRecord(records[0], {
      repoRoot,
      marketingRoot: marketingKit,
      expectedPath: expected.path,
      allowedExtensions: [".webm"],
      minSizeBytes: 100_000,
    });
    await writeFile(path.join(videoOut, path.posix.basename(expected.path)), verifiedBytes);
  }
}

async function relativeFiles(root, prefix = "") {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const relativePath = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await relativeFiles(path.join(root, entry.name), relativePath)));
    } else {
      files.push(relativePath);
    }
  }
  return files;
}

async function validatePreservedCampaignAudio() {
  const audioRoot = path.join(outRoot, "audio");
  if (!existsSync(audioRoot)) return;

  const expected = new Map();
  for (const { engine, prefix } of [
    { engine: "elevenlabs", prefix: "" },
    { engine: "xai", prefix: "xai" },
  ]) {
    for (const track of CAMPAIGN_VO) {
      const relativePath = path.posix.join(prefix, track.file);
      expected.set(relativePath, { track, engine });
    }
  }

  const actualFiles = await relativeFiles(audioRoot);
  const allowedFiles = new Set([...expected.keys()].flatMap((audio) => [audio, `${audio}.sha256`]));
  const unexpected = actualFiles.filter((file) => !allowedFiles.has(file));
  if (unexpected.length) {
    throw new Error(`Unexpected campaign audio cannot survive rebuild: ${unexpected.join(", ")}`);
  }

  for (const [relativePath, recipe] of expected) {
    const audioPath = path.join(audioRoot, ...relativePath.split("/"));
    const hasAudio = existsSync(audioPath);
    const hasProvenance = existsSync(`${audioPath}.sha256`);
    if (hasAudio !== hasProvenance) {
      throw new Error(`Campaign audio is missing its matching provenance pair: ${relativePath}`);
    }
    if (hasAudio) {
      const provenance = await readAudioProvenance(audioPath);
      let fingerprint;
      try {
        fingerprint = campaignTrackFingerprintFromProvenance({
          track: recipe.track,
          expectedEngine: recipe.engine,
          provenance,
        });
      } catch {
        throw new Error(`Campaign audio provenance is stale or corrupt: ${relativePath}`);
      }
      if (!(await audioProvenanceMatches(audioPath, fingerprint))) {
        throw new Error(`Campaign audio provenance is stale or corrupt: ${relativePath}`);
      }
      assertGeneratedMp3(
        await readFile(audioPath),
        "audio/mpeg",
        `Certified campaign audio ${relativePath}`,
      );
    }
  }
}

async function assertKnownOfficialAssetTopLevel() {
  if (!existsSync(outRoot)) return;
  const allowed = new Set([...generatedOutputNames, "audio"]);
  const unexpected = (await readdir(outRoot)).filter((name) => !allowed.has(name));
  if (unexpected.length) {
    throw new Error(
      `Unknown official asset output cannot survive rebuild: ${unexpected.join(", ")}`,
    );
  }
}

async function writeCopyPack() {
  const copyMd = `# BotBound official asset pack

Generated ${new Date().toISOString()} from ${baseUrl.origin}.

## Folders

| Folder | Use |
|--------|-----|
| \`web/\` | Website OG, hero, pricing, showcase, compare |
| \`app-store/\` | App Store and Play Store screenshots for iPhone, iPad, and Android |
| \`social/\` | Instagram, LinkedIn, X, and Facebook |
| \`ads/\` | Meta feed and story, Google Display, and LinkedIn ads |
| \`reels/\` | 9:16 stills for Reels, TikTok, and Stories |
| \`videos/\` | Screen recordings ready for editing |
| \`product-gallery/\` | Selected UI stills from a certified launch capture |

## Suggested captions

### LinkedIn
Build one Bot around a real job. Give it your knowledge, rules, tools, approvals, and handoffs.
Start free at ${baseUrl.hostname}.

### Instagram and Reels hook
"Your phone operation should not live in five tabs."
Cut: Home, Overview, Studio, Phone, Pricing
CTA: Link in bio

### Meta ad primary text
Create and train your Bot for free. Live work draws from prepaid Runtime Balance.
Free Builder, Starter, Starter Plus, and Pro. See live pricing for current capacity and rates.

### App Store subtitle
Your Bot for sales and support

### App Store promo text
BotBound trains inbound and outbound Bots that book meetings, update your systems, and keep a clean outcome record.

## Notes
- Prefer \`product-gallery/desktop-*\` for SaaS website screenshots.
- Prefer \`app-store/iphone-*\` for mobile store listings.
- Convert \`videos/*.webm\` to H.264 MP4 before social upload.
`;

  if (/\bWireline\b|trywireline\.com/i.test(copyMd) || copyMd.includes(String(email))) {
    throw new Error("Official asset copy contains retired branding or a capture-account identity.");
  }

  await writeFile(path.join(outRoot, "README.md"), copyMd, "utf8");
  await ensureDir(path.join(outRoot, "copy"));
  await writeFile(path.join(outRoot, "copy", "captions.md"), copyMd, "utf8");
}

async function main() {
  console.log(`Building official assets from ${baseUrl.origin}`);
  const sourceCommit = resolveSourceCommit(repoRoot);
  assertCleanCheckout(repoRoot, sourceCommit);
  await verifyRemoteSourceCommit(sourceCommit, baseUrl.origin);
  await assertKnownOfficialAssetTopLevel();
  await validatePreservedCampaignAudio();
  for (const name of generatedOutputNames) {
    await rm(path.join(outRoot, name), { recursive: true, force: true });
  }
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

  assertCleanCheckout(repoRoot, sourceCommit);
  await verifyRemoteSourceCommit(sourceCommit, baseUrl.origin);
  await copyExistingProductMedia(sourceCommit);
  await writeCopyPack();
  console.log(`Done: ${outRoot}`);
}

main().catch(async (error) => {
  for (const name of generatedOutputNames) {
    await rm(path.join(outRoot, name), { recursive: true, force: true });
  }
  console.error(error);
  process.exit(1);
});
