import { chromium } from "@playwright/test";
import { readFileSync } from "fs";

const EMAIL = readFileSync("/tmp/e2e_email.txt", "utf8").trim();
const PASS = readFileSync("/tmp/e2e_pass.txt", "utf8").trim();

(async () => {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });
  const page = await ctx.newPage();

  const consoleErrors = [];
  const failedReqs = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("requestfailed", (req) => {
    failedReqs.push(`REQFAIL ${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
  });
  page.on("response", async (res) => {
    if (res.url().includes("/api/auth/")) {
      let body = "";
      try { body = (await res.text()).slice(0, 300); } catch {}
      console.log(`  [AUTH] ${res.status()} ${res.request().method()} ${res.url()} → ${body}`);
    }
  });

  console.log("=== 1. Open landing ===");
  await page.goto("https://wireline-chi.vercel.app/", { waitUntil: "networkidle", timeout: 30000 });
  await page.screenshot({ path: "/tmp/wireline-audit/signin-debug-01-landing.png" });

  console.log("=== 2. Dismiss cookie banner if present ===");
  const dismissBtn = page.locator('[aria-label="Dismiss cookie notice"]').first();
  if (await dismissBtn.isVisible().catch(() => false)) {
    await dismissBtn.click();
    await page.waitForTimeout(300);
    console.log("    cookie banner dismissed");
  }

  console.log("=== 3. Fill sign-in form (Sign In tab should be default) ===");
  const emailField = page.locator('input[type="email"]').first();
  const pwField = page.locator('input[type="password"]').first();
  await emailField.fill(EMAIL);
  await pwField.fill(PASS);
  console.log(`    filled email=${EMAIL.slice(0, 5)}*** pw=***`);

  await page.screenshot({ path: "/tmp/wireline-audit/signin-debug-02-filled.png" });

  console.log("=== 4. Click submit ===");
  const submitBtn = page.locator('button[type="submit"]').first();
  const btnText = await submitBtn.textContent();
  console.log(`    submit button text: "${btnText?.trim()}"`);
  await submitBtn.click();

  console.log("=== 5. Wait for response ===");
  await page.waitForTimeout(4000);
  const currentUrl = page.url();
  console.log(`    URL after submit: ${currentUrl}`);

  console.log("=== 6. Check for error / redirect ===");
  const errorEl = page.locator('[role="alert"], .text-rose-500, .text-red-500').first();
  const hasError = await errorEl.isVisible().catch(() => false);
  if (hasError) {
    const errText = await errorEl.textContent();
    console.log(`    ERROR shown: "${errText}"`);
  } else {
    console.log("    no error visible");
  }

  // Check localStorage for session
  const sessionStr = await page.evaluate(() => window.localStorage.getItem("wireline_session"));
  console.log(`    localStorage.wireline_session: ${sessionStr ? "PRESENT (" + sessionStr.length + " chars)" : "MISSING"}`);

  await page.screenshot({ path: "/tmp/wireline-audit/signin-debug-03-after.png" });

  console.log("\n=== CONSOLE ERRORS ===");
  if (!consoleErrors.length) console.log("  (none)");
  for (const e of consoleErrors) console.log(`  ${e.slice(0, 280)}`);

  console.log("\n=== FAILED REQUESTS ===");
  if (!failedReqs.length) console.log("  (none)");
  for (const e of failedReqs) console.log(`  ${e}`);

  await browser.close();
})();
