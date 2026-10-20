import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { WEDGES } from "../src/data/vertical-wedges";
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

  it("keeps the legacy sales route focused on inbound inquiries", () => {
    const sales = WEDGES.sales;
    const security = read("src/components/Security.tsx");
    const product = read("src/lib/bot-product.ts");
    expect(sales.metaTitle).toBe("BotBound for Sales Inquiries | Phone Bots for Incoming Calls");
    expect(sales.headline).toBe("Give Every Inquiry a Clear Next Step");
    expect(sales.pains.map(({ title }) => title)).toContain("Incoming Questions");
    expect(sales.statValue).toBe("Ready to Answer");
    expect(sales.trustLine).toContain("remain visible in BotBound");
    expect(JSON.stringify(sales)).not.toMatch(/consent|do not call|\bDNC\b|coming soon/i);
    expect(JSON.stringify(sales)).not.toMatch(/call prospects|outbound|lead list/i);
    expect(sales.primaryCta.href).toContain("wedge=support");
    expect(security).toContain(
      "Recipient permission and account Do Not Call checks remain enforced before eligible outgoing calls are placed.",
    );
    expect(security).not.toContain("Live outbound dialing is gated");
    expect(product).toContain('name: "Sales Rep"');
    expect(product).toContain('category: "Operations" as const');
  });

  it("describes calendar imports and CRM availability accurately on public pages", () => {
    const wedges = read("src/data/vertical-wedges.ts");
    const features = read("src/pages/Features.tsx");
    const compare = read("src/pages/Compare.tsx");
    expect(wedges).not.toMatch(
      /real Google or Outlook availability|Salesforce are supported today|reservation writes back|SMS activation is pending/i,
    );
    expect(wedges).toContain("Google or Outlook busy times can be imported when you sync.");
    expect(features).toContain("Optionally import Google or Outlook busy times when you sync.");
    expect(compare).not.toContain("continues with shared context");
  });

  it("keeps the landing customer-facing without internal design meta", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    expect(landing).toContain("<span>With a Computer,</span>");
    expect(landing).toContain("<span>and Email Address.</span>");
    expect(landing).not.toContain("landing-prestige__promise");
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
      "not a claim that unlike products are feature by feature equivalents",
    );
    expect(compare).toContain('signupHrefForPlan("personal")');
  });
});
