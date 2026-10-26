import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REAL_NUMBER = "+14155552671";
const RESERVED_NUMBER = "+12125550100";
const DESTINATION_NUMBER = "+13125550100";

type GuardOutcome =
  | { kind: "allowed" }
  | { kind: "blocked"; status: number; code: string; message: string }
  | { kind: "lookup_failure"; error: Error };

function selectChain(rows: unknown[]) {
  const chain: any = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.limit = vi.fn(async () => rows);
  return chain;
}

async function loadReplyRoute(input: {
  environment: GuardOutcome;
  entity?: GuardOutcome;
  customerNumber?: string;
  threadFound?: boolean;
  idempotencyKey?: string;
  omitIdempotencyKey?: boolean;
  sendFailsBeforeProvider?: boolean;
  refundRepairFailures?: number;
  existingOperation?: {
    id: string;
    requestHash: string;
    status: string;
    providerSid: string | null;
    providerStatus: string | null;
    failureCode: string | null;
  };
}) {
  const { AppError } = await import("../src/lib/api-error");
  let operationState = input.existingOperation ? { ...input.existingOperation } : null;
  let refundRepairAttempt = 0;
  const evaluateSmsThreadReplyGate = vi.fn(async () => ({ allowed: true }));
  const sendTenantMessage = vi.fn(async () => {
    if (input.sendFailsBeforeProvider) throw new Error("provider claim checkpoint unavailable");
    return {
      ok: true,
      configured: true,
      enabled: true,
      status: "queued",
    };
  });
  const refundReservedTenantMessageAttempt = vi.fn(async () => {
    refundRepairAttempt += 1;
    if (refundRepairAttempt <= (input.refundRepairFailures || 0)) {
      throw new Error("refund ledger unavailable");
    }
    return true;
  });
  class SmsProviderAttemptAlreadyClaimedError extends Error {}
  const assertLiveExternalActionAllowed = vi.fn(async () => {
    if (input.environment.kind === "blocked") {
      throw new AppError(
        input.environment.status,
        input.environment.code,
        input.environment.message,
      );
    }
    if (input.environment.kind === "lookup_failure") throw input.environment.error;
  });
  const assertExternalEntityActionAllowed = vi.fn(async () => {
    if (input.entity?.kind === "blocked") {
      throw new AppError(input.entity.status, input.entity.code, input.entity.message);
    }
    if (input.entity?.kind === "lookup_failure") throw input.entity.error;
  });

  const select = vi.fn((projection: Record<string, unknown>) =>
    selectChain(
      "requestHash" in projection
        ? operationState
          ? [operationState]
          : []
        : input.threadFound === false
          ? []
          : [
              {
                id: "thread-1",
                customerNumber: input.customerNumber ?? REAL_NUMBER,
                destinationNumber: DESTINATION_NUMBER,
                status: "open",
                agentId: null,
              },
            ],
    ),
  );
  const update = vi.fn(() => ({
    set: vi.fn((values: Record<string, unknown>) => ({
      where: vi.fn(() => {
        if (operationState) operationState = { ...operationState, ...values };
        return {
          returning: vi.fn(async () => (operationState ? [{ id: operationState.id }] : [])),
        };
      }),
    })),
  }));
  const insert = vi.fn(() => ({
    values: vi.fn((values: { requestHash: string }) => ({
      onConflictDoNothing: vi.fn(() => ({
        returning: vi.fn(async () => {
          operationState = {
            id: "operation-new",
            requestHash: values.requestHash,
            status: "reserved",
            providerSid: null,
            providerStatus: null,
            failureCode: null,
          };
          return [operationState];
        }),
      })),
    })),
  }));

  vi.doMock("../src/lib/server-context", () => ({
    drizzle: { select, update, insert },
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }));
  vi.doMock("../src/middleware/auth", () => ({ authenticateUser: vi.fn() }));
  vi.doMock("../src/middleware/api-rate-limits", () => ({ smsRateLimit: vi.fn() }));
  vi.doMock("../src/middleware/launch-hard-gate", () => ({ enforceLaunchHardGate: vi.fn() }));
  vi.doMock("../src/lib/api-validation", () => ({
    smsReplySchema: {},
    validateBody: vi.fn(() => vi.fn()),
  }));
  vi.doMock("../src/lib/sms-reply-compliance", () => ({ evaluateSmsThreadReplyGate }));
  vi.doMock("../src/lib/twilio-service", () => ({
    refundReservedTenantMessageAttempt,
    sendTenantMessage,
    SmsProviderAttemptAlreadyClaimedError,
  }));
  vi.doMock("../src/lib/account-environment-policy", async (importOriginal) => {
    const original = await importOriginal<typeof import("../src/lib/account-environment-policy")>();
    return {
      ...original,
      assertLiveExternalActionAllowed,
      assertExternalEntityActionAllowed,
    };
  });

  const { default: router } = await import("../src/routes/sms-routes");
  const layer = (router as unknown as { stack: Array<Record<string, any>> }).stack.find(
    (candidate) => candidate.route?.path === "/api/sms/threads/:id/reply",
  );
  const handler = layer?.route?.stack?.at(-1)?.handle as
    ((req: Record<string, any>, res: Record<string, any>) => Promise<unknown>) | undefined;
  if (!handler) throw new Error("SMS reply handler was not registered");

  const response: Record<string, any> = {
    body: undefined,
    statusCode: 200,
    status(statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  const request = {
    params: { id: "thread-1" },
    body: { body: "Hello" },
    user: { id: USER_ID },
    get: vi.fn((name: string) =>
      name.toLowerCase() === "idempotency-key" && !input.omitIdempotencyKey
        ? (input.idempotencyKey ?? "sms-inbox/thread-1/test-request")
        : undefined,
    ),
  };

  return {
    handler,
    request,
    response,
    evaluateSmsThreadReplyGate,
    sendTenantMessage,
    refundReservedTenantMessageAttempt,
    insert,
    assertLiveExternalActionAllowed,
    assertExternalEntityActionAllowed,
    operationState: () => operationState,
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("authenticated SMS reply pre-provider guard", () => {
  it("resolves thread ownership before checking account or target policy", async () => {
    const loaded = await loadReplyRoute({
      environment: { kind: "allowed" },
      entity: { kind: "allowed" },
      threadFound: false,
    });

    await expect(loaded.handler(loaded.request, loaded.response)).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
    expect(loaded.assertLiveExternalActionAllowed).not.toHaveBeenCalled();
    expect(loaded.assertExternalEntityActionAllowed).not.toHaveBeenCalled();
    expect(loaded.evaluateSmsThreadReplyGate).not.toHaveBeenCalled();
    expect(loaded.sendTenantMessage).not.toHaveBeenCalled();
  }, 60_000);

  for (const [environment, status, code] of [
    ["demo", 403, "NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED"],
    ["test", 403, "NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED"],
    ["missing", 503, "ACCOUNT_ENVIRONMENT_UNAVAILABLE"],
  ] as const) {
    it(`blocks ${environment} workspaces before DNC or carrier work`, async () => {
      const loaded = await loadReplyRoute({
        environment: {
          kind: "blocked",
          status,
          code,
          message:
            status === 403
              ? "Live external actions are disabled in this demo or test workspace."
              : "Live external actions are unavailable until this workspace is fully configured.",
        },
      });

      await expect(loaded.handler(loaded.request, loaded.response)).rejects.toMatchObject({
        status,
        code,
      });
      expect(loaded.assertExternalEntityActionAllowed).not.toHaveBeenCalled();
      expect(loaded.evaluateSmsThreadReplyGate).not.toHaveBeenCalled();
      expect(loaded.sendTenantMessage).not.toHaveBeenCalled();
    });
  }

  it("maps classification lookup failures to a stable fail-closed response", async () => {
    const loaded = await loadReplyRoute({
      environment: { kind: "lookup_failure", error: new Error("database unavailable") },
    });

    await expect(loaded.handler(loaded.request, loaded.response)).rejects.toMatchObject({
      status: 503,
      code: "ACCOUNT_ENVIRONMENT_UNAVAILABLE",
    });
    expect(loaded.assertExternalEntityActionAllowed).not.toHaveBeenCalled();
    expect(loaded.evaluateSmsThreadReplyGate).not.toHaveBeenCalled();
    expect(loaded.sendTenantMessage).not.toHaveBeenCalled();
  });

  it("maps target-classification lookup failures to the same stable response", async () => {
    const loaded = await loadReplyRoute({
      environment: { kind: "allowed" },
      entity: { kind: "lookup_failure", error: new Error("target lookup unavailable") },
    });

    await expect(loaded.handler(loaded.request, loaded.response)).rejects.toMatchObject({
      status: 503,
      code: "ACCOUNT_ENVIRONMENT_UNAVAILABLE",
    });
    expect(loaded.evaluateSmsThreadReplyGate).not.toHaveBeenCalled();
    expect(loaded.sendTenantMessage).not.toHaveBeenCalled();
  });

  it("blocks reserved fixture targets before DNC or carrier work", async () => {
    const loaded = await loadReplyRoute({
      environment: { kind: "allowed" },
      entity: {
        kind: "blocked",
        status: 403,
        code: "DEMO_ENTITY_EXTERNAL_ACTION_BLOCKED",
        message: "Live outreach to a reserved fictional phone number is disabled.",
      },
      customerNumber: RESERVED_NUMBER,
    });

    await expect(loaded.handler(loaded.request, loaded.response)).rejects.toMatchObject({
      status: 403,
      code: "DEMO_ENTITY_EXTERNAL_ACTION_BLOCKED",
    });
    expect(loaded.assertExternalEntityActionAllowed).toHaveBeenCalledWith(
      USER_ID,
      "sms_thread_reply",
      { phone: RESERVED_NUMBER },
    );
    expect(loaded.evaluateSmsThreadReplyGate).not.toHaveBeenCalled();
    expect(loaded.sendTenantMessage).not.toHaveBeenCalled();
  });

  it("requires a stable operation key before mutable account, DNC, or carrier work", async () => {
    const loaded = await loadReplyRoute({
      environment: {
        kind: "blocked",
        status: 403,
        code: "NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED",
        message: "The operation-key failure must win before this mutable gate.",
      },
      omitIdempotencyKey: true,
    });

    await expect(loaded.handler(loaded.request, loaded.response)).rejects.toMatchObject({
      status: 400,
      code: "IDEMPOTENCY_KEY_REQUIRED",
      message: expect.stringMatching(/retried safely/i),
    });
    expect(loaded.assertLiveExternalActionAllowed).not.toHaveBeenCalled();
    expect(loaded.assertExternalEntityActionAllowed).not.toHaveBeenCalled();
    expect(loaded.evaluateSmsThreadReplyGate).not.toHaveBeenCalled();
    expect(loaded.insert).not.toHaveBeenCalled();
    expect(loaded.sendTenantMessage).not.toHaveBeenCalled();
  });

  it("replays an accepted matching operation before mutable account and DNC gates", async () => {
    const idempotencyKey = "sms-inbox/thread-1/accepted";
    const requestHash = createHash("sha256")
      .update(JSON.stringify(["thread-1", REAL_NUMBER, DESTINATION_NUMBER, "Hello"]))
      .digest("hex");
    const loaded = await loadReplyRoute({
      environment: {
        kind: "blocked",
        status: 403,
        code: "NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED",
        message: "The environment changed after the carrier accepted the message.",
      },
      idempotencyKey,
      existingOperation: {
        id: "operation-accepted",
        requestHash,
        status: "accepted",
        providerSid: "SMaccepted123",
        providerStatus: "queued",
        failureCode: null,
      },
    });

    await expect(loaded.handler(loaded.request, loaded.response)).resolves.toBeUndefined();
    expect(loaded.response.body).toEqual({
      ok: true,
      duplicate: true,
      sid: "SMaccepted123",
      status: "queued",
      reconciliation_pending: false,
    });
    expect(loaded.assertLiveExternalActionAllowed).not.toHaveBeenCalled();
    expect(loaded.assertExternalEntityActionAllowed).not.toHaveBeenCalled();
    expect(loaded.evaluateSmsThreadReplyGate).not.toHaveBeenCalled();
    expect(loaded.insert).not.toHaveBeenCalled();
    expect(loaded.sendTenantMessage).not.toHaveBeenCalled();
  });

  it("rejects an idempotency-key hash mismatch before mutable account and DNC gates", async () => {
    const loaded = await loadReplyRoute({
      environment: {
        kind: "blocked",
        status: 403,
        code: "NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED",
        message: "This gate must not hide operation-key misuse.",
      },
      idempotencyKey: "sms-inbox/thread-1/reused",
      existingOperation: {
        id: "operation-existing",
        requestHash: "a-different-request-hash",
        status: "accepted",
        providerSid: "SMaccepted123",
        providerStatus: "queued",
        failureCode: null,
      },
    });

    await expect(loaded.handler(loaded.request, loaded.response)).rejects.toMatchObject({
      status: 409,
      code: "IDEMPOTENCY_KEY_REUSED",
    });
    expect(loaded.assertLiveExternalActionAllowed).not.toHaveBeenCalled();
    expect(loaded.assertExternalEntityActionAllowed).not.toHaveBeenCalled();
    expect(loaded.evaluateSmsThreadReplyGate).not.toHaveBeenCalled();
    expect(loaded.insert).not.toHaveBeenCalled();
    expect(loaded.sendTenantMessage).not.toHaveBeenCalled();
  });

  it("preserves production reply behavior after both pre-provider checks", async () => {
    const loaded = await loadReplyRoute({
      environment: { kind: "allowed" },
      entity: { kind: "allowed" },
    });

    await expect(loaded.handler(loaded.request, loaded.response)).resolves.toBeUndefined();
    expect(loaded.assertLiveExternalActionAllowed).toHaveBeenCalledWith(
      USER_ID,
      "sms_thread_reply",
    );
    expect(loaded.assertExternalEntityActionAllowed).toHaveBeenCalledWith(
      USER_ID,
      "sms_thread_reply",
      { phone: REAL_NUMBER },
    );
    expect(loaded.evaluateSmsThreadReplyGate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        threadId: "thread-1",
        phone: REAL_NUMBER,
      }),
    );
    expect(loaded.insert).toHaveBeenCalledTimes(1);
    expect(loaded.sendTenantMessage).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({
        to: REAL_NUMBER,
        body: "Hello",
        channel: "sms",
        fromNumber: DESTINATION_NUMBER,
        idempotencyKey: "sms-inbox/thread-1/test-request",
        reservationAttempt: 1,
        beforeProviderAttempt: expect.any(Function),
      }),
    );
    expect(loaded.response.body).toMatchObject({ ok: true, status: "queued" });
  });

  it("holds the same operation key when a pre-provider refund cannot be confirmed", async () => {
    const loaded = await loadReplyRoute({
      environment: { kind: "allowed" },
      entity: { kind: "allowed" },
      sendFailsBeforeProvider: true,
      refundRepairFailures: 2,
    });

    await expect(loaded.handler(loaded.request, loaded.response)).resolves.toBeUndefined();
    expect(loaded.response.statusCode).toBe(503);
    expect(loaded.response.body).toMatchObject({
      ok: false,
      code: "SMS_PRE_PROVIDER_REFUND_UNCONFIRMED",
      provider_outcome_ambiguous: false,
      do_not_resend: true,
    });
    expect(loaded.operationState()).toMatchObject({
      status: "ambiguous",
      failureCode: "SMS_PRE_PROVIDER_REFUND_UNCONFIRMED",
    });
    expect(loaded.sendTenantMessage).toHaveBeenCalledTimes(1);
    expect(loaded.refundReservedTenantMessageAttempt).toHaveBeenCalledTimes(1);

    loaded.response.statusCode = 200;
    loaded.response.body = undefined;
    await expect(loaded.handler(loaded.request, loaded.response)).resolves.toBeUndefined();

    expect(loaded.response.body).toMatchObject({
      ok: false,
      duplicate: true,
      code: "SMS_PRE_PROVIDER_REFUND_UNCONFIRMED",
      provider_outcome_ambiguous: false,
      do_not_resend: true,
    });
    expect(loaded.sendTenantMessage).toHaveBeenCalledTimes(1);
    expect(loaded.refundReservedTenantMessageAttempt).toHaveBeenCalledTimes(2);
  });

  it("settles a transient pre-provider accounting hold on same-key replay", async () => {
    const loaded = await loadReplyRoute({
      environment: { kind: "allowed" },
      entity: { kind: "allowed" },
      sendFailsBeforeProvider: true,
      refundRepairFailures: 1,
    });

    await expect(loaded.handler(loaded.request, loaded.response)).resolves.toBeUndefined();
    expect(loaded.response.body).toMatchObject({
      code: "SMS_PRE_PROVIDER_REFUND_UNCONFIRMED",
      do_not_resend: true,
    });

    loaded.response.statusCode = 200;
    loaded.response.body = undefined;
    await expect(loaded.handler(loaded.request, loaded.response)).resolves.toBeUndefined();

    expect(loaded.response.body).toMatchObject({
      ok: false,
      duplicate: true,
      code: "SMS_SEND_PRE_PROVIDER_FAILED",
      provider_outcome_ambiguous: false,
      do_not_resend: false,
    });
    expect(loaded.operationState()).toMatchObject({
      status: "rejected",
      failureCode: "SMS_SEND_PRE_PROVIDER_FAILED",
    });
    expect(loaded.sendTenantMessage).toHaveBeenCalledTimes(1);
    expect(loaded.refundReservedTenantMessageAttempt).toHaveBeenCalledTimes(2);
    expect(loaded.assertLiveExternalActionAllowed).toHaveBeenCalledTimes(1);
    expect(loaded.evaluateSmsThreadReplyGate).toHaveBeenCalledTimes(1);
  });
});
