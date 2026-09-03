import { beforeEach, describe, expect, it, vi } from "vitest";

type ProviderOutcome =
  { kind: "accepted"; numSegments?: string } | { kind: "rejected"; status: number };

function installSendMocks(options: {
  provider: ProviderOutcome;
  failAdjustment?: boolean;
  failPersistence?: boolean;
  failRefund?: boolean;
  accountEnvironment?: "production" | "test" | "demo";
  fenceDenied?: boolean;
  threadStatus?: string;
  smsFromNumber?: string | null;
}) {
  const createMessage = vi.fn(async (_payload?: Record<string, unknown>) => {
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
          smsFromNumber: options.smsFromNumber ?? null,
          whatsappFromNumber: null,
        },
      ];
    } else if ("phone" in projection) {
      rows = [];
    } else {
      rows = [{ id: "thread-1", agentId: null, status: options.threadStatus ?? "open" }];
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
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));
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
  let fenceRetained = false;
  const runTenantProviderWorkWithDeletionFence = vi.fn(
    async (input: {
      perform: () => Promise<any>;
      retainOnSuccess?: boolean | ((result: any) => boolean);
    }) => {
      if (options.fenceDenied) {
        return {
          performed: false as const,
          reason: "account_erased_or_terminal_deletion" as const,
        };
      }
      const result = await input.perform();
      fenceRetained =
        typeof input.retainOnSuccess === "function"
          ? input.retainOnSuccess(result)
          : Boolean(input.retainOnSuccess);
      return { performed: true as const, result };
    },
  );

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
    isDncBlocked: () => false,
  }));
  vi.doMock("../src/lib/launch-readiness", () => ({ isLaunchHardBlocked: () => false }));
  vi.doMock("../src/lib/account-environment-policy", () => ({
    liveExternalActionPolicyForUser: vi.fn(async () =>
      options.accountEnvironment && options.accountEnvironment !== "production"
        ? {
            allowed: false,
            environment: options.accountEnvironment,
            status: 403,
            code: "NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED",
            message: "Live external actions are disabled in this demo or test workspace.",
          }
        : { allowed: true, environment: "production" },
    ),
    externalEntityActionPolicyForUser: vi.fn(async () => ({ allowed: true })),
  }));
  vi.doMock("../src/lib/trial-gate", () => ({
    assertLiveWorkEntitlementForUser: vi.fn(async () => ({ ok: true })),
  }));
  vi.doMock("../src/lib/tenant-provider-deletion-fence", () => ({
    runTenantProviderWorkWithDeletionFence,
  }));

  return {
    createMessage,
    enqueue,
    refundRuntimeUsage,
    reserveRuntimeUsage,
    updateSet,
    updateWhere,
    insertValues,
    log,
    runTenantProviderWorkWithDeletionFence,
    fenceRetained: () => fenceRetained,
  };
}

