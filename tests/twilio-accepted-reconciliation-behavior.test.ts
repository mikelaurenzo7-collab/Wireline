import { beforeEach, describe, expect, it, vi } from "vitest";

type ProviderOutcome =
  { kind: "accepted"; numSegments?: string } | { kind: "rejected"; status: number };

function installSendMocks(options: {
  provider: ProviderOutcome;
  failAdjustment?: boolean;
  failPersistence?: boolean;
  failRefund?: boolean;
}) {
  const createMessage = vi.fn(async () => {
    if (options.provider.kind === "rejected") {
      throw Object.assign(new Error("provider rejected"), { status: options.provider.status });
    }
    return {
      sid: "SMaccepted123",
      status: "queued",
      to: "+14155550123",
      numSegments: options.provider.numSegments ?? "1",
    };
  });
  const enqueue = vi.fn(async () => ({ ok: true, jobId: "job-reconcile-1" }));
  const refundRuntimeUsage = options.failRefund
    ? vi.fn(async () => {
        throw new Error("refund ledger unavailable");
      })
    : vi.fn(async () => undefined);
  let reservationCall = 0;
  const reserveRuntimeUsage = vi.fn(async () => {
    reservationCall += 1;
    if (options.failAdjustment && reservationCall > 1) {
      throw new Error("segment ledger unavailable");
    }
    return { reserved: true, alreadyReserved: false, balanceUsd: 10 };
  });

  const select = vi.fn((projection: Record<string, unknown>) => {
    let rows: unknown[];
    if ("enabled" in projection) {
      rows = [
        {
          enabled: true,
          lookupEnabled: false,
          messagingServiceSid: "MGservice",
          smsFromNumber: null,
          whatsappFromNumber: null,
        },
      ];
    } else if ("phone" in projection) {
      rows = [];
    } else {
      rows = [{ id: "thread-1", agentId: null }];
    }
    return {
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn(async () => rows) })),
      })),
    };
  });
  const updateWhere = options.failPersistence
    ? vi.fn(async () => {
        throw new Error("message history unavailable");
      })
    : vi.fn(async () => undefined);
  const update = vi.fn(() => ({
    set: vi.fn(() => ({ where: updateWhere })),
  }));
  const insertValues = vi.fn(() => ({
    onConflictDoNothing: vi.fn(async () => undefined),
  }));
  const insert = vi.fn(() => ({
    values: insertValues,
  }));
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const tenantStore = {
    getStore: vi.fn(() => "user-1"),
    exit: vi.fn(<T>(callback: () => T) => callback()),
    run: vi.fn(<T>(_userId: string, callback: () => T) => callback()),
  };

  vi.doMock("../src/lib/server-context", () => ({
    drizzle: { select, update, insert },
    log,
    tenantStore,
  }));
  vi.doMock("../src/lib/runtime-usage-billing", () => ({
    reserveRuntimeUsage,
    refundRuntimeUsage,
  }));
  vi.doMock("../src/lib/job-queue", () => ({ enqueue }));
  vi.doMock("../src/lib/twilio-service-base", () => ({
    getTwilioClient: () => ({ messages: { create: createMessage } }),
    isTwilioConfigured: () => true,
    lookupTenantPhoneNumber: vi.fn(),
    SMS_PROVIDER_OUTCOME_AMBIGUOUS: "SMS_PROVIDER_OUTCOME_AMBIGUOUS",
  }));
  vi.doMock("../src/lib/twilio-message-reliability", () => ({
    withTwilioMessageReliability: <T>(payload: T) => payload,
    createTwilioMessageWithRateLimitRetry: <T>(operation: () => Promise<T>) => operation(),
  }));
  vi.doMock("../src/lib/agent-phone-lines", () => ({
    resolveAgentSmsFromNumber: vi.fn(async () => null),
  }));
  vi.doMock("../src/lib/compliance", () => ({
    dncPhoneCandidates: () => ["14155550123"],
  }));
  vi.doMock("../src/lib/launch-readiness", () => ({ isLaunchHardBlocked: () => false }));
  vi.doMock("../src/lib/trial-gate", () => ({
    assertLiveWorkEntitlementForUser: vi.fn(async () => ({ ok: true })),
  }));

  return {
    createMessage,
    enqueue,
    refundRuntimeUsage,
    reserveRuntimeUsage,
    updateWhere,
    insertValues,
    log,
  };
}

