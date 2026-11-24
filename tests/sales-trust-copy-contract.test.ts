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
  /**
   * What this file protects is honesty, not phrasing. The prohibited patterns
   * below stay: each one is a claim BotBound cannot stand behind. The exact
   * headlines, stat lines, and meta titles that used to be pinned alongside them
   * are ordinary marketing copy, and pinning them meant a better pitch failed a
   * compliance test.
   */
  it("exports canonical trust disclosure guidance", () => {
    expect(TRUST_DISCLOSURE_FAQ).toContain("disclosure policy");
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

  it("shows sales follow up with truthful activation requirements", () => {
    const sales = WEDGES.sales;
    const security = read("src/components/Security.tsx");
    expect(sales.metaTitle).toContain("BotBound");
    expect(sales.headline).toBeTruthy();
    expect(sales.statValue).toBeTruthy();
    // The three activation requirements have to be stated, however worded.
    expect(sales.trustLine).toMatch(/sender approval/i);
    expect(sales.trustLine).toMatch(/recipient permission/i);
    expect(sales.trustLine).toMatch(/DNC/i);
    expect(JSON.stringify(sales)).not.toMatch(/coming soon/i);
    // A sample outbound script must disclose that the caller is an AI.
    expect(sales.scriptPreview).toMatch(/\bAI\b/);
    expect(sales.primaryCta.href).toContain("wedge=sales");
    // The security page must describe each screen that actually runs, so the
    // wording is free but every screen has to be named.
    expect(security).toMatch(/do-not-call list/i);
    expect(security).toMatch(/block list/i);
    expect(security).toMatch(/calling hours/i);
    expect(security).toMatch(/says it is an AI/i);
    expect(security).not.toContain("Live outbound dialing is gated");
  });

  it("describes calendar imports and CRM availability accurately on public pages", () => {
    const wedges = read("src/data/vertical-wedges.ts");
    const calendar = read("src/components/CalendarAvailabilityPanel.tsx");
    const compare = read("src/pages/Compare.tsx");
    expect(wedges).not.toMatch(
      /real Google or Outlook availability|Salesforce are supported today|reservation writes back|SMS activation is pending/i,
    );
    // Availability is imported, not live. Say so in whatever words.
    expect(wedges).toMatch(/busy times can be imported/i);
    expect(calendar).toMatch(/[Ii]mport .*busy times/);
    expect(compare).not.toContain("continues with shared context");
  });

  it("keeps the landing customer-facing without internal design meta", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
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
    expect(compare).toContain('to="/signup"');
  });
});
