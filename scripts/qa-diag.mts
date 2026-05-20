import { chromium } from "playwright";

const target = process.argv[2] || "/";
const authed = process.argv[3] === "authed";

const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
if (authed) {
  await ctx.addInitScript(() => {
    window.localStorage.setItem("wireline_session", JSON.stringify({
      access_token: "qa", user: { id: "00000000-0000-4000-8000-000000000001", email: "qa@trywireline.com", full_name: "QA", is_owner: false },
    }));
    window.localStorage.setItem("wireline_cookie_consent", JSON.stringify({ accepted: true }));
  });
}
const page = await ctx.newPage();
const errs: string[] = [];
page.on("console", (m) => { if (m.type() === "error") errs.push("CONSOLE: " + m.text()); });
page.on("pageerror", (e) => errs.push("PAGEERR: " + (e.stack || e.message)));
let bodyText = "";
let navOk = true;
try {
  await page.goto(`http://localhost:3000${target}`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(2500);
  bodyText = await page.evaluate(() => document.body.innerText.slice(0, 400));
} catch (e: any) {
  navOk = false;
  console.log("NAV FAIL:", e.message);
}
console.log("NAV OK:", navOk);
console.log("BODY:", JSON.stringify(bodyText));
console.log(`--- ERRORS (${errs.length}) ---`);
for (const e of errs.slice(0, 12)) console.log(e.slice(0, 600));
await b.close();
