import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("launch readiness DNC deferral", () => {
  it("keeps Federal DNC on a deferred checklist without failing GO or score", () => {
    const readiness = read("src/lib/launch-readiness.ts");
    const health = read("src/routes/health-routes.ts");
    const status = read("scripts/generate-launch-status.mjs");

    expect(readiness).toContain("deferred_checklist");
    expect(readiness).toContain("SCORE_CAPABILITY_IDS");
    expect(readiness).toContain("FEDERAL_DNC_API_URL+FEDERAL_DNC_API_KEY");
    expect(readiness).toContain("isFederalDncVendorConfigured");
    expect(readiness).toContain("...emailBlockers");
    const scoredCapabilityBlock = readiness.slice(
      readiness.indexOf("const SCORE_CAPABILITY_IDS"),
      readiness.indexOf("]);", readiness.indexOf("const SCORE_CAPABILITY_IDS")) + 3,
    );
    expect(scoredCapabilityBlock).toContain('"email_ready"');
    expect(scoredCapabilityBlock).not.toContain('"oauth_ready"');
    expect(readiness).toContain(
      "const campaignReady = launch_blockers.length === 0 && readyCount === scored.length",
    );
    expect(readiness).not.toContain("...complianceBlockers");

    expect(health).toContain("deferred_checklist: report.deferred_checklist");
    expect(status).toContain("deferred_checklist");
    expect(status).toContain("Only hard launch_blockers fail GO");
  });

  it("preserves runtime fail-closed for marketing outbound", () => {
    const federal = read("src/lib/federal-dnc-service.ts");
    const gate = read("src/lib/outbound-dial-gate.ts");
    expect(federal).toContain("assertFederalDncForMarketing");
    expect(federal).toContain("FEDERAL_DNC_NOT_CONFIGURED");
    expect(federal).toContain("opts.isPlatformOwner === true");
    expect(gate).toContain("assertFederalDncForMarketing");
    expect(gate).toContain("isPlatformOwnerUserId(opts.userId)");
    const dialer = read("src/services/campaign-dialer.ts");
    expect(dialer).toContain("isPlatformOwnerUserId(campaign.userId)");
    const ownerUser = read("src/lib/platform-owner-user.ts");
    expect(ownerUser).toContain("isOwnerEmail(row?.email)");
  });
});
