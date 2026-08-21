import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { chromium } from "playwright";

import { chromiumLaunchOptions } from "./lib/resolve-preinstalled-chromium.mjs";

const baseUrl = (process.env.BOTBOUND_CAPTURE_BASE_URL ?? "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);
const outputDir = path.resolve("brand-work/exports/product-proof");

const captures = [
  { name: "botbound-home-desktop-1440x900", path: "/", width: 1440, height: 900 },
  { name: "botbound-home-mobile-390x844", path: "/", width: 390, height: 844 },
  { name: "botbound-features-desktop-1440x900", path: "/features", width: 1440, height: 900 },
  { name: "botbound-pricing-desktop-1440x900", path: "/pricing", width: 1440, height: 900 },
];

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  ...chromiumLaunchOptions(),
  headless: true,
});

const results = [];

try {
  for (const capture of captures) {
    const page = await browser.newPage({
      viewport: { width: capture.width, height: capture.height },
      deviceScaleFactor: 1,
      colorScheme: "dark",
      reducedMotion: "reduce",
    });
    const pageErrors = [];
    const consoleErrors = [];

    page.on("pageerror", (error) => pageErrors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    const url = `${baseUrl}${capture.path}`;
    const response = await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
    if (!response || response.status() >= 400) {
      throw new Error(`Capture failed for ${url}: HTTP ${response?.status() ?? "no response"}`);
    }

    await page.locator("main").first().waitFor({ state: "visible", timeout: 30_000 });
    await page.evaluate(async () => {
      await document.fonts.ready;
      window.scrollTo(0, 0);
    });

    const outputPath = path.join(outputDir, `${capture.name}.png`);
    await page.screenshot({ path: outputPath, fullPage: false });

    const metrics = await page.evaluate(() => ({
      bodyHorizontalOverflow: document.body.scrollWidth - document.body.clientWidth,
      rootHorizontalOverflow:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      title: document.title,
    }));

    results.push({
      ...capture,
      url,
      output: path.relative(process.cwd(), outputPath),
      status: response.status(),
      ...metrics,
      pageErrors,
      consoleErrors,
    });

    await page.close();
  }
} finally {
  await browser.close();
}

const failures = results.filter(
  (result) =>
    result.pageErrors.length > 0 ||
    result.consoleErrors.length > 0 ||
    result.rootHorizontalOverflow > 2 ||
    result.bodyHorizontalOverflow > 2,
);

await writeFile(
  path.join(outputDir, "botbound-launch-proof.json"),
  `${JSON.stringify({ capturedAt: new Date().toISOString(), baseUrl, results }, null, 2)}\n`,
);

if (failures.length > 0) {
  throw new Error(`Launch proof failed for: ${failures.map((failure) => failure.name).join(", ")}`);
}

console.log(`Captured ${results.length} BotBound launch proofs in ${outputDir}`);
