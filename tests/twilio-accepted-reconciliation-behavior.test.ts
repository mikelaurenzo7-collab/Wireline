import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

type ProviderOutcome =
  { kind: "accepted"; numSegments?: string } | { kind: "rejected"; status: number };

function installSendMocks(options: {
  provider: ProviderOutcome;
  failAdjustment?: boolean;
  sharedWork?: boolean;
  countryCode?: string;
  failPersistence?: boolean;
  failRefund?: boolean;
  fetchedSegments?: string;
  fetchedStatus?: string;
  fetchError?: boolean;
  fetchedSid?: string;
  accountEnvironment?: "production" | "test" | "demo";
  fenceDenied?: boolean;
  threadStatus?: string;
  smsFromNumber?: string | null;
  lookupEnabled?: boolean;
  newRecipient?: boolean;
  insufficientBalance?: boolean;
  noSender?: boolean;
  channelDenied?: boolean;
  lookupResult?: { ok: boolean; valid?: boolean; lineType?: string; reason?: string };
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
  const fetchMessage = vi.fn(async () => {
    if (options.fetchError) throw new Error("Twilio resource is unavailable");
    return {
      sid: options.fetchedSid ?? "SMaccepted123",
      to: "+14155550123",
      numSegments: options.fetchedSegments ?? "1",
      status: options.fetchedStatus ?? "sent",
    };
  });
  const reserveSmsUsage = vi.fn(async () =>
    options.sharedWork ? { periodKey: "frozen-period" } : null,
  );
  const settleSmsUsage = vi.fn(async () => {
    if (options.failAdjustment && options.sharedWork)
      throw new Error("shared settlement unavailable");
    return Boolean(options.sharedWork);
  });
  const basicLookup = vi.fn(async () => ({
    valid: true,
    countryCode: options.countryCode ?? "US",
  }));
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
    return { reserved: !options.insufficientBalance, alreadyReserved: false, balanceUsd: 10 };
  });
  const lookupTenantPhoneNumber = vi.fn(async () => ({
    configured: true,
    enabled: true,
    ...(options.lookupResult ?? { ok: true, valid: true, lineType: "mobile" }),
  }));

  const select = vi.fn((projection: Record<string, unknown>) => {
    let rows: unknown[];
    if ("enabled" in projection) {
      rows = [
        {
          enabled: true,
          lookupEnabled: options.lookupEnabled ?? false,
          messagingServiceSid: options.noSender ? null : "MGservice",
          smsFromNumber: options.smsFromNumber ?? null,
          whatsappFromNumber: null,
        },
      ];
    } else if ("phone" in projection) {
      rows = [];
    } else {
      rows = options.newRecipient
        ? []
        : [{ id: "thread-1", agentId: null, status: options.threadStatus ?? "open" }];
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
  const updateSet = vi.fn((_patch: Record<string, unknown>) => ({ where: updateWhere }));
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
  vi.doMock("../src/lib/sms-usage-billing", () => ({
    reserveSmsUsage,
    settleSmsUsage,
    hasReleasedSmsUsage: vi.fn(async () => false),
  }));
  vi.doMock("../src/lib/job-queue", () => ({ enqueue }));
  vi.doMock("../src/lib/twilio-service-base", () => ({
    getTwilioClient: () => ({
      messages: Object.assign(() => ({ fetch: fetchMessage }), { create: createMessage }),
      lookups: { v2: { phoneNumbers: () => ({ fetch: basicLookup }) } },
    }),
    isTwilioConfigured: () => true,
    lookupTenantPhoneNumber,
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
  vi.doMock("../src/lib/channel-entitlements", () => ({
    requireTenantChannel: async () => {
      if (options.channelDenied)
        throw Object.assign(new Error("Add SMS"), { code: "CHANNEL_NOT_INCLUDED" });
    },
  }));
  vi.doMock("../src/lib/tenant-provider-deletion-fence", () => ({
    runTenantProviderWorkWithDeletionFence,
  }));

  return {
    createMessage,
    fetchMessage,
    reserveSmsUsage,
    settleSmsUsage,
    basicLookup,
    lookupTenantPhoneNumber,
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
  it("reserves the estimate, then bills confirmed Smart Encoding segments without resending", async () => {
    const mocks = installSendMocks({
      provider: { kind: "accepted", numSegments: "0" },
      sharedWork: true,
      fetchedSegments: "1",
    });
    const { sendTenantMessage } = await import("../src/lib/twilio-service");
    const { handleTwilioMessageReconciliationJob } =
      await import("../src/lib/twilio-message-reconciliation");
    // Unicode smart quote makes the pre-send estimate two segments. Twilio's
    // Smart Encoding can send this as one; the creation response does not know yet.
    const result = await sendTenantMessage("user-1", {
      to: "+14155550123",
      body: `“${"a".repeat(124)}`,
      idempotencyKey: "smart-encoding",
    });
    expect(result).toMatchObject({ ok: true, reconciliationPending: true });
    expect(mocks.reserveSmsUsage).toHaveBeenCalledWith(
      "user-1",
      "twilio_message:sms:smart-encoding",
      2,
    );
    expect(mocks.settleSmsUsage).not.toHaveBeenCalled();
    expect(mocks.fetchMessage).not.toHaveBeenCalled();
    const queued = mocks.enqueue.mock.calls[0]?.[1];
    expect(queued).toMatchObject({
      payload: { actualSegments: 0, segmentCountPending: true, steps: ["billing_adjustment"] },
    });
    const job = { id: "job-reconcile-1", user_id: "user-1", payload: queued.payload };
    await handleTwilioMessageReconciliationJob(job as never);
    await handleTwilioMessageReconciliationJob(job as never);
    expect(mocks.settleSmsUsage.mock.calls).toEqual([
      ["user-1", "twilio_message:sms:smart-encoding", 1],
      ["user-1", "twilio_message:sms:smart-encoding", 1],
    ]);
    expect(mocks.createMessage).toHaveBeenCalledTimes(1);
    expect(mocks.reserveRuntimeUsage).not.toHaveBeenCalled();
  });

  it.each([
    { fetchedSegments: "0", fetchedStatus: "queued" },
    { fetchedSegments: "0", fetchedStatus: "undelivered" },
    { fetchedSegments: "invalid" },
    { fetchedSegments: "1.5" },
    { fetchError: true },
    { fetchedSid: "SMdifferent" },
  ])("keeps unknown segment usage reserved and retryable for %j", async (outcome) => {
    const mocks = installSendMocks({
      provider: { kind: "accepted", numSegments: "0" },
      sharedWork: true,
      ...outcome,
    });
    const { sendTenantMessage } = await import("../src/lib/twilio-service");
    const { handleTwilioMessageReconciliationJob } =
      await import("../src/lib/twilio-message-reconciliation");
    await sendTenantMessage("user-1", { to: "+14155550123", body: "Hello" });
    const job = {
      id: "job-reconcile-1",
      user_id: "user-1",
      payload: mocks.enqueue.mock.calls[0][1].payload,
    };
    await expect(handleTwilioMessageReconciliationJob(job as never)).rejects.toThrow();
    expect(mocks.settleSmsUsage).not.toHaveBeenCalled();
    expect(mocks.refundRuntimeUsage).not.toHaveBeenCalled();
    expect(mocks.createMessage).toHaveBeenCalledTimes(1);
  });

  it.each(["failed", "canceled"])(
    "releases zero segments only after Twilio confirms %s without resending",
    async (fetchedStatus) => {
      const mocks = installSendMocks({
        provider: { kind: "accepted", numSegments: "0" },
        sharedWork: true,
        fetchedSegments: "0",
        fetchedStatus,
      });
      const { sendTenantMessage } = await import("../src/lib/twilio-service");
      const { handleTwilioMessageReconciliationJob } =
        await import("../src/lib/twilio-message-reconciliation");
      await sendTenantMessage("user-1", {
        to: "+14155550123",
        body: "Hello",
        idempotencyKey: "terminal-zero",
      });
      await handleTwilioMessageReconciliationJob({
        id: "job-reconcile-1",
        user_id: "user-1",
        payload: mocks.enqueue.mock.calls[0][1].payload,
      } as never);
      expect(mocks.settleSmsUsage).toHaveBeenCalledWith(
        "user-1",
        "twilio_message:sms:terminal-zero",
        0,
      );
      expect(mocks.createMessage).toHaveBeenCalledTimes(1);
    },
  );

  it("true-ups a legacy wallet only after the authoritative segment count arrives", async () => {
    const mocks = installSendMocks({
      provider: { kind: "accepted", numSegments: "0" },
      fetchedSegments: "1",
    });
    const { sendTenantMessage } = await import("../src/lib/twilio-service");
    const { handleTwilioMessageReconciliationJob } =
      await import("../src/lib/twilio-message-reconciliation");
    await sendTenantMessage("user-1", {
      to: "+14155550123",
      body: `“${"a".repeat(124)}`,
      idempotencyKey: "legacy-encoding",
    });
    expect(mocks.refundRuntimeUsage).not.toHaveBeenCalled();
    await handleTwilioMessageReconciliationJob({
      id: "job-reconcile-1",
      user_id: "user-1",
      payload: mocks.enqueue.mock.calls[0][1].payload,
    } as never);
    expect(mocks.refundRuntimeUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceId: "twilio_message:sms:legacy-encoding:actual",
        amountUsd: 0.02,
      }),
    );
    expect(mocks.settleSmsUsage).not.toHaveBeenCalled();
    expect(mocks.createMessage).toHaveBeenCalledTimes(1);
  });

  it("settles accepted SMS against shared work without a wallet debit", async () => {
    const mocks = installSendMocks({
      provider: { kind: "accepted", numSegments: "2" },
      sharedWork: true,
    });
    const { sendTenantMessage } = await import("../src/lib/twilio-service");
    const result = await sendTenantMessage("user-1", {
      to: "+14155550123",
      body: "Hello",
      idempotencyKey: "shared-success",
    });
    expect(result.ok).toBe(true);
    expect(mocks.reserveRuntimeUsage).not.toHaveBeenCalled();
    expect(mocks.refundRuntimeUsage).not.toHaveBeenCalled();
    expect(mocks.basicLookup).toHaveBeenCalledWith();
    expect(mocks.settleSmsUsage).toHaveBeenCalledWith(
      "user-1",
      "twilio_message:sms:shared-success",
      2,
    );
  });

  it.each([400, 503])(
    "shared SMS preserves carrier outcome semantics for status %s",
    async (status) => {
      const mocks = installSendMocks({ provider: { kind: "rejected", status }, sharedWork: true });
      const { sendTenantMessage } = await import("../src/lib/twilio-service");
      const result = await sendTenantMessage("user-1", {
        to: "+14155550123",
        body: "Hello",
        idempotencyKey: "shared-error",
      });
      expect(result.ok).toBe(false);
      expect(mocks.reserveRuntimeUsage).not.toHaveBeenCalled();
      if (status === 400)
        expect(mocks.settleSmsUsage).toHaveBeenCalledWith(
          "user-1",
          "twilio_message:sms:shared-error",
          0,
        );
      else {
        expect(mocks.settleSmsUsage).not.toHaveBeenCalled();
        expect(result.doNotResend).toBe(true);
      }
    },
  );

  it("queues failed shared settlement without retrying the accepted message", async () => {
    const mocks = installSendMocks({
      provider: { kind: "accepted" },
      sharedWork: true,
      failAdjustment: true,
    });
    const { sendTenantMessage } = await import("../src/lib/twilio-service");
    const result = await sendTenantMessage("user-1", { to: "+14155550123", body: "Hello" });
    expect(result).toMatchObject({ ok: true, reconciliationPending: true });
    expect(mocks.createMessage).toHaveBeenCalledTimes(1);
    expect(mocks.enqueue).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        payload: expect.objectContaining({
          fundingModel: "shared_work",
          steps: ["billing_adjustment"],
        }),
      }),
    );
  });

  it("releases the reserve before rejecting destinations outside the published US SMS rate", async () => {
    const mocks = installSendMocks({
      provider: { kind: "accepted" },
      sharedWork: true,
      countryCode: "CA",
    });
    const { sendTenantMessage } = await import("../src/lib/twilio-service");
    await expect(
      sendTenantMessage("user-1", { to: "+14165550123", body: "Hello", idempotencyKey: "not-us" }),
    ).rejects.toThrow("valid US destination");
    expect(mocks.createMessage).not.toHaveBeenCalled();
    expect(mocks.settleSmsUsage).toHaveBeenCalledWith("user-1", "twilio_message:sms:not-us", 0);
  });

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });
  it("does not reserve Runtime or call Lookup/carrier for an excluded SMS channel", async () => {
    const mocks = installSendMocks({
      provider: { kind: "accepted" },
      channelDenied: true,
      lookupEnabled: true,
      newRecipient: true,
    });
    const { sendTenantMessage } = await import("../src/lib/twilio-service");
    const result = await sendTenantMessage("user-1", { to: "+13125550101", body: "Test" });
    expect(result).toMatchObject({ ok: false, code: "CHANNEL_NOT_INCLUDED" });
    expect(mocks.reserveRuntimeUsage).not.toHaveBeenCalled();
    expect(mocks.lookupTenantPhoneNumber).not.toHaveBeenCalled();
    expect(mocks.createMessage).not.toHaveBeenCalled();
  });

  it.each(["balance", "sender"])("does not pay for Lookup when %s is unavailable", async (gate) => {
    const mocks = installSendMocks({
      provider: { kind: "accepted" },
      lookupEnabled: true,
      newRecipient: true,
      insufficientBalance: gate === "balance",
      noSender: gate === "sender",
    });
    const { sendTenantMessage } = await import("../src/lib/twilio-service");
    const beforeProviderAttempt = vi.fn();
    expect(
      await sendTenantMessage("user-1", {
        to: "+14155550123",
        body: "Hello",
        beforeProviderAttempt,
      }),
    ).toMatchObject({ ok: false });
    expect(mocks.lookupTenantPhoneNumber).not.toHaveBeenCalled();
    expect(mocks.createMessage).not.toHaveBeenCalled();
    expect(beforeProviderAttempt).not.toHaveBeenCalled();
  });

  it.each([
    { ok: true, valid: false },
    { ok: true, valid: true, lineType: "landline" },
    { ok: false, reason: "Lookup allowance exhausted" },
  ])("refunds the unsent SMS after validation refuses %j", async (lookupResult) => {
    const mocks = installSendMocks({
      provider: { kind: "accepted" },
      lookupEnabled: true,
      newRecipient: true,
      lookupResult,
    });
    const { sendTenantMessage } = await import("../src/lib/twilio-service");
    const beforeProviderAttempt = vi.fn(async () => undefined);
    expect(
      await sendTenantMessage("user-1", {
        to: "+14155550123",
        body: "Hello",
        beforeProviderAttempt,
        idempotencyKey: "lookup-refusal",
      }),
    ).toMatchObject({ ok: false });
    expect(mocks.reserveRuntimeUsage.mock.invocationCallOrder[0]).toBeLessThan(
      beforeProviderAttempt.mock.invocationCallOrder[0],
    );
    expect(beforeProviderAttempt.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.lookupTenantPhoneNumber.mock.invocationCallOrder[0],
    );
    expect(mocks.refundRuntimeUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        amountUsd: 0.02,
        referenceId: "twilio_message:sms:lookup-refusal",
        reason: "SMS was not sent after phone validation",
      }),
    );
    expect(mocks.createMessage).not.toHaveBeenCalled();
  });

  it("lets only the durable attempt winner reach paid Lookup during a concurrent replay", async () => {
    const mocks = installSendMocks({
      provider: { kind: "accepted" },
      lookupEnabled: true,
      newRecipient: true,
    });
    const { sendTenantMessage, SmsProviderAttemptAlreadyClaimedError } =
      await import("../src/lib/twilio-service");
    let claimed = false;
    const beforeProviderAttempt = async () => {
      if (claimed) throw new SmsProviderAttemptAlreadyClaimedError();
      claimed = true;
    };
    const input = {
      to: "+14155550123",
      body: "Hello",
      idempotencyKey: "same-operation",
      beforeProviderAttempt,
    };
    const outcomes = await Promise.allSettled([
      sendTenantMessage("user-1", input),
      sendTenantMessage("user-1", input),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    expect(mocks.lookupTenantPhoneNumber).toHaveBeenCalledTimes(1);
    expect(mocks.createMessage).toHaveBeenCalledTimes(1);
    expect(mocks.refundRuntimeUsage).not.toHaveBeenCalled();
  });

  it("keeps a failed validation refund visible and never sends the SMS", async () => {
    const mocks = installSendMocks({
      provider: { kind: "accepted" },
      lookupEnabled: true,
      newRecipient: true,
      lookupResult: { ok: true, valid: false },
      failRefund: true,
    });
    const { sendTenantMessage } = await import("../src/lib/twilio-service");
    await expect(
      sendTenantMessage("user-1", { to: "+14155550123", body: "Hello" }),
    ).rejects.toThrow("refund ledger unavailable");
    expect(mocks.createMessage).not.toHaveBeenCalled();
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

  it.each(["open", "waiting", "escalated", "booked", "resolved", "routing_conflict"])(
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
      const patch = mocks.updateSet.mock.calls[0][0] as unknown as {
        status: Parameters<PgDialect["sqlToQuery"]>[0];
      };
      const query = new PgDialect().sqlToQuery(patch.status);
      // Even if the row changed after the initial read, UPDATE must evaluate
      // the current column. Binding threadStatus here reopens resolved work.
      expect(query.sql).toContain('then "wireline_sms_threads"."status"');
      expect(query.sql).toContain("'routing_conflict'");
      expect(query.sql).toContain("else 'open' end");
      expect(query.params).toEqual([]);
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
    ).rejects.toThrow(/billing reservation could not be released/i);

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
