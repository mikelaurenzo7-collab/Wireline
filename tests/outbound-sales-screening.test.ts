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

const subscription = {
  san: "SAN-123456",
  seller_name: "Fixture Seller",
  area_codes: ["312"],
  expires_on: "2040-01-31",
  attested_at: ATTESTATION_AT.toISOString(),
  attested_by: "owner-1",
  vendor_project_id: "proj-seller-1",
  vendor_linked_at: ATTESTATION_AT.toISOString(),
};

async function loadGate(selectRows: unknown[][], optedOut = false, vendorConfigured = false) {
  vi.resetModules();
  let calls = 0;
  const limit = async () => selectRows[calls++] ?? [];
  const lookupFederalDnc = vi.fn(
    async (): Promise<{
      listed: boolean;
      source: "vendor" | "error" | "unconfigured";
      checked_at: string;
      list_version: string | null;
    }> => ({
      listed: false,
      source: "vendor",
      checked_at: ATTESTATION_AT.toISOString(),
      list_version: null,
    }),
  );
  const assertFederalDncForMarketing = vi.fn(() =>
    vendorConfigured
      ? { allowed: true as const, configured: true as const }
      : {
          allowed: false as const,
          configured: false as const,
          code: "FEDERAL_DNC_NOT_CONFIGURED" as const,
          message: "bulk blocked",
        },
  );
  const audit = vi.fn(async () => undefined);
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
    resolveCallingHoursForPhone: () => ({ allowed: true, timeZone: "America/Chicago" }),
  }));
  vi.doMock("../src/lib/federal-dnc-service", () => ({
    assertFederalDncForMarketing,
    lookupFederalDnc,
  }));
  vi.doMock("../src/lib/compliance", () => ({ isDncBlocked: async () => optedOut }));
  vi.doMock("../src/lib/outbound-purpose-audit", () => ({ recordOutboundPurposeAudit: audit }));
  const { evaluateOutboundDialGate } = await import("../src/lib/outbound-dial-gate");
  return { evaluateOutboundDialGate, lookupFederalDnc, assertFederalDncForMarketing, audit };
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
    const { evaluateOutboundDialGate, lookupFederalDnc, assertFederalDncForMarketing } =
      await loadGate([[attestedRow(null)], []]);
    const result = await evaluateOutboundDialGate({
      userId: "tenant-1",
      phone: "+13125550100",
      isMarketingCall: true,
      salesScreening: "one_off",
    });
    expect(result.allowed).toBe(true);
    expect(lookupFederalDnc).not.toHaveBeenCalled();
    expect(assertFederalDncForMarketing).not.toHaveBeenCalled();
  });

  it("blocks one-off sales until the workspace attestation is saved", async () => {
    const { evaluateOutboundDialGate, lookupFederalDnc } = await loadGate([[], []]);
    const result = await evaluateOutboundDialGate({
      userId: "tenant-1",
      phone: "+13125550100",
      isMarketingCall: true,
      salesScreening: "one_off",
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe("sales_attestation_required");
    expect(lookupFederalDnc).not.toHaveBeenCalled();
  });

  it("still blocks a listed number on one-off sales when the seller's project is linked", async () => {
    vi.stubEnv("FEDERAL_DNC_API_URL", "https://www.dncscrub.com/app/main/rpc/scrub");
    vi.stubEnv("FEDERAL_DNC_API_KEY", "scrub-login-id");
    const { evaluateOutboundDialGate, lookupFederalDnc, assertFederalDncForMarketing } =
      await loadGate([
        [
          {
            ...attestedRow("different-san"),
            dncSellerRegistration: subscription,
          },
        ],
        [],
      ]);
    lookupFederalDnc.mockResolvedValue({
      listed: true,
      source: "vendor",
      checked_at: ATTESTATION_AT.toISOString(),
      list_version: null,
    });
    const result = await evaluateOutboundDialGate({
      userId: "tenant-1",
      phone: "+13125550100",
      isMarketingCall: true,
      salesScreening: "one_off",
    });
    expect(assertFederalDncForMarketing).not.toHaveBeenCalled();
    expect(lookupFederalDnc).toHaveBeenCalledWith("+13125550100", {
      vendorProjectId: "proj-seller-1",
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.customerMessage).toBe(SALES_DNC_LISTED_MESSAGE);
  });

  it("does not screen one-off sales when a provider is configured without a SAN", async () => {
    vi.stubEnv("FEDERAL_DNC_API_URL", "https://www.dncscrub.com/app/main/rpc/scrub");
    vi.stubEnv("FEDERAL_DNC_API_KEY", "scrub-login-id");
    const { evaluateOutboundDialGate, lookupFederalDnc } = await loadGate([
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
    expect(lookupFederalDnc).not.toHaveBeenCalled();
  });

  it("keeps untagged sales bulk and fail-closed without a provider", async () => {
    const { evaluateOutboundDialGate, lookupFederalDnc, assertFederalDncForMarketing } =
      await loadGate([]);
    const result = await evaluateOutboundDialGate({
      userId: "tenant-1",
      phone: "+13125550100",
      isMarketingCall: true,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe("federal_dnc_unconfigured");
    expect(assertFederalDncForMarketing).toHaveBeenCalledOnce();
    expect(lookupFederalDnc).not.toHaveBeenCalled();
  });

  it.each([
    [null, "SELLER_DNC_REGISTRATION_REQUIRED"],
    [{ ...subscription, vendor_project_id: null }, "SELLER_DNC_REGISTRATION_PENDING"],
    [{ ...subscription, expires_on: "2020-01-31" }, "SELLER_DNC_REGISTRATION_EXPIRED"],
    [{ ...subscription, area_codes: ["773"] }, "SELLER_DNC_AREA_CODE_NOT_COVERED"],
  ] as const)("blocks bulk sales with subscription %j", async (dncSellerRegistration, code) => {
    const { evaluateOutboundDialGate, lookupFederalDnc } = await loadGate(
      [[], [{ dncSan: subscription.san, dncSellerRegistration }]],
      false,
      true,
    );
    const result = await evaluateOutboundDialGate({
      userId: "tenant-1",
      phone: "+13125550100",
      hasExpressWrittenConsent: true,
    });
    expect(result).toMatchObject({ allowed: false, federalDncCode: code });
    expect(lookupFederalDnc).not.toHaveBeenCalled();
  });

  it.each(["call", "sms"] as const)(
    "scopes a bulk %s screen to the linked seller project",
    async (channel) => {
      const { evaluateOutboundDialGate, lookupFederalDnc, audit } = await loadGate(
        [[], [{ dncSan: "OTHER-SAN", dncSellerRegistration: subscription }]],
        false,
        true,
      );
      const result = await evaluateOutboundDialGate({
        userId: "tenant-1",
        phone: "+13125550100",
        hasExpressWrittenConsent: true,
        audit: { channel },
      });
      expect(result.allowed).toBe(true);
      expect(lookupFederalDnc).toHaveBeenCalledExactlyOnceWith("+13125550100", {
        vendorProjectId: "proj-seller-1",
      });
      expect(audit).toHaveBeenCalledWith(
        expect.objectContaining({
          dncChecked: true,
          dncSource: "vendor",
          dncResult: "clear",
          dncListVersion: null,
        }),
      );
    },
  );

  it.each(["error", "unconfigured"] as const)(
    "blocks and records a %s lookup as unavailable",
    async (source) => {
      const { evaluateOutboundDialGate, lookupFederalDnc, audit } = await loadGate(
        [[], [{ dncSellerRegistration: subscription }]],
        false,
        true,
      );
      lookupFederalDnc.mockResolvedValue({
        listed: false,
        source,
        checked_at: ATTESTATION_AT.toISOString(),
        list_version: null,
      });
      const result = await evaluateOutboundDialGate({
        userId: "tenant-1",
        phone: "+13125550100",
        hasExpressWrittenConsent: true,
      });
      expect(result).toMatchObject({ allowed: false, reason: "federal_dnc_unconfigured" });
      expect(audit).toHaveBeenCalledWith(
        expect.objectContaining({
          decision: "blocked",
          dncResult: source,
          dncListVersion: null,
        }),
      );
    },
  );

  it("does not let a client callback purpose skip the one-call-per-day limit or grant consent", async () => {
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
      lookupFederalDnc: async () => false,
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
    });
    expect(recent.allowed).toBe(false);
    if (!recent.allowed) expect(recent.reason).toBe("self_recent_call_scheduled");
    expect(evaluateOutboundConsent).not.toHaveBeenCalled();

    const open = await evaluateOutboundDialGate({
      userId: "tenant-1",
      phone: "+13125550100",
      isMarketingCall: screening.isMarketingCall,
      requireFederalDncScreening: screening.requireFederalDncScreening,
      hasExpressWrittenConsent: screening.hasExpressWrittenConsent,
      isRequestedCallback: screening.isRequestedCallback,
    });
    expect(open.allowed).toBe(true);
    expect(evaluateOutboundConsent).toHaveBeenCalledWith(
      expect.objectContaining({ has_express_written_consent: false, is_marketing_call: false }),
    );
  });
});

describe("manual service retries and callbacks", () => {
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

  it.each([
    ["appointment_service", "busy", true, true],
    ["appointment_service", "no-answer", true, true],
    ["existing_customer", "completed", true, false],
    ["callback", "completed", true, true],
    ["callback", "ringing", true, false],
    ["appointment_service", "busy", false, false],
    [undefined, "busy", true, false],
  ] satisfies Array<[OutboundPurpose | undefined, string, boolean, boolean]>)(
    "handles %s with carrier outcome %s and receipt match %s",
    async (manualCallPurpose, outcome, matches, allowed) => {
      const { evaluateOutboundDialGate } = await loadGate([[priorCall(outcome, matches)]]);
      const result = await evaluateOutboundDialGate({
        userId: "tenant-1",
        phone: "+13125550100",
        isMarketingCall: false,
        manualCallPurpose,
      });
      expect(result.allowed).toBe(allowed);
      if (!result.allowed) expect(result.reason).toBe("skipped_duplicate");
    },
  );

  it("permits one service retry and still enforces an opt-out for a requested callback", async () => {
    const { evaluateOutboundDialGate } = await loadGate([
      [priorCall("busy"), { ...priorCall("no-answer"), id: 2n }],
    ]);
    const request = { userId: "tenant-1", phone: "+13125550100", isMarketingCall: false };
    expect(
      await evaluateOutboundDialGate({ ...request, manualCallPurpose: "appointment_service" }),
    ).toMatchObject({ allowed: false, reason: "skipped_duplicate" });

    const optedOut = await loadGate([[priorCall("completed")]], true);
    expect(
      await optedOut.evaluateOutboundDialGate({ ...request, manualCallPurpose: "callback" }),
    ).toMatchObject({ allowed: false, reason: "blocked_internal_dnc" });
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
