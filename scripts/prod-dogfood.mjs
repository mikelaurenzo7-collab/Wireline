#!/usr/bin/env node
/**
 * Production dogfood — real login, route sweep, Director chat roleplay.
 * Usage: node scripts/prod-dogfood.mjs [--base https://trywireline.com]
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

const base = (() => {
  const i = process.argv.indexOf("--base");
  return i >= 0 ? process.argv[i + 1] : process.env.APP_URL || "https://trywireline.com";
})();
const EMAIL = process.env.DOGFOOD_EMAIL || "wireline.demo@trywireline.com";
const PASSWORD = process.env.DOGFOOD_PASSWORD || "WirelineDemo!2026";
const OUT = process.env.DOGFOOD_OUT || path.join(process.cwd(), "terminals", "dogfood-prod");
const SS = path.join(OUT, "screenshots");
[OUT, SS].forEach((d) => {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
});

const ROUTES = [
  { path: "/chat", label: "Director Chat", tab: null },
  { path: "/ops", label: "Live Ops", tab: null },
  { path: "/agents", label: "Agents", tab: null },
  { path: "/training", label: "Training", tab: null },
  { path: "/phone", label: "Phone", tab: null },
  { path: "/sms", label: "SMS", tab: null },
  { path: "/email", label: "Email", tab: null },
  { path: "/pipeline", label: "Pipeline", tab: null },
  { path: "/insights", label: "Insights", tab: null },
  { path: "/integrations", label: "Integrations", tab: null },
  { path: "/admin", label: "Settings", tab: null },
  { path: "/triage", label: "Triage", tab: null },
];

const CHAT_PROBES = [
  {
    id: "fleet-audit",
    message: "Audit my fleet — what should I fix first? Give me a prioritized list.",
    waitMs: 90_000,
  },
  {
    id: "code-snippet",
    message: "Write a short Zod schema that validates a US phone number.",
    waitMs: 60_000,
  },
  {
    id: "gtm-roleplay",
    message:
      "I'm a plumbing contractor with 3 trucks. Roleplay as my growth advisor — what's my 30-day GTM plan?",
    waitMs: 90_000,
  },
];

const report = { passed: [], failed: [], warnings: [], base, at: new Date().toISOString() };

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

async function loginViaApi(context) {
  const r = await fetch(`${base}/api/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    redirect: "manual",
  });
  const cookies = r.headers.getSetCookie?.() ?? [];
  const session = cookies.find((c) => c.startsWith("wireline_session="));
  if (!r.ok || !session) throw new Error(`API login failed ${r.status}`);
  const value = session.split(";")[0].split("=")[1];
  const domain = new URL(base).hostname;
  await context.addCookies([
    {
      name: "wireline_session",
      value,
      domain,
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ]);
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
  await page.waitForTimeout(1200);
}

async function routeSweep(page) {
  console.log("\n── Route sweep ──");
  for (const route of ROUTES) {
    const id = `route:${route.path}`;
    try {
      await gotoStable(page, `${base}${route.path}`);
      const url = page.url();
      if (url.includes("/signin") || url.includes("/login")) {
        fail(id, "redirected to sign-in");
        continue;
      }
      const body = await page.locator("body").innerText();
      if (/something went wrong|error boundary|failed to load/i.test(body)) {
        fail(id, "error copy visible");
        continue;
      }
      if (body.trim().length < 40) {
        warn(id, "very little content rendered");
      }
      const ssName = route.path.replace(/\//g, "_") || "home";
      await page.screenshot({ path: path.join(SS, `${ssName}.png`), fullPage: false });
      pass(id, route.label);

      if (route.path === "/admin") {
        const growthTab = page.getByRole("tab", { name: /growth/i });
        if (await growthTab.count()) {
          await growthTab.first().click();
          await page.waitForTimeout(800);
          await page.screenshot({ path: path.join(SS, "admin_growth.png") });
          pass("route:/admin/growth", "Growth engine panel");
        } else {
          warn("route:/admin/growth", "Growth tab not found");
        }
      }
      if (route.path === "/ops") {
        for (const tab of ["Actions", "Analytics"]) {
          const t = page.getByRole("tab", { name: new RegExp(tab, "i") });
          if (await t.count()) {
            await t.first().click();
            await page.waitForTimeout(600);
            pass(`route:/ops?tab=${tab.toLowerCase()}`, tab);
          }
        }
      }
    } catch (e) {
      fail(id, e.message);
    }
  }
}

async function chatProbe(page, probe) {
  const id = `chat:${probe.id}`;
  try {
    await gotoStable(page, `${base}/chat`);
    const clearBtn = page.getByRole("button", { name: /clear/i });
    if (await clearBtn.count()) {
      await clearBtn.first().click().catch(() => {});
      await page.waitForTimeout(1500);
    }
    const composer = page.getByRole("textbox").last();
    await composer.waitFor({ state: "visible", timeout: 15_000 });
    await composer.fill(probe.message);
    const send = page.getByRole("button", { name: /send/i });
    await send.click();
    const deadline = Date.now() + probe.waitMs;
    let gotReply = false;
    while (Date.now() < deadline) {
      await page.waitForTimeout(2000);
      const text = await page.locator("body").innerText();
      if (
        text.includes("DIRECTOR") &&
        (text.includes("```") || text.length > probe.message.length + 400)
      ) {
        gotReply = true;
        break;
      }
      if (/Google Stitch/i.test(text) && /Screenshot|Live HTML/i.test(text)) {
        gotReply = true;
        break;
      }
      if (/Stream interrupted|Couldn't send/i.test(text)) {
        fail(id, "stream/send error toast");
        return;
      }
      const sending = await page.getByPlaceholder(/Director is working|working/i).count();
      if (sending === 0 && text.split(probe.message).length > 1) {
        const after = text.split(probe.message).pop() || "";
        if (after.trim().length > 200) {
          gotReply = true;
          break;
        }
      }
    }
    await page.screenshot({ path: path.join(SS, `chat_${probe.id}.png`), fullPage: false });
    if (gotReply) pass(id, probe.message.slice(0, 50));
    else warn(id, `no substantive reply within ${probe.waitMs / 1000}s`);
  } catch (e) {
    fail(id, e.message);
  }
}

async function main() {
  console.log(`Production dogfood @ ${base} (${EMAIL})`);
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("wireline_post_signup_dismissed", "true");
      localStorage.setItem("wireline_onboarding_celebrated", "true");
    } catch {
      /* ignore */
    }
  });

  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  try {
    await loginViaApi(context);
    pass("auth", "session cookie set");
    await routeSweep(page);
    console.log("\n── Director chat roleplay ──");
    for (const probe of CHAT_PROBES) {
      await chatProbe(page, probe);
    }
    if (consoleErrors.length) {
      warn("console", `${consoleErrors.length} errors (first: ${consoleErrors[0]?.slice(0, 80)})`);
    } else {
      pass("console", "no console errors");
    }
  } finally {
    await browser.close();
  }

  const score = report.passed.length;
  const total = score + report.failed.length;
  report.summary = { score, total, failed: report.failed.length, warnings: report.warnings.length };
  writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(`\n${score}/${total} passed, ${report.failed.length} failed, ${report.warnings.length} warnings`);
  console.log(`Report: ${path.join(OUT, "report.json")}`);
  process.exit(report.failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
