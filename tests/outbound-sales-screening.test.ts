import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SALES_DNC_ATTESTATION_VERSION, SALES_DNC_LISTED_MESSAGE } from "../src/lib/outbound-compliance-copy";
import { currentSalesDncAttestation } from "../src/lib/sales-dnc-attestation";

const ATTESTATION_AT = new Date("2026-10-26T15:00:00.000Z");

function attestedRow(san: string | null) {
  return {
    dncSan: san,
    dncSellerRegistration: null,
    salesDncAttestationUserId: "owner-1",
    salesDncAttestationAt: ATTESTATION_AT,
    salesDncAttestationVersion: SALES_DNC_ATTESTATION_VERSION,
  };
}

async function loadGate(selectRows: unknown[][]) {
  vi.resetModules();
  let calls = 0;
  const isFederalDncListed = vi.fn(async () => false);
  const assertFederalDncForMarketing = vi.fn(() => ({
    allowed: false as const,
    configured: false as const,
    code: "FEDERAL_DNC_NOT_CONFIGURED" as const,
    message: "bulk blocked",
  }));
  vi.doMock("../src/lib/server-context", () => ({
    drizzle: {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => selectRows[calls++] ?? [],
          }),
        }),
      }),
    },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }));
  vi.doMock("../src/lib/tcpa-calling-hours", () => ({
    resolveCallingHoursForPhone: () => ({ allowed: true, timeZone: "America/Chicago" }),
  }));
  vi.doMock("../src/lib/federal-dnc-service", () => ({
    assertFederalDncForMarketing,
    isFederalDncListed,
  }));
  vi.doMock("../src/lib/compliance", () => ({ isDncBlocked: async () => false }));
  const { evaluateOutboundDialGate } = await import("../src/lib/outbound-dial-gate");
  return { evaluateOutboundDialGate, isFederalDncListed, assertFederalDncForMarketing };
}

describe("one-off and bulk sales screening", () => {
  beforeEach(() => {
    vi.stubEnv("FEDERAL_DNC_API_URL", "");
    vi.stubEnv("FEDERAL_DNC_API_KEY", "");
    vi.stubEnv("FEDERAL_DNC_PROVIDER", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("accepts a stored attestation timestamp that arrives as text", () => {
    const parsed = currentSalesDncAttestation({
      salesDncAttestationUserId: "owner-1",
      salesDncAttestationAt: "2026-10-26T15:00:00.000Z",
      salesDncAttestationVersion: SALES_DNC_ATTESTATION_VERSION,
    });
    expect(parsed?.at.toISOString()).toBe("2026-10-26T15:00:00.000Z");
    expect(parsed?.version).toBe(SALES_DNC_ATTESTATION_VERSION);
  });

  it("lets one-off sales through without a provider after the workspace attestation", async () => {
    const { evaluateOutboundDialGate, isFederalDncListed, assertFederalDncForMarketing } =
      await loadGate([[attestedRow(null)], []]);
    const result = await evaluateOutboundDialGate({
      userId: "tenant-1",
      phone: "+13125550100",
      isMarketingCall: true,
      salesScreening: "one_off",
    });
    expect(result.allowed).toBe(true);
    expect(isFederalDncListed).not.toHaveBeenCalled();
    expect(assertFederalDncForMarketing).not.toHaveBeenCalled();
  });

  it("blocks one-off sales until the workspace attestation is saved", async () => {
    const { evaluateOutboundDialGate, isFederalDncListed } = await loadGate([[], []]);
    const result = await evaluateOutboundDialGate({
      userId: "tenant-1",
      phone: "+13125550100",
      isMarketingCall: true,
      salesScreening: "one_off",
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe("sales_attestation_required");
    expect(isFederalDncListed).not.toHaveBeenCalled();
  });

  it("still blocks a listed number on one-off sales when a provider and SAN are both configured", async () => {
    vi.stubEnv("FEDERAL_DNC_API_URL", "https://www.dncscrub.com/app/main/rpc/scrub");
    vi.stubEnv("FEDERAL_DNC_API_KEY", "scrub-login-id");
    const { evaluateOutboundDialGate, isFederalDncListed, assertFederalDncForMarketing } =
      await loadGate([[attestedRow("san-123456")], []]);
    isFederalDncListed.mockResolvedValue(true);
    const result = await evaluateOutboundDialGate({
      userId: "tenant-1",
      phone: "+13125550100",
      isMarketingCall: true,
      salesScreening: "one_off",
    });
    expect(assertFederalDncForMarketing).not.toHaveBeenCalled();
    expect(isFederalDncListed).toHaveBeenCalledWith("+13125550100", { vendorProjectId: "SAN-123456" });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.customerMessage).toBe(SALES_DNC_LISTED_MESSAGE);
  });

  it("does not screen one-off sales when a provider is configured without a SAN", async () => {
    vi.stubEnv("FEDERAL_DNC_API_URL", "https://www.dncscrub.com/app/main/rpc/scrub");
    vi.stubEnv("FEDERAL_DNC_API_KEY", "scrub-login-id");
    const { evaluateOutboundDialGate, isFederalDncListed } = await loadGate([
      [attestedRow(null)],
      [],
    ]);
    const result = await evaluateOutboundDialGate({
      userId: "tenant-1",
      phone: "+13125550100",
      isMarketingCall: true,
      salesScreening: "one_off",
    });
    expect(result.allowed).toBe(true);
    expect(isFederalDncListed).not.toHaveBeenCalled();
  });

  it("keeps untagged sales bulk and fail-closed without a provider", async () => {
    const { evaluateOutboundDialGate, isFederalDncListed, assertFederalDncForMarketing } =
      await loadGate([]);
    const result = await evaluateOutboundDialGate({
      userId: "tenant-1",
      phone: "+13125550100",
      isMarketingCall: true,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe("federal_dnc_unconfigured");
    expect(assertFederalDncForMarketing).toHaveBeenCalledOnce();
    expect(isFederalDncListed).not.toHaveBeenCalled();
  });
});
