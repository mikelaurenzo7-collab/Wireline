import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/** Findings from the Nov 23 QA-account visual pass; each one stays fixed. */
describe("QA pass polish", () => {
  it("says the Calls list is empty and uses the one label for creating a Bot", () => {
    const calls = read("src/components/PhoneCallHistoryPanel.tsx");
    expect(calls).toContain('title: "No Calls Yet",');
    expect(calls).toContain('description: "Calls appear here once your Bot has a phone line."');
    expect(calls).toContain('action: { label: "Create Bot", to: "/studio?create=1" }');
    expect(calls).not.toContain('label: "New Bot"');
  });

  it("names the plan the pricing estimate uses and draws the Plan Details toggle", () => {
    const pricing = read("src/components/usage-billing/UsagePricingPanel.tsx");
    expect(pricing).toContain("Estimating");
    expect(pricing).toContain("[&::-webkit-details-marker]:hidden");
    expect(pricing).toContain("group-open:rotate-180");
  });

  it("keeps titles free of end punctuation and the inbox on the product word", () => {
    expect(read("src/pages/Pricing.tsx")).toContain(">Room to Do More</h1>");
    expect(read("src/pages/EmailPage.tsx")).toContain('{ id: "sms", label: "Texts" }');
    expect(read("src/components/marketing/MarketingChromeBar.tsx")).toContain(
      '{ to: "/features", label: "Features" }',
    );
  });
});
