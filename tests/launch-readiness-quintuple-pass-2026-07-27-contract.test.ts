import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("launch readiness quintuple-pass 2026-07-27", () => {
  it("gates outbound SMS on live-work entitlement before Runtime Balance reserve", () => {
    const trial = read("src/lib/trial-gate.ts");
    expect(trial).toContain("export async function assertLiveWorkEntitlementForUser");
    expect(trial).toContain('code: "ACTIVATION_REQUIRED"');
    expect(trial).toContain('code: "BILLING_STATE_UNAVAILABLE"');
    expect(trial).toContain("isOwnerEmail");

    const twilio = read("src/lib/twilio-service.ts");
    expect(twilio).toContain("assertLiveWorkEntitlementForUser");
    expect(twilio).toContain("const entitlement = await assertLiveWorkEntitlementForUser(userId)");
    // Pin sendTenantMessage order: entitlement before the outbound reservation.
    // (adjustMessagingReservation also calls reserveRuntimeUsage later for segment true-up.)
    const entitlementCall = twilio.indexOf(
      "const entitlement = await assertLiveWorkEntitlementForUser(userId)",
    );
    const reserveCall = twilio.indexOf("const reservation = await reserveRuntimeUsage({");
    expect(entitlementCall).toBeGreaterThan(-1);
    expect(reserveCall).toBeGreaterThan(-1);
    expect(entitlementCall).toBeLessThan(reserveCall);
    expect(twilio).toContain("code: entitlement.code");
    expect(twilio).toContain("recovery_path: entitlement.recovery_path");

    const resultType = read("src/lib/twilio-service-base.ts");
    expect(resultType).toContain("code?: string");
    expect(resultType).toContain("recovery_path?: string");
  });

  it("only offers annual TrialGate checkout when Stripe annual is configured", () => {
    const modal = read("src/components/TrialGateModal.tsx");
    expect(modal).toContain('authFetch("/api/billing/plans"');
    expect(modal).toContain("annual_configured");
    expect(modal).toContain("BillingPlansResponse");
    expect(modal).toContain("checkout(tier.id, tier.interval)");
    expect(modal).toContain("Annual billing is not configured for checkout yet");
    // Catalog-only fallback must not claim annual is buyable.
    expect(modal).toContain("annual_configured: false");
  });

  it("does not treat failed fleet/learning/audit fetches as empty success", () => {
    const fleet = read("src/lib/fleet-setup-progress.ts");
    expect(fleet).toContain("if (!r.ok) return 0");

    const learning = read("src/components/insights/LearningMetricsView.tsx");
    expect(learning).toContain("if (!agentsResponse.ok)");
    expect(learning).toContain("Learning metrics unavailable");

    const audit = read("src/components/admin/AuditActivityPanel.tsx");
    expect(audit).toContain("if (!r.ok)");
    expect(audit).toContain("summaryError");
    expect(audit).toContain("recentError");
    expect(audit).toContain("Could not load AI usage summary.");
    expect(audit).toContain("Could not load recent audit activity.");
  });

  it("uses Runtime Balance recovery_action machine codes on voice wallet blocks", () => {
    const guard = read("src/lib/voice-wallet-guard.ts");
    expect(guard).toContain('recovery_action: "restore_runtime_balance"');
    expect(guard).toContain('recovery_action: "add_runtime_balance"');
    expect(guard).not.toContain("restore_conversation_balance");
    expect(guard).not.toContain("add_conversation_balance");

    const grace = read("src/lib/voice-completion-grace.ts");
    expect(grace).toContain("temporary negative Runtime Balance");
    expect(grace).not.toContain("temporary negative Conversation Balance");
  });

  it("documents founder catalog v6 prices in the active P0 billing ops note", () => {
    const note = read("docs/P0_BILLING_OPS_NOTE.md");
    expect(note).toContain("$19");
    expect(note).toContain("$39");
    expect(note).toContain("$79");
    expect(note).toContain("$159");
    expect(note).not.toMatch(/\| Starter \| \$9 \|/);
    expect(note).not.toMatch(/\| Starter Plus \| \$24 \|/);
    expect(note).not.toMatch(/\| Pro \| \$59 \|/);
    expect(note).not.toMatch(/\| Business \| \$149 \|/);
    expect(note).toContain("Runtime Balance");
  });
});
