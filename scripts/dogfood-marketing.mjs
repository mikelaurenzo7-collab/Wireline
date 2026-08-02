#!/usr/bin/env node
/**
 * Marketing-only dogfood when API is down — public routes + viewports.
 * Output defaults to a local ignored directory.
 */
import { chromium } from "playwright";
import { chromiumLaunchOptions } from "./lib/resolve-preinstalled-chromium.mjs";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const base = process.env.APP_URL || "https://trywireline.com";
const out =
  process.env.DOGFOOD_OUT || path.join(process.cwd(), ".tmp", "wireline-marketing-dogfood");
const screenshots = path.join(out, "screenshots");
if (!existsSync(screenshots)) mkdirSync(screenshots, { recursive: true });

const routes = ["/", "/pricing", "/showcase", "/compare", "/about", "/support", "/auth"];
const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 834, height: 1112 },
  { name: "desktop", width: 1440, height: 900 },
];

const report = { base, at: new Date().toISOString(), passed: [], failed: [], warnings: [] };

function record(kind, id, note) {
  report[kind].push({ id, note });
  const symbol = kind === "passed" ? "✓" : kind === "failed" ? "✗" : "!";
  console.log(`${symbol} ${id}${note ? ` — ${note}` : ""}`);
}

async function gotoStable(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(1_200);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
}

async function main() {
  console.log(`Marketing dogfood @ ${base}`);
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
    ...chromiumLaunchOptions(),
  });

  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      const consoleErrors = [];
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });

      for (const route of routes) {
        const id = `marketing:${viewport.name}${route}`;
        try {
          await gotoStable(page, `${base}${route}`);
          const body = await page.locator("body").innerText();
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
          );
          if (/something went wrong|error boundary|failed to load/i.test(body)) {
            record("failed", id, "error state visible");
            continue;
          }
          if (body.trim().length < 30) record("warnings", id, "thin content");
          if (overflow) record("warnings", id, "horizontal overflow");
          const fileName = route.replace(/[^a-z0-9]+/gi, "_") || "home";
          await page.screenshot({
            path: path.join(screenshots, `${viewport.name}_${fileName}.png`),
            fullPage: route === "/",
          });
          record("passed", id, route);
        } catch (error) {
          record("failed", id, error instanceof Error ? error.message : String(error));
        }
      }

      if (consoleErrors.length)
        record("warnings", `console:${viewport.name}`, `${consoleErrors.length} errors`);
      await context.close();
    }
  } finally {
    await browser.close();
  }

  writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
  console.log(`Report: ${path.join(out, "report.json")}`);
  process.exit(report.failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
