import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { planById } from "../src/lib/plan-catalog";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("marketing metadata contract", () => {
  it("keeps static and runtime fallback metadata aligned to the inclusive voice-agent promise", () => {
    const staticHead = read("index.html");
    const runtimeMeta = read("src/lib/page-meta.tsx");

    expect(staticHead).toContain("Wireline — AI Voice Agents for Personal &amp; Business");
    expect(runtimeMeta).toContain(
      'const DEFAULT_TITLE = "Wireline - AI Voice Agents for Personal & Business"',
    );
    for (const source of [staticHead, runtimeMeta]) {
      expect(source).toContain("personal tasks and business conversations");
      expect(source).toContain("follow-through across voice, SMS, and email");
    }
    expect(staticHead).not.toContain("AI phone employees that turn calls into sales");
    expect(runtimeMeta).not.toContain("Personal & Business AI Assistants");
  });

  it("does not hard-code plan prices into public structured data", () => {
    const staticHead = read("index.html");

    expect(staticHead).toMatch(/"@type"\s*:\s*"SoftwareApplication"/);
    expect(staticHead).not.toMatch(/"@type"\s*:\s*"Offer"/);
  });

  it("keeps public pricing and contact copy aligned to the active catalog", () => {
    const pricing = read("src/pages/Pricing.tsx");
    const planCatalog = read("src/lib/plan-catalog.ts");
    const contact = read("src/components/ContactPage.tsx");
    // Assert catalog capacity through the module, not raw substrings: a bare
    // `included_phone_numbers: 1` matches whichever plan happens to own it and
    // silently passes after a reprice.
    expect(planById("team")?.price_usd_monthly).toBe(39);
    expect(planById("team")?.included_phone_numbers).toBe(2);
    expect(planById("business")?.price_usd_monthly).toBe(79);
    expect(planById("business")?.included_phone_numbers).toBe(5);

    expect(pricing).toContain("Build free. Launch for $19. Scale when it pays.");
    expect(contact).toContain('planById("starter")');
    expect(contact).toContain('planById("team")');
    expect(contact).toContain("Starter launches at ${STARTER_PRICE}/mo");
    expect(contact).toContain('searchParams.get("intent") ?? searchParams.get("topic")');
    expect(contact).toContain("Preferred callback");

    for (const source of [pricing, contact]) {
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

    for (const source of [pricing, planCatalog]) {
      expect(source).not.toMatch(/\\bemployees?\\b/i);
      expect(source).not.toMatch(/\\bAI Voice Employees?\\b/i);
    }
  });
});
