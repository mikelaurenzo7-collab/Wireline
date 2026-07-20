import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("settings bootstrap activation status", () => {
  it("never inserts silent trialing rows from settings / branding bootstrap", () => {
    const settings = read("src/routes/settings-routes.ts");
    const branding = read("src/routes/company-identity-settings-guard-routes.ts");
    const signup = read("src/lib/trial-gate.ts");

    expect(signup).toContain('subscriptionStatus: "pending_activation"');

    // Bootstrap inserts must match signup — Free Builder starts pending_activation.
    // `trialing` with trialEndsAt null bypasses enforceLiveWorkActivation forever.
    for (const [label, source] of [
      ["settings-routes", settings],
      ["company-identity-settings-guard-routes", branding],
    ] as const) {
      expect(source, label).toContain(
        'subscriptionStatus: isOwnerEmail(req.user.email) ? "active" : "pending_activation"',
      );
      expect(source, label).not.toMatch(
        /subscriptionStatus:\s*isOwnerEmail\([^)]+\)\s*\?\s*"active"\s*:\s*"trialing"/,
      );
    }
  });
});
