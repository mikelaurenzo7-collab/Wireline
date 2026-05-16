import type { Page } from "@playwright/test";
import { test } from "@playwright/test";

export function slugify(s: string): string {
  return (
    s
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 96) || "x"
  );
}

/** Attach a full-page PNG to the Playwright HTML report (no repo snapshot). */
export async function attachFullPagePng(page: Page, name: string): Promise<void> {
  const safe = slugify(name);
  const buf = await page.screenshot({ fullPage: true });
  await test.info().attach(`${safe}.png`, { body: buf, contentType: "image/png" });
}

const UNSAFE_TAB =
  /sign out|delete my account|remove account|remove number|terminate|pay now|checkout/i;

/**
 * Clicks each `role="tab"` in DOM order up to `max` times when visible and
 * name looks non-destructive; captures after each activation.
 */
export async function exploreRoleTabs(page: Page, prefix: string, max = 30): Promise<void> {
  for (let k = 0; k < max; k++) {
    const tabs = page.getByRole("tab");
    const n = await tabs.count();
    if (k >= n) break;
    const tab = tabs.nth(k);
    if (!(await tab.isVisible().catch(() => false))) continue;
    const text = (await tab.innerText().catch(() => "")).trim();
    if (!text || UNSAFE_TAB.test(text)) continue;
    await tab.click();
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await attachFullPagePng(page, `${prefix}-tab-${slugify(text)}`);
  }
}

/** Clicks each link in a named navigation region (e.g. HubTabs `Section navigation`). */
export async function exploreSectionNavLinks(
  page: Page,
  navName: string,
  prefix: string,
): Promise<void> {
  const hub = page.getByRole("navigation", { name: navName });
  if ((await hub.count()) === 0) return;
  const links = hub.getByRole("link");
  const c = await links.count();
  for (let i = 0; i < c; i++) {
    const link = links.nth(i);
    const text = (await link.innerText().catch(() => "")).trim();
    if (!text) continue;
    await link.click();
    await page.waitForLoadState("domcontentloaded");
    await attachFullPagePng(page, `${prefix}-hub-${slugify(text)}`);
  }
}

/** Clicks each primary rail link (`aria-label` starts with `Go to `). Skips home + sign-out patterns. */
export async function exploreFloatingRail(page: Page): Promise<void> {
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  const links = nav.getByRole("link");
  const c = await links.count();
  for (let i = 0; i < c; i++) {
    const link = links.nth(i);
    const label = (await link.getAttribute("aria-label")) || "";
    if (label.includes("Wireline home")) continue;
    if (/sign out/i.test(label)) continue;
    if (!/^go to /i.test(label)) continue;
    await link.click();
    await page.waitForLoadState("domcontentloaded");
    const short = label.replace(/^go to /i, "");
    await attachFullPagePng(page, `rail-${slugify(short)}`);
  }
}
