import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Cannot import tenant-quotas directly because it side-effect imports
// server-context (which initializes DB/auth singletons). Instead we
// do a source-guard test: verify the PLAN_DEFAULTS object shape via
// regex checks on the raw source. This is the same pattern used in
// api-rate-limits.wiring.test.ts.
const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(__dirname, "tenant-quotas.ts"), "utf8");

type PlanTier = "free" | "personal" | "personal-plus" | "business-starter" | "starter" | "scale";

describe("tenant-quotas — source guards", () => {
  const tiers: PlanTier[] = [
    "free",
    "personal",
    "personal-plus",
    "business-starter",
    "starter",
    "scale",
  ];

  it("exports PLAN_DEFAULTS with entries for all plan tiers", () => {
    expect(SOURCE).toContain("export const PLAN_DEFAULTS");
    for (const tier of tiers) {
      const match = SOURCE.includes(`"${tier}":`) || SOURCE.includes(`${tier}:`);
      expect(match).toBe(true);
    }
  });

  it("every tier defines claude_tokens_daily", () => {
    for (const tier of tiers) {
      const tierIdx =
        SOURCE.indexOf(`"${tier}":`) !== -1
          ? SOURCE.indexOf(`"${tier}":`)
          : SOURCE.indexOf(`${tier}:`);
      expect(tierIdx).toBeGreaterThan(-1);
      const block = SOURCE.slice(tierIdx, tierIdx + 500);
      expect(block).toContain("claude_tokens_daily:");
    }
  });

  it("every tier defines voice_minutes_daily", () => {
    for (const tier of tiers) {
      const tierIdx =
        SOURCE.indexOf(`"${tier}":`) !== -1
          ? SOURCE.indexOf(`"${tier}":`)
          : SOURCE.indexOf(`${tier}:`);
      const block = SOURCE.slice(tierIdx, tierIdx + 500);
      expect(block).toContain("voice_minutes_daily:");
    }
  });

  it("every tier defines concurrent_dials", () => {
    for (const tier of tiers) {
      const tierIdx =
        SOURCE.indexOf(`"${tier}":`) !== -1
          ? SOURCE.indexOf(`"${tier}":`)
          : SOURCE.indexOf(`${tier}:`);
      const block = SOURCE.slice(tierIdx, tierIdx + 500);
      expect(block).toContain("concurrent_dials:");
    }
  });

  it("every tier defines knowledge_rows", () => {
    for (const tier of tiers) {
      const tierIdx =
        SOURCE.indexOf(`"${tier}":`) !== -1
          ? SOURCE.indexOf(`"${tier}":`)
          : SOURCE.indexOf(`${tier}:`);
      const block = SOURCE.slice(tierIdx, tierIdx + 500);
      expect(block).toContain("knowledge_rows:");
    }
  });

  it("every tier defines intake_rpm", () => {
    for (const tier of tiers) {
      const tierIdx =
        SOURCE.indexOf(`"${tier}":`) !== -1
          ? SOURCE.indexOf(`"${tier}":`)
          : SOURCE.indexOf(`${tier}:`);
      const block = SOURCE.slice(tierIdx, tierIdx + 500);
      expect(block).toContain("intake_rpm:");
    }
  });

  it("exports PlanTier type with all expected tiers", () => {
    expect(SOURCE).toMatch(/export type PlanTier/);
    for (const tier of tiers) {
      expect(SOURCE).toContain(`"${tier}"`);
    }
  });

  it("exports QuotaProfile interface", () => {
    expect(SOURCE).toMatch(/export interface QuotaProfile/);
  });
});
