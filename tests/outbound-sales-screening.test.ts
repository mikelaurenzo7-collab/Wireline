import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SALES_DNC_ATTESTATION_VERSION,
  SALES_DNC_LISTED_MESSAGE,
} from "../src/lib/outbound-compliance-copy";
import { currentSalesDncAttestation } from "../src/lib/sales-dnc-attestation";
import { screenedDirectOutboundCall } from "../src/lib/outbound-call-purpose";
import type { OutboundPurpose } from "../src/lib/outbound-call-purpose";

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

async function loadGate(selectRows: unknown[][], optedOut = false, inHours = true, knownState = true) {
  vi.resetModules();
  let calls = 0;
  const limit = async () => selectRows[calls++] ?? [];
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
            limit,
            orderBy: () => ({ limit }),
          }),
        }),
      }),
    },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }));
  vi.doMock("../src/lib/tcpa-calling-hours", () => ({
    resolveCallingHoursForPhone: () => ({ allowed: inHours, state: knownState ? "IL" : null, inferred: knownState, timeZone: "America/Chicago", startHour: 9, endHour: 20 }),
  }));
  vi.doMock("../src/lib/federal-dnc-service", () => ({
    assertFederalDncForMarketing,
    isFederalDncListed,
  }));
  vi.doMock("../src/lib/compliance", () => ({ isDncBlocked: async () => optedOut }));
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
    expect(isFederalDncListed).toHaveBeenCalledWith("+13125550100", {
      vendorProjectId: "SAN-123456",
    });
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

  it("does not let a client callback purpose grant consent", async () => {
    const screening = screenedDirectOutboundCall("callback");
    expect(screening.isRequestedCallback).toBe(false);
    expect(screening.hasExpressWrittenConsent).toBe(false);
    const evaluateOutboundConsent = vi.fn(() => ({
      allowed: true,
      rule: "one_party",
      state: "IL",
      must_disclose_recording: true,
      must_offer_opt_out: true,
      disclosure_script: "script",
    }));
    vi.resetModules();
    vi.doMock("../src/lib/server-context", () => ({
      drizzle: {
        select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
      },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));
    vi.doMock("../src/lib/tcpa-calling-hours", () => ({
      resolveCallingHoursForPhone: () => ({ allowed: true, timeZone: "America/Chicago" }),
    }));
    vi.doMock("../src/lib/federal-dnc-service", () => ({
      assertFederalDncForMarketing: () => ({ allowed: true, configured: true }),
      isFederalDncListed: async () => false,
    }));
    vi.doMock("../src/lib/compliance", () => ({ isDncBlocked: async () => false }));
    vi.doMock("../src/lib/tcpa-consent", () => ({ evaluateOutboundConsent }));
    const { evaluateOutboundDialGate } = await import("../src/lib/outbound-dial-gate");
    const recent = await evaluateOutboundDialGate({
      userId: "tenant-1",
      phone: "+13125550100",
      isMarketingCall: screening.isMarketingCall,
      requireFederalDncScreening: screening.requireFederalDncScreening,
      hasExpressWrittenConsent: screening.hasExpressWrittenConsent,
      isRequestedCallback: screening.isRequestedCallback,
      lastCalledAt: new Date(),
      manualCallPurpose: screening.callPurpose,
    });
    expect(recent.allowed).toBe(true);
    expect(evaluateOutboundConsent).toHaveBeenCalledWith(
      expect.objectContaining({ has_express_written_consent: false, is_marketing_call: false }),
    );
  });
});

describe("owner-reviewed non-sales repeat calls", () => {
  const priorCall = (status: string, matches = true) => ({
    id: 1n,
    callId: "carrier-one",
    metadata: {
      native_voice: {
        twilio_call_sid: matches ? "carrier-one" : "different-call",
        carrier_status: status,
      },
    },
  });

  afterEach(() => vi.resetModules());

  it.each(["personal", "appointment_service", "existing_customer", "returning_contact", "callback"] as OutboundPurpose[])(
    "allows a second reviewed %s call after a completed attempt",
    async (manualCallPurpose) => {
      const { evaluateOutboundDialGate } = await loadGate([[priorCall("completed")]]);
      const result = await evaluateOutboundDialGate({
        userId: "tenant-1",
        phone: "+13125550100",
        isMarketingCall: false,
        manualCallPurpose,
        lastCalledAt: new Date(),
      });
      expect(result.allowed).toBe(true);
    },
  );

  it("keeps the repeat limit for automated calls and an opt-out for reviewed calls", async () => {
    const { evaluateOutboundDialGate } = await loadGate([
      [priorCall("completed")],
    ]);
    const request = { userId: "tenant-1", phone: "+13125550100", isMarketingCall: false };
    expect(
      await evaluateOutboundDialGate(request),
    ).toMatchObject({ allowed: false, reason: "skipped_duplicate" });

    const optedOut = await loadGate([[priorCall("completed")]], true);
    expect(
      await optedOut.evaluateOutboundDialGate({ ...request, manualCallPurpose: "personal" }),
    ).toMatchObject({ allowed: false, reason: "blocked_internal_dnc" });
  });
});

