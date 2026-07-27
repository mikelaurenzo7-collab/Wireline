/**
 * Contract: Cadence AI Stripe account + GDPR purge coverage.
 *
 * Locks two launch-integrity invariants discovered in the 2026-07-20 e2e audit:
 * 1. Runtime Stripe price fallbacks must point at Cadence AI (acct_1TkyXL8e6If87QKm),
 *    never the retired Wireline Stripe account (JohDtfy3Ik).
 * 2. Shareable recap artifacts must be in the GDPR deletion/export registry.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("Cadence Stripe + GDPR purge contracts", () => {
  it("plan-catalog fallbacks use the current Cadence AI price ids", () => {
    const catalog = read("src/lib/plan-catalog.ts");
    expect(catalog).toContain("price_1Tv9K58e6If87QKm7rzn3MNS");
    expect(catalog).toContain("price_1Tx5X78e6If87QKmltXpASRU");
    expect(catalog).not.toMatch(/JohDtfy3Ik/);
    expect(catalog).not.toMatch(/price_1Tr[a-zA-Z0-9]+JohDtfy3Ik/);
  });

  it(".env.example documents Cadence catalog price ids, not the retired account", () => {
    const example = read(".env.example");
    expect(example).toContain("acct_1TkyXL8e6If87QKm");
    expect(example).toContain("price_1Tx5X78e6If87QKmltXpASRU");
    expect(example).toContain("price_1Tv9K58e6If87QKm7rzn3MNS");
    expect(example).toContain("price_1Tv9K58e6If87QKmYM6sqWkL");
    expect(example).not.toMatch(/JohDtfy3Ik/);
  });

  it("GDPR account purge includes shareable recap artifacts", () => {
    const deletion = read("src/lib/account-deletion.ts");
    expect(deletion).toContain('table: "wireline_recap_artifacts"');
    expect(deletion).toMatch(
      /table:\s*"wireline_recap_artifacts"[\s\S]*?userColumns:\s*\["user_id"\]/,
    );
  });
});
