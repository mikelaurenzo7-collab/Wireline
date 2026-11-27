import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SALES_ATTESTATION_REQUIRED_MESSAGE,
  SALES_DNC_ATTESTATION_VERSION,
} from "../src/lib/outbound-compliance-copy";
import { recordedCallIds, textConfirmationsFromBody } from "../src/lib/approved-text-confirmations";

const ATTESTATION_AT = new Date("2026-10-26T15:00:00.000Z");

function attestedRow() {
  return {
    dncSan: null,
    dncSellerRegistration: null,
    salesDncAttestationUserId: "owner-1",
    salesDncAttestationAt: ATTESTATION_AT,
    salesDncAttestationVersion: SALES_DNC_ATTESTATION_VERSION,
  };
}

async function loadApprovedText(
  selectRows: unknown[][],
  options: { callingHoursAllowed?: boolean } = {},
) {
  vi.resetModules();
  let calls = 0;
  const limit = async () => selectRows[calls++] ?? [];
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
    resolveCallingHoursForPhone: () => ({
      allowed: options.callingHoursAllowed ?? true,
      timeZone: "America/Chicago",
      inferred: false,
      reason: "outside_calling_hours",
    }),
  }));
  vi.doMock("../src/lib/federal-dnc-service", () => ({
    assertFederalDncForMarketing: () => ({
      allowed: false as const,
      configured: false as const,
      code: "FEDERAL_DNC_NOT_CONFIGURED" as const,
      message: "bulk blocked",
    }),
    isFederalDncListed: async () => false,
  }));
  vi.doMock("../src/lib/compliance", () => ({ isDncBlocked: async () => false }));
  vi.doMock("../src/lib/outbound-relationship", () => ({
    deriveRelationship: async () => null,
  }));
  vi.doMock("../src/lib/outbound-contact-consent", () => ({
    readContactOutboundRecord: async () => ({
      permissionConfirmed: false,
      nonsalesConfirmed: false,
      lastPurpose: null,
      customerSince: null,
    }),
    rememberContactOutbound: async () => {},
  }));
  const { screenApprovedText, smsActionResult } = await import("../src/lib/action-engine");
  const { evaluateOutboundDialGate } = await import("../src/lib/outbound-dial-gate");
  return { screenApprovedText, smsActionResult, evaluateOutboundDialGate };
}

// Each test loads the action engine afresh behind its own mocks, and the first
// load compiles that whole module graph: over a second alone, and past the
// five-second default when the full suite is running beside it.
describe("approved text confirmations", { timeout: 20_000 }, () => {
  beforeEach(() => {
    vi.stubEnv("FEDERAL_DNC_API_URL", "");
    vi.stubEnv("FEDERAL_DNC_API_KEY", "");
    vi.stubEnv("FEDERAL_DNC_PROVIDER", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("lets an unsent text be approved again but keeps a possibly delivered one final", async () => {
    const { smsActionResult } = await loadApprovedText([]);
    expect(
      smsActionResult({
        ok: false,
        code: "SMS_SENDER_UNREGISTERED",
        reason: "This line isn't approved by US carriers for texting yet, so the text wasn't sent.",
      }),
    ).toEqual({
      success: false,
      errorCode: "SMS_SENDER_UNREGISTERED",
      error: "This line isn't approved by US carriers for texting yet, so the text wasn't sent.",
      retryable: true,
    });
    expect(
      smsActionResult({
        ok: false,
        code: "SMS_PROVIDER_OUTCOME_AMBIGUOUS",
        reason: "Delivery status is unknown.",
        providerOutcomeAmbiguous: true,
        doNotResend: true,
      }),
    ).not.toHaveProperty("retryable");
    expect(smsActionResult({ ok: true })).toEqual({ success: true });
  });

  it("matches a raw carrier id and the openai prefix as the same call", () => {
    expect(recordedCallIds("CA123")).toEqual(["CA123", "openai:CA123"]);
    expect(recordedCallIds("openai:CA123")).toEqual(["openai:CA123", "CA123"]);
  });

  it("ignores a client purpose label and keeps only the three checkboxes", () => {
    expect(
      textConfirmationsFromBody({
        callPurpose: "appointment_service",
        permission_confirmed: true,
        salesAttestationConfirmed: true,
      }),
    ).toMatchObject({
      permissionConfirmed: true,
      nonsalesConfirmed: false,
      salesAttestationConfirmed: true,
    });
  });

  it("lets an attested one-off sales text through with no screening provider", async () => {
    const { screenApprovedText } = await loadApprovedText([[attestedRow()], [attestedRow()], []]);
    const result = await screenApprovedText({
      userId: "tenant-1",
      phone: "+13125550100",
      requestedOnThisCall: false,
      content: "Our spring offer is ready.",
      confirmations: { permissionConfirmed: true, salesAttestationConfirmed: true },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sales).toBe(true);
  });

  it("blocks the same sales text until the owner attests", async () => {
    const { screenApprovedText } = await loadApprovedText([[], []]);
    const result = await screenApprovedText({
      userId: "tenant-1",
      phone: "+13125550100",
      requestedOnThisCall: false,
      confirmations: { permissionConfirmed: true, salesAttestationConfirmed: false },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("sales_attestation_required");
      expect(result.error).toBe(SALES_ATTESTATION_REQUIRED_MESSAGE);
      expect(result.sales).toBe(true);
    }
  });

  it("treats a text to the stored caller as a follow-up, not sales", async () => {
    const { screenApprovedText } = await loadApprovedText([]);
    const result = await screenApprovedText({
      userId: "tenant-1",
      phone: "+13125550100",
      requestedOnThisCall: true,
      confirmations: { permissionConfirmed: true, nonsalesConfirmed: true },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sales).toBe(false);
  });

  // A held text pressed Send from Needs You hours after the call is not part
  // of that conversation any more, and calling hours apply to it.
  it("holds a text to the caller to calling hours once the call is over an hour old", async () => {
    const { screenApprovedText } = await loadApprovedText([], { callingHoursAllowed: false });
    const late = await screenApprovedText({
      userId: "tenant-1",
      phone: "+13125550100",
      requestedOnThisCall: true,
      liveSession: false,
      confirmations: { permissionConfirmed: true, nonsalesConfirmed: true },
    });
    expect(late.ok).toBe(false);
    // Still a follow-up to the caller, not sales.
    expect(late.sales).toBe(false);
    const { screenApprovedText: screenDuringCall } = await loadApprovedText([], {
      callingHoursAllowed: false,
    });
    const during = await screenDuringCall({
      userId: "tenant-1",
      phone: "+13125550100",
      requestedOnThisCall: true,
      liveSession: true,
      confirmations: { permissionConfirmed: true, nonsalesConfirmed: true },
    });
    expect(during.ok).toBe(true);
  });

  it("keeps an untagged bulk sales send fail-closed without a provider", async () => {
    const { evaluateOutboundDialGate } = await loadApprovedText([]);
    const result = await evaluateOutboundDialGate({
      userId: "tenant-1",
      phone: "+13125550100",
      isMarketingCall: true,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe("federal_dnc_unconfigured");
  });
});
