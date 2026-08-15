import { beforeEach, describe, expect, it, vi } from "vitest";

function installTwilioMocks(
  options: {
    refundFails?: boolean;
    historicalBurnUsd?: string;
    durableRefundEvidence?: boolean;
  } = {},
) {
  const createMessage = vi.fn(async () => ({
    sid: "SM-should-not-be-created",
    status: "queued",
    to: "+13125550123",
    numSegments: "1",
  }));
  const reserveRuntimeUsage = vi.fn(async () => ({
    reserved: true,
    alreadyReserved: false,
    balanceUsd: 10,
  }));
  const refundRuntimeUsage = options.refundFails
    ? vi.fn(async () => {
        throw new Error("refund unavailable");
      })
    : vi.fn(async () => undefined);
  const select = vi.fn((projection: Record<string, unknown>) => {
    const rows =
      "enabled" in projection
        ? [
            {
              enabled: true,
              lookupEnabled: false,
              messagingServiceSid: "MG-test",
              smsFromNumber: null,
              whatsappFromNumber: null,
            },
          ]
        : "deltaUsd" in projection
          ? options.historicalBurnUsd
            ? [{ id: "burn-1", deltaUsd: options.historicalBurnUsd }]
            : []
          : "entryKind" in projection
            ? options.durableRefundEvidence
              ? [{ id: "refund-1", entryKind: "refund" }]
              : []
            : "phone" in projection
              ? []
              : [{ id: "thread-1", agentId: null }];
    return {
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn(async () => rows) })),
      })),
    };
  });
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

  vi.doMock("../src/lib/server-context", () => ({
    drizzle: { select },
    log,
    tenantStore: { getStore: vi.fn(() => null), exit: vi.fn(), run: vi.fn() },
  }));
  vi.doMock("../src/lib/runtime-usage-billing", () => ({
    reserveRuntimeUsage,
    refundRuntimeUsage,
  }));
  vi.doMock("../src/lib/twilio-service-base", () => ({
    getTwilioClient: () => ({ messages: { create: createMessage } }),
    isTwilioConfigured: () => true,
    lookupTenantPhoneNumber: vi.fn(),
  }));
  vi.doMock("../src/lib/twilio-message-reliability", () => ({
    withTwilioMessageReliability: <T>(payload: T) => payload,
    createTwilioMessageWithRateLimitRetry: <T>(operation: () => Promise<T>) => operation(),
  }));
  vi.doMock("../src/lib/twilio-message-reconciliation", () => ({
    finalizeAcceptedTwilioMessage: vi.fn(),
  }));
  vi.doMock("../src/lib/agent-phone-lines", () => ({
    resolveAgentSmsFromNumber: vi.fn(async () => null),
  }));
  vi.doMock("../src/lib/compliance", () => ({
    dncPhoneCandidates: () => ["+13125550123"],
  }));
  vi.doMock("../src/lib/launch-readiness", () => ({ isLaunchHardBlocked: () => false }));
  vi.doMock("../src/lib/trial-gate", () => ({
    assertLiveWorkEntitlementForUser: vi.fn(async () => ({ ok: true, status: "active" })),
  }));

  return { createMessage, reserveRuntimeUsage, refundRuntimeUsage, log };
}

describe("post-call CSAT pre-provider refund", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("refunds and rethrows when the durable claim fails before Twilio is called", async () => {
    const mocks = installTwilioMocks();
    const { sendTenantMessage } = await import("../src/lib/twilio-service");

    await expect(
      sendTenantMessage("user-1", {
        to: "+13125550123",
        body: "How was your call? Reply 1-5.",
        idempotencyKey: "post-call-csat/job-1",
        reservationAttempt: 2,
        beforeProviderAttempt: async () => {
          throw new Error("checkpoint unavailable");
        },
      }),
    ).rejects.toThrow("checkpoint unavailable");

    expect(mocks.reserveRuntimeUsage).toHaveBeenCalledTimes(1);
    expect(mocks.refundRuntimeUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceId: "twilio_message:sms:post-call-csat/job-1:attempt:2",
        reason: "Twilio provider attempt did not start",
      }),
    );
    expect(mocks.createMessage).not.toHaveBeenCalled();
  });

  it("fails closed when the no-provider reservation refund cannot be persisted", async () => {
    const mocks = installTwilioMocks({ refundFails: true });
    const { sendTenantMessage } = await import("../src/lib/twilio-service");

    await expect(
      sendTenantMessage("user-1", {
        to: "+13125550123",
        body: "How was your call? Reply 1-5.",
        idempotencyKey: "post-call-csat/job-1",
        reservationAttempt: 1,
        beforeProviderAttempt: async () => {
          throw new Error("checkpoint unavailable");
        },
      }),
    ).rejects.toThrow(/refund could not be recorded/i);

    expect(mocks.createMessage).not.toHaveBeenCalled();
    expect(mocks.log.error).toHaveBeenCalledWith(
      "Twilio pre-provider reservation refund failed",
      expect.objectContaining({
        preProviderError: "checkpoint unavailable",
        refundError: "refund unavailable",
      }),
    );
  });

  it("refunds the persisted debit exactly even when current provider pricing is unavailable", async () => {
    const priorBeta = process.env.WIRELINE_WHATSAPP_PRIVATE_BETA;
    process.env.WIRELINE_WHATSAPP_PRIVATE_BETA = "false";
    const mocks = installTwilioMocks({ historicalBurnUsd: "-0.37" });
    const { refundReservedTenantMessageAttempt } = await import("../src/lib/twilio-service");

    await expect(
      refundReservedTenantMessageAttempt({
        userId: "user-1",
        idempotencyKey: "post-call-csat/job-1",
        reservationAttempt: 1,
        channel: "whatsapp",
      }),
    ).resolves.toBe(true);

    expect(mocks.refundRuntimeUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        amountUsd: 0.37,
        referenceId: "twilio_message:whatsapp:post-call-csat/job-1:attempt:1",
      }),
    );

    if (priorBeta === undefined) delete process.env.WIRELINE_WHATSAPP_PRIVATE_BETA;
    else process.env.WIRELINE_WHATSAPP_PRIVATE_BETA = priorBeta;
  });

  it("recognizes only the exact attempt-scoped durable refund as safe replay evidence", async () => {
    installTwilioMocks({ durableRefundEvidence: true });
    const { hasDurableTenantMessageAttemptRefund } = await import("../src/lib/twilio-service");

    await expect(
      hasDurableTenantMessageAttemptRefund({
        userId: "user-1",
        idempotencyKey: "post-call-csat/job-1",
        reservationAttempt: 2,
        channel: "sms",
      }),
    ).resolves.toBe(true);
  });
});
