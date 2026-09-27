import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ federalDncConfigured: true }));
vi.mock("../src/lib/billing-release", () => ({ selfServeBillingReleaseBlockers: () => [] }));
vi.mock("../src/lib/integrations-registry", () => ({
  getIntegrationsStatus: () =>
    ["stripe", "twilio", "resend", "resend-feedback"].map((id) => ({
      id,
      status: "configured",
    })),
}));
vi.mock("../src/lib/env-validator", () => ({ validateEnv: () => ({ valid: true }) }));
vi.mock("../src/lib/tenant-economics", () => ({ assertPlanMarginFloors: () => ({ ok: true }) }));
vi.mock("../src/lib/federal-dnc-service", () => ({
  isFederalDncVendorConfigured: () => h.federalDncConfigured,
}));
vi.mock("../src/lib/voice/openai-sip-worker-config", () => ({
  isPersistentVoiceWorkerConfigured: () => true,
}));

import { evaluateLaunchReadiness } from "../src/lib/launch-readiness";

beforeEach(() => {
  h.federalDncConfigured = true;
  for (const name of [
    "OPENAI_API_KEY",
    "OPENAI_PROJECT_ID",
    "OPENAI_WEBHOOK_SECRET",
    "STRIPE_WEBHOOK_SECRET",
    "AGENTMAIL_API_KEY",
  ]) {
    vi.stubEnv(name, "test-configured");
  }
});
afterEach(() => vi.unstubAllEnvs());

describe("outbound capability readiness", () => {
  it("does not certify campaigns from configured providers while recipient consent is unsupported", () => {
    const report = evaluateLaunchReadiness();
    expect(report.campaign_ready).toBe(true);
    expect(report.overall_score).toBe(100);
    expect(report.launch_blockers).toEqual([]);
    expect(report.outbound_campaign_ready).toBe(false);
    expect(report.deferred_checklist).toContain("AUDITABLE_RECIPIENT_CONSENT");
    expect(
      report.capabilities.find((capability) => capability.id === "compliance_ready"),
    ).toMatchObject({ level: "degraded", blockers: ["AUDITABLE_RECIPIENT_CONSENT"] });
  });

  it("reports missing DNC configuration separately from the missing consent capability", () => {
    h.federalDncConfigured = false;
    const report = evaluateLaunchReadiness();
    expect(report.campaign_ready).toBe(true);
    expect(report.outbound_campaign_ready).toBe(false);
    expect(report.deferred_checklist).toEqual([
      "FEDERAL_DNC_API_URL+FEDERAL_DNC_API_KEY",
      "AUDITABLE_RECIPIENT_CONSENT",
    ]);
  });
});
