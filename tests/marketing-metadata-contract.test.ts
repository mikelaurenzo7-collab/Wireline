import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("marketing metadata contract", () => {
  it("keeps static and runtime fallback metadata aligned to the Wire-your-agent story", () => {
    const staticHead = read("index.html");
    const runtimeMeta = read("src/lib/page-meta.tsx");

    expect(staticHead).toContain("Wireline — Wire your agent.");
    expect(runtimeMeta).toContain('const DEFAULT_TITLE = "Wireline - Wire your agent"');
    expect(staticHead).toContain("trained voice agents that answer, route, book, follow up");
    expect(staticHead).toContain("Start outbound-first, then choose inbound or hybrid modes");
    expect(runtimeMeta).toContain("trained voice agents that answer, route, book, follow up");
    expect(runtimeMeta).toContain("Start outbound-first, then choose inbound or hybrid modes");
    expect(runtimeMeta).not.toContain("Personal & Business AI Assistants");
  });

  it("does not hard-code plan prices into public structured data", () => {
    const staticHead = read("index.html");

    expect(staticHead).toContain('"@type":"SoftwareApplication"');
    expect(staticHead).not.toContain('"@type":"Offer"');
  });

  it("keeps public pricing, contact, and ROI copy aligned to the active catalog", () => {
    const pricing = read("src/pages/Pricing.tsx");
    const contact = read("src/components/ContactPage.tsx");
    const roi = read("src/components/marketing/RoiCalculator.tsx");
    const catalog = read("src/lib/plan-catalog.ts");

    expect(catalog).toContain('id: "team"');
    expect(catalog).toContain("price_usd_monthly: 29");
    expect(catalog).toContain('id: "business"');
    expect(catalog).toContain("price_usd_monthly: 59");

    expect(pricing).toContain("Build and train one agent for free");
    expect(contact).toContain(
      "Create and train for free. Team starts at $29/mo; Business at $59/mo.",
    );
    expect(contact).toContain('searchParams.get("intent") ?? searchParams.get("topic")');
    expect(contact).toContain("Preferred callback");
    expect(roi).toContain("Net annual savings (after Wireline Business)");
    expect(roi).toContain("Business tier billed at $59/mo");
    expect(pricing).toContain("Buying posture");
    expect(pricing).toContain("Usage-based API minutes plus model and line economics");

    for (const source of [pricing, contact, roi]) {
      expect(source).not.toContain("Personal starts at $9");
      expect(source).not.toContain("Business coverage starts at $99");
      expect(source).not.toContain("Wireline Pro");
      expect(source).not.toContain("Account Holder tier");
      expect(source).not.toContain("Everyday tier");
      expect(source).not.toContain("~$0.07/min");
      expect(source).not.toContain("~$0.05/min");
      expect(source).not.toContain("~$0.08/min");
    }
  });
});