describe("Twilio accepted-message reliability", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns carrier acceptance and queues failed local bookkeeping without a second send", async () => {
    const mocks = installSendMocks({
      provider: { kind: "accepted", numSegments: "2" },
      failAdjustment: true,
      failPersistence: true,
    });
    const { sendTenantMessage } = await import("../src/lib/twilio-service");

    const result = await sendTenantMessage("user-1", {
      to: "+14155550123",
      body: "Provider accepted this once",
      channel: "sms",
    });

    expect(result).toMatchObject({
      ok: true,
      sid: "SMaccepted123",
      status: "queued",
      reconciliationPending: true,
    });
    expect(mocks.createMessage).toHaveBeenCalledTimes(1);
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
    expect(mocks.enqueue.mock.calls[0]?.[1]).toMatchObject({
      type: "twilio_message_reconciliation",
      userId: "user-1",
      payload: {
        sid: "SMaccepted123",
        steps: ["billing_adjustment", "outbound_persistence"],
      },
    });
    expect(mocks.log.error).toHaveBeenCalledWith(
      "Twilio provider accepted message with local reconciliation pending",
      expect.objectContaining({
        providerAccepted: true,
        doNotRetryProviderSend: true,
        jobId: "job-reconcile-1",
      }),
    );
  });

  it("raises when a definitive 4xx rejection cannot be refunded", async () => {
    const mocks = installSendMocks({
      provider: { kind: "rejected", status: 400 },
      failRefund: true,
    });
    const { sendTenantMessage } = await import("../src/lib/twilio-service");

    await expect(
      sendTenantMessage("user-1", {
        to: "+14155550123",
        body: "Rejected before acceptance",
        channel: "sms",
      }),
    ).rejects.toThrow(/refund could not be recorded/i);

    expect(mocks.createMessage).toHaveBeenCalledTimes(1);
    expect(mocks.refundRuntimeUsage).toHaveBeenCalledTimes(1);
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.log.error).toHaveBeenCalledWith(
      "Twilio rejection refund failed",
      expect.objectContaining({ status: 400, refundError: "refund ledger unavailable" }),
    );
  });

  it("keeps an exhausted 429 definitive and refundable so a durable caller may retry", async () => {
    const mocks = installSendMocks({
      provider: { kind: "rejected", status: 429 },
    });
    const { sendTenantMessage } = await import("../src/lib/twilio-service");

    const result = await sendTenantMessage("user-1", {
      to: "+14155550123",
      body: "Definitively rate limited",
      channel: "sms",
      idempotencyKey: "post-call-csat/job-1",
      reservationAttempt: 1,
    });

    expect(result).toMatchObject({ ok: false });
    expect(result.code).not.toBe("SMS_PROVIDER_OUTCOME_AMBIGUOUS");
    expect(result.providerOutcomeAmbiguous).not.toBe(true);
    expect(mocks.refundRuntimeUsage).toHaveBeenCalledTimes(1);
    expect(
      mocks.insertValues.mock.calls.some(
        ([value]) => value?.action === "twilio.message_provider_outcome_ambiguous",
      ),
    ).toBe(false);
  });

  it.each([0, 503])(
    "marks provider status %s as ambiguous, retains the reserve, and writes a content-free critical incident",
    async (status) => {
      const mocks = installSendMocks({
        provider: { kind: "rejected", status },
      });
      const { sendTenantMessage } = await import("../src/lib/twilio-service");

      const result = await sendTenantMessage("user-1", {
        to: "+14155550123",
        body: "Sensitive customer message that must not reach audit metadata",
        channel: "sms",
        idempotencyKey: "manual-reply/thread-1/request-1",
      });

      expect(result).toMatchObject({
        ok: false,
        code: "SMS_PROVIDER_OUTCOME_AMBIGUOUS",
        providerOutcomeAmbiguous: true,
        doNotResend: true,
      });
      expect(result.reason).toMatch(/may have been accepted/i);
      expect(result.reason).toMatch(/do not resend/i);
      expect(mocks.refundRuntimeUsage).not.toHaveBeenCalled();

      const incident = mocks.insertValues.mock.calls
        .map(([value]) => value)
        .find((value) => value?.action === "twilio.message_provider_outcome_ambiguous");
      expect(incident).toMatchObject({
        eventType: "provider.reconciliation",
        severity: "critical",
        provider: "twilio",
        resourceId: "twilio_message:sms:manual-reply/thread-1/request-1",
        metadata: {
          reservation_reference: "twilio_message:sms:manual-reply/thread-1/request-1",
          destination_suffix: "0123",
          provider_status: status || null,
        },
      });
      expect(JSON.stringify(incident)).not.toContain("Sensitive customer message");
      expect(mocks.log.error).toHaveBeenCalledWith(
        "Twilio message provider outcome is ambiguous",
        expect.objectContaining({
          incidentRecorded: true,
          reservationRetained: true,
          doNotResend: true,
        }),
      );
    },
  );
});