describe("explicit after-hours service calling", () => {
  afterEach(() => vi.resetModules());
  const request = {
    userId: "tenant-1",
    phone: "+13125550100",
    isMarketingCall: false,
    manualCallPurpose: "appointment_service" as const,
    afterHoursServiceConfirmed: true,
    audit: { channel: "call" as const, attested: true, confirmations: { nonsales: true } },
  };

  it("allows reviewed service with current recipient timing authorization", async () => {
    const { evaluateOutboundDialGate } = await loadGate([], false, false);
    expect(await evaluateOutboundDialGate(request)).toMatchObject({ allowed: true });
  });

  it("retains hours for missing confirmation, automation, SMS, personal and sales", async () => {
    for (const patch of [
      { afterHoursServiceConfirmed: false },
      { manualCallPurpose: undefined },
      { audit: { ...request.audit, channel: "sms" as const } },
      { manualCallPurpose: "personal" as const },
      { audit: { ...request.audit, attested: false } },
      { audit: { ...request.audit, confirmations: { nonsales: false } } },
      { isMarketingCall: true, salesScreening: "one_off" as const },
    ]) {
      const { evaluateOutboundDialGate } = await loadGate([[], []], false, false);
      expect(await evaluateOutboundDialGate({ ...request, ...patch })).toMatchObject({
        allowed: false, reason: "outside_permitted_calling_hours",
      });
    }
  });

  it("retains the opt-out and unknown-jurisdiction restrictions", async () => {
    const blocked = await loadGate([], true, false);
    expect(await blocked.evaluateOutboundDialGate(request)).toMatchObject({
      allowed: false, reason: "blocked_internal_dnc",
    });
    const unknown = await loadGate([], false, false, false);
    expect(await unknown.evaluateOutboundDialGate(request)).toMatchObject({
      allowed: false, reason: "outside_permitted_calling_hours",
    });
  });
});

describe("opted-out numbers", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("skips the permission prompt and does not save a confirmation", async () => {
    vi.resetModules();
    const rememberContactOutbound = vi.fn();
    const readContactOutboundRecord = vi.fn();
    vi.doMock("../src/lib/server-context", () => ({
      drizzle: {},
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));
    vi.doMock("../src/lib/compliance", () => ({ isDncBlocked: async () => true }));
    vi.doMock("../src/lib/outbound-contact-consent", () => ({
      readContactOutboundRecord,
      rememberContactOutbound,
    }));
    vi.doMock("../src/lib/outbound-relationship", () => ({
      deriveRelationship: vi.fn(),
    }));
    const { screenManualOutbound } = await import("../src/lib/outbound-manual-screening");
    const result = await screenManualOutbound({
      userId: "tenant-1",
      phone: "+13125550100",
      channel: "call",
      requestedPurpose: "appointment_service",
      permissionConfirmed: true,
      nonsalesConfirmed: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("DO_NOT_CONTACT");
      expect(result.error).toMatch(/asked not to be contacted/);
    }
    expect(rememberContactOutbound).not.toHaveBeenCalled();
    expect(readContactOutboundRecord).not.toHaveBeenCalled();
  });
});

it("keeps the owner's explicit sales choice on a one-off voice call to a returning contact", async () => {
  vi.resetModules();
  const rememberContactOutbound = vi.fn(async () => {});
  const recordSalesDncAttestation = vi.fn(async () => {});
  vi.doMock("../src/lib/server-context", () => ({
    drizzle: {},
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }));
  vi.doMock("../src/lib/compliance", () => ({ isDncBlocked: async () => false }));
  vi.doMock("../src/lib/outbound-contact-consent", () => ({
    readContactOutboundRecord: async () => ({ permissionConfirmed: true, nonsalesConfirmed: true }),
    rememberContactOutbound,
  }));
  vi.doMock("../src/lib/sales-dnc-attestation", () => ({ recordSalesDncAttestation }));
  const { screenManualOutbound } = await import("../src/lib/outbound-manual-screening");
  const result = await screenManualOutbound({
    userId: "tenant-1",
    phone: "+13125550100",
    channel: "call",
    requestedPurpose: "sales",
    relationship: {
      kind: "returning_contact",
      source: "call",
      sourceId: "inbound-1",
      at: ATTESTATION_AT.toISOString(),
    },
    salesAttestationConfirmed: true,
  });
  expect(result).toMatchObject({
    ok: true,
    screening: { callPurpose: "sales", requestedCallPurpose: "sales", isMarketingCall: true },
  });
  expect(recordSalesDncAttestation).toHaveBeenCalledOnce();
  expect(rememberContactOutbound).toHaveBeenCalledWith(
    expect.objectContaining({ purpose: "sales" }),
  );
});
