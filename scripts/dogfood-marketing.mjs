#!/usr/bin/env node
/**
 * Marketing-only dogfood when API is down — public routes + viewports.
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

const base = process.env.APP_URL || "https://trywireline.com";
const OUT = process.env.DOGFOOD_OUT || path.join(process.cwd(), "terminals", "dogfood-prod");
const SS = path.join(OUT, "screenshots", "marketing");
[SS].forEach((d) => {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
});

const ROUTES = ["/", "/pricing", "/showcase", "/compare", "/about", "/support", "/auth"];
const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 834, height: 1112 },
  { name: "desktop", width: 1440, height: 900 },
];

const report = { base, at: new Date().toISOString(), passed: [], failed: [], warnings: [] };

function pass(id, note) {
  report.passed.push({ id, note });
  console.log(`  ✓ ${id}${note ? ` — ${note}` : ""}`);
}
function fail(id, note) {
  report.failed.push({ id, note });
  console.log(`  ✗ ${id}${note ? ` — ${note}` : ""}`);
}
function warn(id, note) {
  report.warnings.push({ id, note });
  console.log(`  ! ${id}${note ? ` — ${note}` : ""}`);
}

async function gotoStable(page, url) {
  await page.goto(url, { waitUntil: "commit", timeout: 45_000 });
  await page
    .waitForFunction(
      () => {
        const el = document.getElementById("root");
        return !!el && el.innerText.trim().length > 20;
      },
      { timeout: 25_000 },
    )
    .catch(() => {});
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
}

async function main() {
  console.log(`Marketing dogfood @ ${base}`);
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    for (const route of ROUTES) {
      const id = `marketing:${vp.name}${route}`;
      try {
        await gotoStable(page, `${base}${route}`);
        const body = await page.locator("body").innerText();
        if (/something went wrong|error boundary/i.test(body)) {
          fail(id, "error copy visible");
          continue;
        }
        if (body.trim().length < 30) {
          warn(id, "thin content");
        }
        const safe = route.replace(/\//g, "_") || "home";
        await page.screenshot({
          path: path.join(SS, `${vp.name}_${safe}.png`),
          fullPage: route === "/",
        });
        pass(id, route);
      } catch (e) {
        fail(id, e.message);
      }
    }

    if (consoleErrors.length) {
      warn(`console:${vp.name}`, `${consoleErrors.length} errors`);
    }
    await context.close();
  }

  await browser.close();
  writeFileSync(path.join(OUT, "marketing-report.json"), JSON.stringify(report, null, 2));
  console.log(`\n${report.passed.length} passed, ${report.failed.length} failed`);
  process.exit(report.failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
