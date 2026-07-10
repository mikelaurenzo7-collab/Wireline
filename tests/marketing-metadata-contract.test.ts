import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("marketing metadata contract", () => {
  it("keeps static and runtime fallback metadata aligned to the AI employee story", () => {
    const staticHead = read("index.html");
    const runtimeMeta = read("src/lib/page-meta.tsx");

    expect(staticHead).toContain("Wireline — Wire your AI employee.");
    expect(runtimeMeta).toContain('const DEFAULT_TITLE = "Wireline - Wire your AI employee"');
    expect(staticHead).toContain("AI employees with included numbers");
    expect(staticHead).toContain("book appointments, revive leads, promote offers");
    expect(runtimeMeta).toContain("AI employees with included numbers");
    expect(runtimeMeta).toContain("book appointments, revive leads, promote offers");
    expect(staticHead).not.toContain("AI phone employees that turn calls into sales");
    expect(runtimeMeta).not.toContain("Personal & Business AI Assistants");
  });

  it("does not hard-code plan prices into public structured data", () => {
    const staticHead = read("index.html");

    expect(staticHead).toMatch(/"@type"\s*:\s*"SoftwareApplication"/);
    expect(staticHead).not.toMatch(/"@type"\s*:\s*"Offer"/);
  });

  it("keeps public pricing, contact, and ROI copy aligned to the active catalog", () => {
    const pricing = read("src/pages/Pricing.tsx");
    const contact = read("src/components/ContactPage.tsx");
    const roi = read("src/components/marketing/RoiCalculator.tsx");
    const catalog = read("src/lib/plan-catalog.ts");

    expect(catalog).toContain('id: "team"');
    expect(catalog).toContain("price_usd_monthly: 19");
    expect(catalog).toContain("included_phone_numbers: 1");
    expect(catalog).toContain('id: "business"');
    expect(catalog).toContain("price_usd_monthly: 59");
    expect(catalog).toContain("included_phone_numbers: 5");

    expect(pricing).toContain("Build free. Go live from $9. Scale when the work proves itself.");
    expect(contact).toContain(
      "Create and train for free. Starter Plus starts at $19/mo; Pro at $59/mo.",
    );
    expect(contact).toContain('searchParams.get("intent") ?? searchParams.get("topic")');
    expect(contact).toContain("Preferred callback");
    expect(roi).toContain("Net annual savings (after the Pro plan)");
    expect(roi).toContain("Pro tier billed at $59/mo");

    for (const source of [pricing, contact, roi]) {
      expect(source).not.toContain("Personal starts at $9");
      expect(source).not.toContain("Business coverage starts at $99");
      expect(source).not.toContain("Wireline Pro");
      expect(source).not.toContain("Account Holder tier");
      expect(source).not.toContain("Everyday tier");
      expect(source).not.toContain("~$0.07/min");
      expect(source).not.toContain("~$0.05/min");
      expect(source).not.toContain("~$0.08/min");
      expect(source).not.toContain("Team starts at $29");
    }
  });
});
