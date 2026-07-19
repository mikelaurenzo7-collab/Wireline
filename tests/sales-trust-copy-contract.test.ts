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
  { pattern: /logged to your CRM in real time/i, reason: "unqualified auto-CRM writeback claim" },
  { pattern: /out of the box/i, reason: "overbroad integration claim" },
  { pattern: /homepage now leads with/i, reason: "internal design meta leaked to customer UI" },
  { pattern: /AI SDR for Outbound/i, reason: "spammy AI SDR positioning in meta title" },
];

const SCANNED_FILES = [
  "src/data/vertical-wedges.ts",
  "src/components/marketing/WireAgentLanding.tsx",
  "src/pages/Compare.tsx",
] as const;

describe("sales trust copy contract", () => {
  it("exports canonical trust disclosure FAQ in product-copy", () => {
    expect(TRUST_DISCLOSURE_FAQ).toContain("disclosure policy");
    expect(TRUST_DISCLOSURE_FAQ).toContain("logged automatically");
  });

  it("forbids prohibited trust and performance claims in public marketing surfaces", () => {
    const violations: string[] = [];

    for (const file of SCANNED_FILES) {
      const source = read(file);
      for (const { pattern, reason } of PROHIBITED_PATTERNS) {
        if (pattern.test(source)) {
          violations.push(`${file}: ${reason} (${pattern})`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps sales wedge copy aligned with profit-recovery positioning", () => {
    const wedges = read("src/data/vertical-wedges.ts");
    expect(wedges).toContain("Profit Recovery Phone Agents");
    expect(wedges).toContain("speed-to-lead");
    expect(wedges).toContain("Approved actions sync");
    // The sales wedge answers disclosure with the canonical constant so the
    // copy can never drift from product-copy's trust posture again.
    expect(wedges).toContain('import { TRUST_DISCLOSURE_FAQ } from "../lib/product-copy"');
    expect(wedges).toContain("a: TRUST_DISCLOSURE_FAQ,");
  });

  it("keeps WireAgentLanding customer-facing without internal meta", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    expect(landing).toContain("MARKETING_VOICE.headline");
    expect(landing).not.toMatch(/homepage now leads/i);
    expect(landing).not.toMatch(/live desk/i);
    expect(landing).not.toMatch(/Polish principles/i);
  });

  it("keeps the market comparison dated, sourced, and explicit about unlike products", () => {
    const compare = read("src/pages/Compare.tsx");

    expect(compare).toContain("Verified July 19, 2026");
    expect(compare).toContain("https://www.goodcall.com/pricing");
    expect(compare).toContain("https://smith.ai/pricing/ai-receptionist");
    expect(compare).toContain("https://www.bland.ai/pricing");
    expect(compare).toContain("https://www.retellai.com/pricing");
    expect(compare).toContain("not a claim that unlike products are feature-for-feature equivalents");
    expect(compare).toContain('primaryAction={{ label: "Start free", to: "/signup?plan=personal" }}');
  });
});
