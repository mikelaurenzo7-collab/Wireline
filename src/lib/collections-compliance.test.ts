/**
 * collections-compliance.test.ts
 * ----------------------------------------------------------------------
 * Regulatory regression lock for the collections vertical.
 *
 * Standing compliance rules (FDCPA / UDAAP / truth-in-advertising):
 *   - Never fabricate creditor policies or settlement percentages.
 *   - Always include a disclaimer when discussing settlement outcomes.
 *   - Never guarantee debt forgiveness.
 *
 * A silent edit that reintroduces a hardcoded settlement percentage (e.g.
 * "50-80% of balance") or drops the disclaimer would put real callers — and
 * the business — at legal risk. This test fails loudly if that happens.
 */
import { describe, expect, it } from "vitest";
import { TEMPLATE_OVERLAYS, composeAgentPersonality } from "./template-overlays";
import { ROLE_PERSONALITY_TEMPLATES } from "./agent-constants";

const COLLECTIONS_TEMPLATE_IDS = ["collections-soft", "collections-hard"] as const;

// Matches a settlement figure stated as a concrete percentage or range, e.g.
// "50%", "50-80%", "50 to 80 percent". Word-level "100%" inside unrelated copy
// would be a false positive, so we anchor on settlement/balance proximity.
const FABRICATED_SETTLEMENT_PERCENT = /\d{1,3}\s*(?:-|to|–)\s*\d{1,3}\s*%|\d{1,3}\s*%\s*of\s*(?:the\s*)?balance/i;

const DISCLAIMER_MARKERS = [/not guaranteed/i, /not legal or financial advice/i];

describe("collections compliance guardrails", () => {
  for (const id of COLLECTIONS_TEMPLATE_IDS) {
    it(`${id}: contains no fabricated settlement percentage`, () => {
      const overlay = TEMPLATE_OVERLAYS[id];
      expect(overlay, `template ${id} should exist`).toBeTruthy();
      expect(overlay).not.toMatch(FABRICATED_SETTLEMENT_PERCENT);
    });

    it(`${id}: includes a settlement-outcome disclaimer`, () => {
      const overlay = TEMPLATE_OVERLAYS[id];
      const hasDisclaimer = DISCLAIMER_MARKERS.some((re) => re.test(overlay));
      expect(hasDisclaimer, `${id} must carry a "not guaranteed / not legal advice" disclaimer`).toBe(
        true,
      );
    });
  }

  it("collections role personality requires explicit authorization for settlements", () => {
    const personality = ROLE_PERSONALITY_TEMPLATES.collections;
    expect(personality).toBeTruthy();
    expect(personality).not.toMatch(FABRICATED_SETTLEMENT_PERCENT);
    // Must instruct to only settle when explicitly authorized — not freelance.
    expect(personality.toLowerCase()).toContain("authorized");
  });

  it("composed collections persona stays clean end-to-end", () => {
    const composed = composeAgentPersonality({
      rolePersonality: ROLE_PERSONALITY_TEMPLATES.collections,
      templateId: "collections-hard",
      businessContext: { businessName: "Acme Recovery" },
    });
    expect(composed).not.toMatch(FABRICATED_SETTLEMENT_PERCENT);
    const hasDisclaimer = DISCLAIMER_MARKERS.some((re) => re.test(composed));
    expect(hasDisclaimer).toBe(true);
  });
});
