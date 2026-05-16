import { test, expect } from "@playwright/test";
import { dismissCookieNotice } from "../helpers/auth";
import { expectNoViewCrash } from "../helpers/shell";

test.describe("Command palette routes @auth-desktop", () => {
  test.beforeEach(async ({ page }) => {
    await dismissCookieNotice(page);
  });

  const cases: { label: string; search: string; url: RegExp }[] = [
    { label: "Triage Inbox", search: "triage", url: /\/triage$/ },
    { label: "Outbound Dialer", search: "outbound", url: /\/outbound$/ },
    { label: "Audit Log", search: "audit", url: /\/audit$/ },
    { label: "Knowledge Base", search: "knowledge", url: /\/knowledge$/ },
  ];

  for (const { label, search, url } of cases) {
    test(`⌘K → ${label}`, async ({ page }) => {
      await page.goto("/command");
      await expectNoViewCrash(page);
      await page.keyboard.press("Control+KeyK");
      await page.getByPlaceholder(/search commands/i).fill(search);
      await page.getByRole("button", { name: new RegExp(label, "i") }).click();
      await page.waitForURL(url, { timeout: 15_000 });
      await expectNoViewCrash(page);
    });
  }
});
