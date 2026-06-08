#!/usr/bin/env node
/**
 * Full authenticated client UX audit — production or local.
 *
 * Usage:
 *   node scripts/authenticated-ux-audit.mjs [--base https://trywireline.com]
 *
 * Env: DOGFOOD_EMAIL, DOGFOOD_PASSWORD (or defaults from dogfood skill)
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

const base = (() => {
  const i = process.argv.indexOf("--base");
  return i >= 0 ? process.argv[i + 1] : process.env.APP_URL || "https://trywireline.com";
})();
const EMAIL = process.env.DOGFOOD_EMAIL || process.env.E2E_USER_EMAIL || "wireline.demo@trywireline.com";
const PASSWORD = process.env.DOGFOOD_PASSWORD || process.env.E2E_USER_PASSWORD || "WirelineDemo!2026";
const OUT = process.env.UX_AUDIT_OUT || path.join(process.cwd(), "terminals", "ux-audit-prod");
const SS = path.join(OUT, "screenshots");

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];

const ROUTES = [
  { path: "/ops", name: "Live Ops", tabs: ["Live floor", "Actions", "Triage", "Analytics"] },
  { path: "/chat", name: "Chat / Director", tabs: null },
  { path: "/training", name: "Training", tabs: ["Knowledge", "Voices", "Pronunciation", "Simulator", "Flow"] },
  { path: "/insights", name: "Insights", tabs: ["Performance", "Quality", "Revenue"] },
  { path: "/phone", name: "Phone", tabs: ["Call History", "Outbound", "Appointments"] },
  { path: "/email", name: "Email", tabs: null },
  { path: "/sms", name: "SMS", tabs: null },
  { path: "/pipeline", name: "Pipeline", tabs: null },
  { path: "/agents", name: "Agents", tabs: null },
  { path: "/integrations", name: "Integrations", tabs: null },
  { path: "/admin", name: "Settings", tabs: ["Billing", "Team", "Branding", "Carrier", "Growth", "Integrations", "Activity", "DNC", "Audit"] },
  { path: "/dnc", name: "DNC", tabs: null },
  { path: "/audit", name: "Audit Log", tabs: null },
  { path: "/help", name: "Help", tabs: null },
];

const DEEP_LINKS = [
  "/phone?tab=outbound",
  "/phone?tab=appointments",
  "/ops?tab=intel",
  "/ops?tab=analytics",
  "/ops?tab=floor",
  "/ops?tab=triage",
  "/admin?tab=subscription",
  "/admin?tab=flywheel",
  "/training?tab=database",
  "/training?tab=simulator",
];

[OUT, SS].forEach((d) => {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
});

const findings = { p0: [], p1: [], p2: [], passed: [], meta: { base, at: new Date().toISOString(), email: EMAIL } };

function add(severity, id, note, extra = {}) {
  findings[severity].push({ id, note, ...extra });
  const mark = severity === "p0" ? "✗ P0" : severity === "p1" ? "! P1" : "· P2";
  console.log(`  ${mark} ${id}: ${note}`);
}
function ok(id, note) {
  findings.passed.push({ id, note });
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
  await context.addCookies([
    {
      name: "wireline_session",
      value,
      domain: new URL(base).hostname,
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ]);
}

async function gotoStable(page, url) {
  await page.goto(url, { waitUntil: "commit", timeout: 60_000 });
  await page
    .waitForSelector('[data-testid="client-console"], [data-testid="director-workspace"]', {
      timeout: 30_000,
    })
    .catch(() => {});
  await page.waitForTimeout(1000);
}

async function assertNoHorizontalOverflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth <= doc.clientWidth + 2;
  });
}

async function countH1(page) {
  return page.locator("h1").count();
}

async function shellChecks(page, ctx) {
  const issues = [];
  const shell = await page.locator('[data-testid="client-console"]').count();
  if (!shell) issues.push("missing client-console shell");
  const rail = await page.locator('[data-testid="aurora-rail"]').count();
  if (!rail && ctx.viewport !== "mobile") issues.push("missing sidebar rail on non-mobile");
  const overflow = await assertNoHorizontalOverflow(page);
  if (!overflow) issues.push("horizontal overflow");
  const h1 = await countH1(page);
  if (h1 === 0) issues.push("no visible h1 (check sr-only / WorkspaceTopBar)");
  if (h1 > 1) issues.push(`${h1} h1 elements — heading outline broken`);
  const body = await page.locator("body").innerText();
  if (/something went wrong|error boundary/i.test(body)) issues.push("error boundary visible");
  if (page.url().includes("/signin")) issues.push("redirected to sign-in");
  const panel = await page.locator(".wl-panel, .wl-panel-elevated").count();
  if (ctx.path !== "/chat" && panel === 0) issues.push("no wl-panel surfaces");
  const auroraRing = await page.locator(".aurora-ring").count();
  if (auroraRing > 0) issues.push("aurora-ring in app chrome");
  const tiny =
    (await page.locator('[class*="text-[8px]"]').count()) +
    (await page.locator('[class*="text-[9px]"]').count());
  if (tiny > 0) issues.push(`${tiny} sub-10px text nodes — readability risk`);
  return issues;
}

async function auditRoute(page, route, viewport) {
  const ctx = { path: route.path, viewport: viewport.name };
  const id = `${viewport.name}:${route.path}`;
  try {
    await gotoStable(page, `${base}${route.path}`);
    const issues = await shellChecks(page, ctx);
    const ssPath = path.join(SS, `${viewport.name}${route.path.replace(/\//g, "_") || "_root"}.png`);
    await page.screenshot({ path: ssPath, fullPage: false });

    if (issues.some((i) => i.includes("sign-in") || i.includes("error boundary"))) {
      add("p0", id, issues.join("; "), { screenshot: ssPath });
      return;
    }
    if (issues.some((i) => i.includes("overflow"))) {
      add("p0", id, issues.join("; "), { screenshot: ssPath });
      return;
    }
    for (const issue of issues) {
      if (issue.includes("h1")) add("p1", id, issue, { screenshot: ssPath });
      else if (issue.includes("wl-panel")) add("p1", id, issue, { screenshot: ssPath });
      else if (issue.includes("sub-10px") || issue.includes("8px") || issue.includes("9px"))
        add("p1", id, issue, { screenshot: ssPath });
      else add("p1", id, issue, { screenshot: ssPath });
    }
    if (issues.length === 0) ok(id, route.name);

    if (route.tabs?.length) {
      const tablist = page.getByRole("tablist").first();
      if ((await tablist.count()) === 0) {
        add("p1", `${id}:tabs`, "expected tablist missing", { screenshot: ssPath });
        return;
      }
      for (const label of route.tabs) {
        const tab = tablist.getByRole("tab", { name: label, exact: true });
        if ((await tab.count()) === 0) {
          add("p1", `${id}:tab-${label}`, "tab not found");
          continue;
        }
        await tab.click();
        await page.waitForTimeout(700);
        if (route.path === "/admin" && (label === "DNC" || label === "Audit")) {
          ok(`${id}:tab-${label}`, `${label} → ${page.url()}`);
          await gotoStable(page, `${base}${route.path}`);
          continue;
        }
        if (route.path === "/admin" && label === "Integrations") {
          ok(`${id}:tab-${label}`, "Integrations hub");
          await gotoStable(page, `${base}${route.path}`);
          continue;
        }
        const tabIssues = await shellChecks(page, { ...ctx, path: `${route.path}?tab=${label}` });
        const tabSs = path.join(
          SS,
          `${viewport.name}${route.path.replace(/\//g, "_")}_${label.replace(/\s+/g, "_")}.png`,
        );
        await page.screenshot({ path: tabSs, fullPage: false });
        if (!tabIssues.length) ok(`${id}:tab-${label}`, label);
        else {
          const sev = tabIssues.some((i) => i.includes("overflow")) ? "p0" : "p1";
          add(sev, `${id}:tab-${label}`, tabIssues.join("; "), { screenshot: tabSs });
        }
      }
    }
  } catch (e) {
    add("p0", id, e.message);
  }
}

async function auditDeepLinks(page) {
  console.log("\n── Deep links ──");
  for (const link of DEEP_LINKS) {
    const id = `deeplink:${link}`;
    try {
      await gotoStable(page, `${base}${link}`);
      const issues = await shellChecks(page, { path: link, viewport: "desktop" });
      if (issues.length) add("p1", id, issues.join("; "));
      else ok(id, link);
    } catch (e) {
      add("p0", id, e.message);
    }
  }
}

async function mobileNavCheck(page) {
  console.log("\n── Mobile nav ──");
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoStable(page, `${base}/chat`);
  const openNav = page.getByRole("button", { name: "Open navigation" });
  if ((await openNav.count()) === 0) {
    add("p1", "mobile:drawer", "Open navigation control missing");
  } else {
    await openNav.click();
    const drawer = page.getByRole("navigation", { name: "Main navigation" });
    if ((await drawer.count()) === 0) {
      add("p1", "mobile:drawer", "Main navigation drawer missing");
    } else {
      const phoneLink = drawer.getByRole("link", { name: "Phone", exact: true });
      if ((await phoneLink.count()) === 0) {
        add("p1", "mobile:nav-phone", "Phone link missing in drawer");
      } else {
        await phoneLink.click();
        await page.waitForURL(/\/phone/, { timeout: 15_000 });
        ok("mobile:nav-phone", "drawer → Phone");
      }
    }
  }
  await page.screenshot({ path: path.join(SS, "mobile_nav_phone.png") });
}

async function directorUxCheck(page) {
  console.log("\n── Director UX ──");
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoStable(page, `${base}/chat`);
  const workspace = page.getByTestId("director-workspace");
  if ((await workspace.count()) === 0) {
    add("p0", "director:workspace", "director-workspace missing");
    return;
  }
  const dock = page.locator(".wl-composer-dock").first();
  if ((await dock.count()) === 0) add("p1", "director:composer", "composer dock missing");
  else ok("director:composer", "wl-composer-dock visible");
  const send = page.getByRole("button", { name: /send/i });
  const box = await send.boundingBox();
  if (box && (box.height < 40 || box.width < 40)) {
    add("p1", "director:send-target", `send button ${Math.round(box.height)}px — below 44px touch`);
  }
  await page.screenshot({ path: path.join(SS, "director_desktop.png") });
}

async function main() {
  console.log(`Authenticated UX audit @ ${base}\n`);
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const consoleErrors = [];

  for (const vp of VIEWPORTS) {
    console.log(`\n══ Viewport: ${vp.name} (${vp.width}×${vp.height}) ══`);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.name === "mobile" ? 2 : 1,
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
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push({ vp: vp.name, text: msg.text() });
    });

    await loginViaApi(context);
    if (vp.name === "desktop") ok("auth", "session established");

    for (const route of ROUTES) {
      console.log(`  → ${route.path}`);
      await auditRoute(page, route, vp);
    }

    if (vp.name === "desktop") {
      await auditDeepLinks(page);
      await directorUxCheck(page);
    }
    if (vp.name === "mobile") {
      await mobileNavCheck(page);
    }

    await context.close();
  }

  await browser.close();

  if (consoleErrors.length) {
    const unique = [...new Set(consoleErrors.map((e) => e.text))].slice(0, 5);
    add("p1", "console:errors", `${consoleErrors.length} console.error(s); samples: ${unique.join(" | ")}`);
  } else {
    ok("console", "no console errors during sweep");
  }

  findings.summary = {
    p0: findings.p0.length,
    p1: findings.p1.length,
    p2: findings.p2.length,
    passed: findings.passed.length,
  };

  writeFileSync(path.join(OUT, "ux-audit.json"), JSON.stringify(findings, null, 2));

  const md = [
    `# Authenticated UX audit`,
    ``,
    `**Base:** ${base}`,
    `**When:** ${findings.meta.at}`,
    `**Account:** ${EMAIL}`,
    ``,
    `## Summary`,
    `- P0: ${findings.p0.length}`,
    `- P1: ${findings.p1.length}`,
    `- P2: ${findings.p2.length}`,
    `- Passed checks: ${findings.passed.length}`,
    ``,
    `## P0 (ship blockers)`,
    ...findings.p0.map((f) => `- **${f.id}** — ${f.note}`),
    ``,
    `## P1 (consistency / friction)`,
    ...findings.p1.map((f) => `- **${f.id}** — ${f.note}`),
    ``,
    `## P2 (polish)`,
    ...findings.p2.map((f) => `- **${f.id}** — ${f.note}`),
    ``,
    `Screenshots: \`${SS}\``,
  ].join("\n");
  writeFileSync(path.join(OUT, "ux-audit.md"), md);

  console.log(`\nDone. P0=${findings.p0.length} P1=${findings.p1.length} P2=${findings.p2.length}`);
  console.log(`Report: ${path.join(OUT, "ux-audit.md")}`);
  process.exit(findings.p0.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
