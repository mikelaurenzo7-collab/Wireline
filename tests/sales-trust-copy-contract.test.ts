import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { TRUST_DISCLOSURE_FAQ } from "../src/lib/product-copy";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const PROHIBITED_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /state-by-state hour windows respected automatically/i, reason: "unimplemented state-hour automation claim" },
  { pattern: /Never call the same number twice in 24h/i, reason: "unimplemented duplicate-dial claim" },
  { pattern: /pass naturally as human/i, reason: "human-passing claim" },
  { pattern: /80%\+ of calls/i, reason: "unsourced statistic" },
  { pattern: /Disclosure is your call/i, reason: "blanket disclosure opt-out claim" },
  { pattern: /guarantee(?:d|s)?\s+TCPA/i, reason: "guaranteed TCPA claim" },
  { pattern: /guarantee(?:d|s)?\s+HIPAA/i, reason: "guaranteed HIPAA claim" },
  { pattern: /jumps 4-7x/i, reason: "unsourced ROI multiplier" },
  { pattern: /AI SDR for Outbound/i, reason: "retired spammy positioning" },
];
const SCANNED_FILES = ["src/data/vertical-wedges.ts", "src/components/marketing/WireAgentLanding.tsx", "src/pages/Compare.tsx"] as const;

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
      for (const { pattern, reason } of PROHIBITED_PATTERNS) if (pattern.test(source)) violations.push(`${file}: ${reason}`);
    }
    expect(violations).toEqual([]);
  });

  it("keeps sales starters inside the canonical configurable Bot catalog", () => {
    const wedges = read("src/data/vertical-wedges.ts");
    const product = read("src/lib/bot-product.ts");
    expect(product).toContain('name: "Sales Rep"');
    expect(product).toContain('category: "Business" as const');
    expect(wedges).toContain('import { TRUST_DISCLOSURE_FAQ } from "../lib/product-copy"');
    expect(wedges).toContain("a: TRUST_DISCLOSURE_FAQ,");
  });

  it("keeps the landing customer-facing without internal design meta", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    expect(landing).toContain("MARKETING_VOICE.headline");
    expect(landing).not.toMatch(/homepage now leads|Polish principles/i);
  });

  it("keeps market comparison sourced, dated, and linked to official pricing pages", () => {
    const compare = read("src/pages/Compare.tsx");
    const checked = compare.match(/Public prices were checked on the linked official pages on\s+([A-Z][a-z]+ \d{1,2},\s+20\d{2})/);
    if (!checked) throw new Error("Market comparison verification date is missing.");
    const verifiedAt = Date.parse(`${checked[1].replace(/\s+/g, " ")} 00:00:00 UTC`);
    expect(Number.isFinite(verifiedAt)).toBe(true);
    expect(Date.now() - verifiedAt).toBeLessThanOrEqual(45 * 86_400_000);
    for (const url of ["https://www.goodcall.com/pricing", "https://smith.ai/pricing/ai-receptionist", "https://www.bland.ai/pricing", "https://www.retellai.com/pricing"]) expect(compare).toContain(url);
    expect(compare).toContain('to="/signup?plan=personal"');
  });
});