describe("Twilio accepted-message reliability", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("refuses demo-account SMS before reserving balance or calling Twilio", async () => {
    const mocks = installSendMocks({
      provider: { kind: "accepted" },
      accountEnvironment: "demo",
    });
    const { sendTenantMessage } = await import("../src/lib/twilio-service");

    const result = await sendTenantMessage("user-1", {
      to: "+12025550100",
      body: "This must remain inside visual QA.",
      channel: "sms",
    });

    expect(result).toMatchObject({
      ok: false,
      enabled: false,
      code: "NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED",
    });
    expect(mocks.reserveRuntimeUsage).not.toHaveBeenCalled();
    expect(mocks.createMessage).not.toHaveBeenCalled();
    expect(mocks.runTenantProviderWorkWithDeletionFence).not.toHaveBeenCalled();
  });

  it("does not reserve balance or reach Twilio when terminal deletion wins lease admission", async () => {
    const mocks = installSendMocks({
      provider: { kind: "accepted" },
      fenceDenied: true,
    });
    const { sendTenantMessage } = await import("../src/lib/twilio-service");

    const result = await sendTenantMessage("user-1", {
      to: "+14155550123",
      body: "Must not cross the deletion fence",
      channel: "sms",
    });

    expect(result).toMatchObject({
      ok: false,
      enabled: false,
      code: "ACCOUNT_DELETION_IN_PROGRESS",
    });
    expect(mocks.runTenantProviderWorkWithDeletionFence).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", operation: "twilio_message_send" }),
    );
    expect(mocks.reserveRuntimeUsage).not.toHaveBeenCalled();
    expect(mocks.createMessage).not.toHaveBeenCalled();
  });

  it("retains the shared reserve when another request already claimed the provider attempt", async () => {
    const mocks = installSendMocks({ provider: { kind: "accepted" } });
    const { sendTenantMessage, SmsProviderAttemptAlreadyClaimedError } =
      await import("../src/lib/twilio-service");
    const beforeProviderAttempt = vi.fn(async () => {
      throw new SmsProviderAttemptAlreadyClaimedError();
    });

    await expect(
      sendTenantMessage("user-1", {
        to: "+14155550123",
        body: "Only the winning request may cross the carrier boundary.",
        channel: "sms",
        idempotencyKey: "manual-reply/thread-1/concurrent",
        beforeProviderAttempt,
      }),
    ).rejects.toBeInstanceOf(SmsProviderAttemptAlreadyClaimedError);

    expect(beforeProviderAttempt).toHaveBeenCalledTimes(1);
    expect(mocks.reserveRuntimeUsage).toHaveBeenCalledTimes(1);
    expect(mocks.createMessage).not.toHaveBeenCalled();
    expect(mocks.refundRuntimeUsage).not.toHaveBeenCalled();
    expect(mocks.log.warn).toHaveBeenCalledWith(
      "Twilio provider attempt already claimed; retaining shared reservation",
      expect.objectContaining({ reservationRetained: true }),
    );
  });

  it("refunds exactly once when a generic pre-provider callback failure prevents the send", async () => {
    const mocks = installSendMocks({ provider: { kind: "accepted" } });
    const { sendTenantMessage } = await import("../src/lib/twilio-service");
    const beforeProviderAttempt = vi.fn(async () => {
      throw new Error("claim store unavailable");
    });

    await expect(
      sendTenantMessage("user-1", {
        to: "+14155550123",
        body: "The carrier must not be called without a durable claim.",
        channel: "sms",
        idempotencyKey: "manual-reply/thread-1/pre-provider-failure",
        beforeProviderAttempt,
      }),
    ).rejects.toThrow("claim store unavailable");

    expect(beforeProviderAttempt).toHaveBeenCalledTimes(1);
    expect(mocks.reserveRuntimeUsage).toHaveBeenCalledTimes(1);
    expect(mocks.createMessage).not.toHaveBeenCalled();
    expect(mocks.refundRuntimeUsage).toHaveBeenCalledTimes(1);
    expect(mocks.refundRuntimeUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "Twilio provider attempt did not start",
        metadata: expect.objectContaining({ pre_provider_failure: true }),
      }),
    );
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
    expect(mocks.fenceRetained()).toBe(true);
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

  it.each(["waiting", "escalated", "booked", "resolved"])(
    "preserves the operator-owned %s outcome after carrier acceptance",
    async (threadStatus) => {
      const mocks = installSendMocks({
        provider: { kind: "accepted" },
        threadStatus,
      });
      const { sendTenantMessage } = await import("../src/lib/twilio-service");

      const result = await sendTenantMessage("user-1", {
        to: "+14155550123",
        body: "Carrier acceptance must not change who owns this conversation.",
        channel: "sms",
      });

      expect(result).toMatchObject({ ok: true, sid: "SMaccepted123" });
      expect(mocks.updateSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: threadStatus }),
      );
    },
  );

  it("pins the tenant default From while retaining Messaging Service controls", async () => {
    const mocks = installSendMocks({
      provider: { kind: "accepted" },
      smsFromNumber: "+14155550999",
    });
    const { sendTenantMessage } = await import("../src/lib/twilio-service");

    const result = await sendTenantMessage("user-1", {
      to: "+14155550123",
      body: "Keep this reply on the exact business line.",
      channel: "sms",
    });

    expect(result).toMatchObject({ ok: true, sid: "SMaccepted123" });
    expect(mocks.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        messagingServiceSid: "MGservice",
        from: "+14155550999",
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
    expect(mocks.fenceRetained()).toBe(false);
    expect(mocks.refundRuntimeUsage).toHaveBeenCalledTimes(1);
    expect(
      mocks.insertValues.mock.calls.some(
        ([value]) => value?.action === "twilio.message_provider_outcome_ambiguous",
      ),
    ).toBe(false);
  });

  it.each([0, 408, 503])(
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
      expect(mocks.fenceRetained()).toBe(true);
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
