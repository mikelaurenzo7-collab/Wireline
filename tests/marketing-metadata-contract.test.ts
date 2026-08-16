import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXTRA_AGENT_ADDON_PRICE_USD_MONTHLY,
  STRIPE_PLANS,
  planById,
} from "../src/lib/plan-catalog";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("marketing metadata contract", () => {
  it("keeps static and runtime fallback metadata aligned to the direct voice agent promise", () => {
    const staticHead = read("index.html");
    const runtimeMeta = read("src/lib/page-meta.tsx");

    expect(staticHead).toContain("Wireline | Voice agents that get the work done");
    expect(runtimeMeta).toContain(
      'const DEFAULT_TITLE = "Wireline | Voice agents that get the work done"',
    );
    for (const source of [staticHead, runtimeMeta]) {
      expect(source).toContain("Build one for your business or your life.");
      expect(source).toContain("call, answer, text, email, book, and follow through");
      expect(source).not.toContain("—");
    }
    expect(staticHead).not.toContain("AI phone employees that turn calls into sales");
    expect(runtimeMeta).not.toContain("Personal & Business AI Assistants");
  });

  it("does not hard-code plan prices into public structured data", () => {
    const staticHead = read("index.html");

    expect(staticHead).toMatch(/"@type"\s*:\s*"SoftwareApplication"/);
    expect(staticHead).not.toMatch(/"@type"\s*:\s*"Offer"/);
  });

  it("keeps Trust Center metadata distinct and one main landmark per page", () => {
    const security = read("src/components/Security.tsx");
    const trustPack = read("src/components/TrustPackPage.tsx");
    const marketingChrome = read("src/components/marketing/MarketingChrome.tsx");
    const sitemap = read("public/sitemap.xml");

    expect(security).toContain('path={isTrustHub ? "/trust" : "/security"}');
    expect(security).toContain("How Wireline earns live calls");
    expect(security).not.toContain("Trust Center — how Wireline earns live calls.");
    expect(sitemap).toContain("<loc>https://trywireline.com/trust</loc>");
    expect(marketingChrome.match(/<main\b/g)).toHaveLength(1);
    expect(trustPack).not.toMatch(/<main\b/);
    expect(trustPack).not.toContain("</main>");
  });

  it("keeps the public market reference tied to current first-party sources", () => {
    const compare = read("src/pages/Compare.tsx");

    expect(compare.match(/August 1,\s+2026/g)).toHaveLength(1);
    for (const href of [
      "https://www.goodcall.com/pricing",
      "https://smith.ai/pricing/ai-receptionist",
      "https://www.bland.ai/pricing",
      "https://www.retellai.com/pricing",
    ]) {
      expect(compare).toContain(href);
    }
  });

  it("never quotes a public price the catalog does not charge", () => {
    // The plan cards read `price_usd_monthly` straight from the catalog, so the
    // table can never lie. The prose around it is written by hand — hero lines,
    // CTA labels, SEO descriptions, section copy — and a reprice touches the
    // catalog and one or two of those, leaving the rest advertising the old
    // number. Quoting a price we do not charge is the kind of mistake that
    // costs trust at exactly the moment someone reaches for a card.
    //
    // Only surfaces that quote Wireline's own pricing belong here. Compare.tsx
    // is deliberately excluded: its rows carry competitors' published prices.
    const surfaces = [
      "src/pages/Pricing.tsx",
      "src/components/marketing/WireAgentLanding.tsx",
      "src/pages/Features.tsx",
      "src/pages/SolutionsPage.tsx",
      "src/components/ContactPage.tsx",
    ];

    const chargeable = new Set<number>([0, EXTRA_AGENT_ADDON_PRICE_USD_MONTHLY]);
    for (const plan of STRIPE_PLANS) {
      chargeable.add(plan.price_usd_monthly);
      chargeable.add(plan.price_usd_annual);
      chargeable.add(plan.runtime_allowance_usd_monthly);
      chargeable.add(plan.overage_per_min_usd);
    }

    for (const path of surfaces) {
      const quoted = [...read(path).matchAll(/\$(\d+(?:\.\d+)?)/g)].map((match) =>
        Number(match[1]),
      );
      for (const amount of quoted) {
        expect(
          chargeable.has(amount),
          `${path} quotes $${amount}, which no plan, add-on, allowance, or overage rate charges`,
        ).toBe(true);
      }
    }
  });

  it("keeps public pricing and contact copy aligned to the active catalog", () => {
    const pricing = read("src/pages/Pricing.tsx");
    const planCatalog = read("src/lib/plan-catalog.ts");
    const contact = read("src/components/ContactPage.tsx");
    const features = read("src/pages/Features.tsx");
    const solutions = read("src/pages/SolutionsPage.tsx");
    // Assert catalog capacity through the module, not raw substrings: a bare
    // `included_phone_numbers: 1` matches whichever plan happens to own it and
    // silently passes after a reprice.
    expect(planById("team")?.price_usd_monthly).toBe(39);
    expect(planById("team")?.included_phone_numbers).toBe(2);
    expect(planById("business")?.price_usd_monthly).toBe(79);
    expect(planById("business")?.included_phone_numbers).toBe(5);

    // The money line follows the launch source of truth verbatim, so pricing
    // can never drift into a second phrasing. It is no longer carried by a
    // hero headline (the plan cards state every number exactly, so a display
    // line above them could only restate and delay them) but by the page
    // description and the catalog-driven card prices.
    expect(pricing).toContain("launch from $19/month");
    expect(pricing).toContain("plan.price_usd_monthly");
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

    for (const source of [pricing, planCatalog, features, solutions]) {
      expect(source).not.toMatch(/\bemployees?\b/i);
      expect(source).not.toMatch(/\bAI Voice Employees?\b/i);
    }
  });
});
