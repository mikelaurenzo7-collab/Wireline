import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/**
 * The home landing carries an honest risk-reversal strip that answers a
 * visitor's real hesitations at a glance. Each line must stay true:
 *   - Free Builder needs no card
 *   - the browser demo needs no signup ("hear it before you pay")
 *   - the included number is a PAID-plan benefit (never implied for the free tier)
 *   - actions run under approvals
 *   - paid plans are month-to-month
 */
describe("home landing risk-reversal", () => {
  const landing = read("src/components/marketing/WireAgentLanding.tsx");

  it("surfaces the reassurance strip", () => {
    expect(landing).toContain("REASSURANCES");
    expect(landing).toContain("Build free — no card");
    expect(landing).toContain("Hear it live before you pay");
    expect(landing).toContain("You approve the actions");
    expect(landing).toContain("Cancel anytime");
  });

  it("ties the included number to paid plans so the free builder is not misrepresented", () => {
    expect(landing).toContain("Your own number on paid plans");
    expect(landing).not.toContain('"Your own Wireline number"');
  });

  it("repeats the low-risk close at the final call to action", () => {
    expect(landing).toContain("hear it live before you pay · cancel anytime");
  });
});
