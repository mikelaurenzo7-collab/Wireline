/**
 * Channel pages use sidebar navigation only — no redundant Phone|Email|SMS strip.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PAGES = ["EmailPage.tsx", "PhonePage.tsx", "SmsPage.tsx"] as const;

describe("channel page manifests", () => {
  for (const file of PAGES) {
    it(`${file} does not mount CHANNELS_HUB HubTabs`, () => {
      const src = readFileSync(join(import.meta.dirname, file), "utf8");
      expect(src).not.toContain("CHANNELS_HUB");
      expect(src).not.toMatch(/<HubTabs[\s\S]*tabs=\{CHANNELS_HUB\}/);
    });
  }

  it("EmailPage and SmsPage embed their inbox components directly", () => {
    const email = readFileSync(join(import.meta.dirname, "EmailPage.tsx"), "utf8");
    const sms = readFileSync(join(import.meta.dirname, "SmsPage.tsx"), "utf8");
    expect(email).toContain("<EmailInbox embedded");
    expect(sms).toContain("<SmsThreads embedded");
  });

  it("PhonePage uses app chrome tab routing (not in-page ClientSubTabs)", () => {
    const phone = readFileSync(join(import.meta.dirname, "PhonePage.tsx"), "utf8");
    expect(phone).not.toContain("ClientSubTabs");
    expect(phone).toContain("resolveAppPageSubTabId");
    expect(phone).toContain("CallLogs embedded");
  });
});
