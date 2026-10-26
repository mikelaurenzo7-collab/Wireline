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
import { STRIPE_PLANS } from "../src/lib/plan-catalog";

beforeEach(() => {
  h.federalDncConfigured = true;
  for (const plan of STRIPE_PLANS.filter((plan) => plan.catalogFamily === "channels")) {
    vi.stubEnv(plan.priceIdEnv!, "");
    vi.stubEnv(plan.annualPriceIdEnv!, "");
  }
  vi.stubEnv("STRIPE_VOICE_PRICE_ID", "price_fixture");
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
  it("requires a configured sale interval and keeps held SMS out of the eligible catalog", () => {
    vi.stubEnv("STRIPE_VOICE_PRICE_ID", "");
    expect(evaluateLaunchReadiness().launch_blockers).toContain("NO_CONFIGURED_NEW_SALE_PRICES");
    vi.stubEnv("STRIPE_EMAIL_ANNUAL_PRICE_ID", "price_fixture");
    vi.stubEnv("STRIPE_SMS_PRICE_ID", "price_held_sms");
    const report = evaluateLaunchReadiness();
    expect(report.campaign_ready).toBe(true);
    expect(report.new_sale_catalog.configured).toMatchObject([
      { plan_id: "email", interval: "year" },
    ]);
    expect(report.new_sale_catalog.configured).toHaveLength(1);
    expect(report.new_sale_catalog.deferred).toHaveLength(19);
    expect(report.new_sale_catalog.deferred).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ plan_id: "personal", interval: "month" }),
        expect.objectContaining({ plan_id: "personal", interval: "year" }),
      ]),
    );
    expect(
      [...report.new_sale_catalog.configured, ...report.new_sale_catalog.deferred].some((entry) =>
        entry.channels.includes("sms"),
      ),
    ).toBe(false);
  });

  it("keeps transactional delivery mandatory while managed-mail readiness follows offered channels", () => {
    vi.stubEnv("AGENTMAIL_API_KEY", "");
    expect(evaluateLaunchReadiness().campaign_ready).toBe(true);
    expect(
      evaluateLaunchReadiness().capabilities.find((item) => item.id === "managed_email_ready")
        ?.blockers,
    ).toEqual(["AGENTMAIL_API_KEY"]);
    vi.stubEnv("STRIPE_EMAIL_PRICE_ID", "price_fixture");
    expect(evaluateLaunchReadiness().launch_blockers).toContain("AGENTMAIL_API_KEY");
  });
  it("does not wait on a per-recipient signature once registry screening is configured", () => {
    const report = evaluateLaunchReadiness();
    expect(report.campaign_ready).toBe(true);
    expect(report.overall_score).toBe(100);
    expect(report.launch_blockers).toEqual([]);
    expect(report.outbound_campaign_ready).toBe(true);
    expect(report.deferred_checklist).not.toContain("AUDITABLE_RECIPIENT_CONSENT");
    expect(
      report.capabilities.find((capability) => capability.id === "compliance_ready"),
    ).toMatchObject({ level: "ready", blockers: [] });
  });

  it("reports missing DNC configuration as the remaining outbound screen", () => {
    h.federalDncConfigured = false;
    const report = evaluateLaunchReadiness();
    expect(report.campaign_ready).toBe(true);
    expect(report.outbound_campaign_ready).toBe(false);
    expect(report.deferred_checklist).toEqual(["FEDERAL_DNC_API_URL+FEDERAL_DNC_API_KEY"]);
  });
});
