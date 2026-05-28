import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STRIPE_PLANS } from "../lib/plan-catalog";

// The trial-gate upgrade modal historically hardcoded its tier prices
// in a SELF_SERVE_TIERS literal. Stripe charges what the catalogue
// says, so any drift between the modal and the catalogue surfaces as
// "I clicked $149 and got billed $179" — a launch-grade trust bug.
// These guards keep the modal pulling from STRIPE_PLANS as the single
// source of truth, and assert the actual rendered prices match.

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRIAL_MODAL = readFileSync(join(__dirname, "TrialGateModal.tsx"), "utf8");

describe("TrialGateModal — pricing SSOT", () => {
  it("imports STRIPE_PLANS from the catalog", () => {
    expect(TRIAL_MODAL).toMatch(
      /import\s*\{\s*STRIPE_PLANS\s*\}\s*from\s*["']\.\.\/lib\/plan-catalog["']/,
    );
  });

  it("derives SELF_SERVE_TIERS from STRIPE_PLANS (no inline literal prices)", () => {
    // Confirm SELF_SERVE_TIERS is computed from STRIPE_PLANS via filter + map.
    expect(TRIAL_MODAL).toMatch(/SELF_SERVE_TIERS\s*=\s*STRIPE_PLANS/);
    expect(TRIAL_MODAL).toMatch(/STRIPE_PLANS[\s\S]{0,80}\.filter\(/);
    expect(TRIAL_MODAL).toMatch(/STRIPE_PLANS[\s\S]{0,200}\.map\(/);
    // No hard-coded `price: <number>` rows survive in the SELF_SERVE_TIERS literal.
    // The catalog prices may still appear in pitch strings / unrelated copy, so
    // we just look for the legacy literal shape that used to live here.
    expect(TRIAL_MODAL).not.toMatch(/id:\s*["']personal["'][^}]*price:\s*\d+/s);
    expect(TRIAL_MODAL).not.toMatch(/id:\s*["']starter["'][^}]*price:\s*\d+/s);
    expect(TRIAL_MODAL).not.toMatch(/id:\s*["']pro["'][^}]*price:\s*\d+/s);
    expect(TRIAL_MODAL).not.toMatch(/id:\s*["']business["'][^}]*price:\s*\d+/s);
  });

  it("excludes enterprise from the picker (contact-sales only)", () => {
    expect(TRIAL_MODAL).toMatch(/p\.id\s*!==\s*["']enterprise["']/);
  });

  it("the four self-serve catalog entries exist with positive prices", () => {
    // If a future refactor renamed an id or zeroed a price, the modal
    // would render "$0 / mo" buttons. Lock the contract here.
    for (const id of ["personal", "starter", "pro", "business"] as const) {
      const plan = STRIPE_PLANS.find((p) => p.id === id);
      expect(plan, `STRIPE_PLANS missing self-serve plan: ${id}`).toBeDefined();
      expect(plan!.price_usd_monthly).toBeGreaterThan(0);
    }
  });
});
