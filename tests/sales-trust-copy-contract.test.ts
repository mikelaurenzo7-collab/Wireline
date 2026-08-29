import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { TRUST_DISCLOSURE_FAQ } from "../src/lib/product-copy";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const PROHIBITED_PATTERNS: { pattern: RegExp; reason: string }[] = [
  {
    pattern: /state-by-state hour windows respected automatically/i,
    reason: "unimplemented state-hour automation claim",
  },
  {
    pattern: /Never call the same number twice in 24h/i,
    reason: "unimplemented 24h duplicate-dial claim",
  },
  { pattern: /pass naturally as human/i, reason: "stealth AI / human-passing claim" },
  { pattern: /80%\+ of calls/i, reason: "unsourced human-passing statistic" },
  { pattern: /Disclosure is your call/i, reason: "blanket disclosure opt-out claim" },
  { pattern: /200 cold leads a day/i, reason: "unsourced cold-call volume claim" },
  { pattern: /1,000 dials/i, reason: "unsourced dial-volume claim" },
  { pattern: /guarantee(?:d|s)?\s+TCPA/i, reason: "guaranteed TCPA compliance claim" },
  { pattern: /guarantee(?:d|s)?\s+HIPAA/i, reason: "guaranteed HIPAA compliance claim" },
  { pattern: /jumps 4-7x/i, reason: "unsourced ROI multiplier" },
  {
    pattern: /logged to your CRM in real time/i,
    reason: "unqualified auto-CRM writeback claim",
  },
  { pattern: /out of the box/i, reason: "overbroad integration claim" },
  {
    pattern: /homepage now leads with/i,
    reason: "internal design meta leaked to customer UI",
  },
  { pattern: /AI SDR for Outbound/i, reason: "retired spammy positioning" },
];

const SCANNED_FILES = [
  "src/data/vertical-wedges.ts",
  "src/components/marketing/WireAgentLanding.tsx",
  "src/pages/Compare.tsx",
] as const;

describe("sales trust copy contract", () => {
  it("exports canonical trust disclosure guidance", () => {
    expect(TRUST_DISCLOSURE_FAQ).toContain("disclosure policy");
    expect(TRUST_DISCLOSURE_FAQ).toContain("logs it automatically");
    expect(TRUST_DISCLOSURE_FAQ).toContain("consent rules");
  });

  it("forbids unsafe trust and performance claims in public marketing", () => {
    const violations: string[] = [];
    for (const file of SCANNED_FILES) {
      const source = read(file);
      for (const { pattern, reason } of PROHIBITED_PATTERNS) {
        if (pattern.test(source)) violations.push(`${file}: ${reason}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps the sales wedge governed, Bot-native, and tied to canonical disclosure guidance", () => {
    const wedges = read("src/data/vertical-wedges.ts");
    const product = read("src/lib/bot-product.ts");
    expect(wedges).toContain(
      'metaTitle: "BOTBOUND FOR SALES TEAMS | VOICE BOTS FOR LEAD FOLLOW-UP"',
    );
    expect(wedges).toContain(
      'headline: "Your Sales Bot Works the Queue While Your Team Works the Deals"',
    );
    expect(wedges).toContain("Fast, Governed Speed to Lead");
    expect(wedges).toContain("Approved actions sync");
    expect(wedges).toContain('import { TRUST_DISCLOSURE_FAQ } from "../lib/product-copy"');
    expect(wedges).toContain("a: TRUST_DISCLOSURE_FAQ,");
    expect(product).toContain('name: "Sales Rep"');
    expect(product).toContain('category: "Operations" as const');
  });

  it("keeps the landing customer-facing without internal design meta", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    expect(landing).toContain("PUT YOUR BOT");
    expect(landing).toContain("ON THE LINE");
    expect(landing).toContain("BOT_MARKETING_VOICE.activationLine");
    expect(landing).not.toMatch(/homepage now leads/i);
    expect(landing).not.toMatch(/live desk/i);
    expect(landing).not.toMatch(/Polish principles/i);
  });

  it("keeps the market comparison dated, sourced, and explicit about unlike products", () => {
    const compare = read("src/pages/Compare.tsx");
    const checked = compare.match(
      /Public prices were checked on the linked official pages on\s+([A-Z][a-z]+ \d{1,2},\s+20\d{2})/,
    );
    if (!checked) throw new Error("Market comparison verification date is missing.");

    expect(compare).not.toMatch(/Verified [A-Z][a-z]+ \d{1,2}, 20\d{2}/);
    const verifiedAt = Date.parse(`${checked[1].replace(/\s+/g, " ")} 00:00:00 UTC`);
    expect(Number.isFinite(verifiedAt)).toBe(true);
    const ageMs = Date.now() - verifiedAt;
    expect(ageMs).toBeGreaterThanOrEqual(-86_400_000);
    expect(ageMs).toBeLessThanOrEqual(45 * 86_400_000);

    for (const url of [
      "https://www.goodcall.com/pricing",
      "https://smith.ai/pricing/ai-receptionist",
      "https://www.bland.ai/pricing",
      "https://www.retellai.com/pricing",
    ]) {
      expect(compare).toContain(url);
    }
    expect(compare.replace(/\s+/g, " ")).toContain(
      "not a claim that unlike products are feature-for-feature equivalents",
    );
    expect(compare).toContain('signupHrefForPlan("personal")');
  });
});
