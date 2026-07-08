#!/usr/bin/env node
/**
 * Production dogfood smoke. Requires explicit local credentials and writes all
 * screenshots/reports outside source control by default.
 *
 * Usage:
 *   DOGFOOD_EMAIL=... DOGFOOD_PASSWORD=... npm run dogfood:prod
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { requireDogfoodCredentials } from "./dogfood-credentials.mjs";

const base = (() => {
  const index = process.argv.indexOf("--base");
  return index >= 0 ? process.argv[index + 1] : process.env.APP_URL || "https://trywireline.com";
})();
const { email, password } = requireDogfoodCredentials();
const out = process.env.DOGFOOD_OUT || path.join(process.cwd(), ".tmp", "wireline-dogfood");
const screenshots = path.join(out, "screenshots");
for (const directory of [out, screenshots]) {
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true });
}

const routes = [
  "/overview",
  "/studio",
  "/connections",
  "/phone",
  "/insights",
  "/inbox",
  "/knowledge",
  "/apps",
  "/settings",
  "/admin",
];

const report = {
  base,
  startedAt: new Date().toISOString(),
  passed: [],
  failed: [],
  warnings: [],
  consoleErrors: [],
};

function record(kind, route, detail) {
  report[kind].push({ route, detail });
  const symbol = kind === "passed" ? "✓" : kind === "failed" ? "✗" : "!";
  console.log(`${symbol} ${route}${detail ? ` — ${detail}` : ""}`);
}

async function login(context) {
  const response = await fetch(`${base}/api/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    redirect: "manual",
  });
  const setCookie = response.headers.getSetCookie?.() ?? [];
  const fallback = response.headers.get("set-cookie");
  const cookies = setCookie.length ? setCookie : fallback ? [fallback] : [];
  const session = cookies.find((cookie) => cookie.startsWith("wireline_session="));
  if (!response.ok || !session) throw new Error(`Sign-in failed (${response.status})`);

  await context.addCookies([
    {
      name: "wireline_session",
      value: session.split(";")[0].split("=").slice(1).join("="),
      domain: new URL(base).hostname,
      path: "/",
      httpOnly: true,
      secure: new URL(base).protocol === "https:",
      sameSite: "Lax",
    },
  ]);
}

async function visit(page, route) {
  const routeUrl = `${base}${route}`;
  try {
    await page.goto(routeUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(1_500);
    const finalUrl = page.url();
    const body = await page.locator("body").innerText();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);

    if (finalUrl.includes("/signin") || finalUrl.includes("/login")) {
      record("failed", route, "redirected to sign-in");
      return;
    }
    if (/error boundary|something went wrong|failed to load/i.test(body)) {
      record("failed", route, "error state visible");
      return;
    }
    if (overflow) record("warnings", route, "horizontal overflow detected");
    if (body.trim().length < 40) record("warnings", route, "very little content rendered");
    await page.screenshot({ path: path.join(screenshots, `${route.replace(/[^a-z0-9]+/gi, "_") || "home"}.png`) });
    record("passed", route, "rendered");
  } catch (error) {
    record("failed", route, error instanceof Error ? error.message : String(error));
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-gpu"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();

  page.on("console", (message) => {
    if (message.type() === "error") report.consoleErrors.push(message.text().slice(0, 500));
  });

  try {
    await login(context);
    record("passed", "auth", "session established");
    for (const route of routes) await visit(page, route);
  } finally {
    await browser.close();
  }

  report.finishedAt = new Date().toISOString();
  report.summary = {
    passed: report.passed.length,
    failed: report.failed.length,
    warnings: report.warnings.length,
    consoleErrors: [...new Set(report.consoleErrors)],
  };
  writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
  console.log(`Report: ${path.join(out, "report.json")}`);
  process.exit(report.failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
