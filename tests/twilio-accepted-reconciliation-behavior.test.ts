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
  const insert = vi.fn(() => ({
    values: vi.fn(() => ({
      onConflictDoNothing: vi.fn(async () => undefined),
    })),
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
});
