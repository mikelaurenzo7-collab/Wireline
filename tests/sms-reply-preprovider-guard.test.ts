import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REAL_NUMBER = "+14155552671";
const RESERVED_NUMBER = "+12125550100";

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
}) {
  const { AppError } = await import("../src/lib/api-error");
  const evaluateOutboundDialGate = vi.fn(async () => ({ allowed: true }));
  const sendTenantMessage = vi.fn(async () => ({
    ok: true,
    configured: true,
    enabled: true,
    status: "queued",
  }));
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

  vi.doMock("../src/lib/server-context", () => ({
    drizzle: {
      select: vi.fn(() =>
        selectChain(
          input.threadFound === false
            ? []
            : [
                {
                  id: "thread-1",
                  customerNumber: input.customerNumber ?? REAL_NUMBER,
                },
              ],
        ),
      ),
    },
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }));
  vi.doMock("../src/middleware/auth", () => ({ authenticateUser: vi.fn() }));
  vi.doMock("../src/middleware/api-rate-limits", () => ({ smsRateLimit: vi.fn() }));
  vi.doMock("../src/middleware/launch-hard-gate", () => ({ enforceLaunchHardGate: vi.fn() }));
  vi.doMock("../src/lib/api-validation", () => ({
    smsReplySchema: {},
    validateBody: vi.fn(() => vi.fn()),
  }));
  vi.doMock("../src/lib/outbound-dial-gate", () => ({ evaluateOutboundDialGate }));
  vi.doMock("../src/lib/twilio-service", () => ({ sendTenantMessage }));
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
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  const request = {
    params: { id: "thread-1" },
    body: { body: "Hello" },
    user: { id: USER_ID },
  };

  return {
    handler,
    request,
    response,
    evaluateOutboundDialGate,
    sendTenantMessage,
    assertLiveExternalActionAllowed,
    assertExternalEntityActionAllowed,
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
    expect(loaded.evaluateOutboundDialGate).not.toHaveBeenCalled();
    expect(loaded.sendTenantMessage).not.toHaveBeenCalled();
  }, 20_000);

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
      expect(loaded.evaluateOutboundDialGate).not.toHaveBeenCalled();
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
    expect(loaded.evaluateOutboundDialGate).not.toHaveBeenCalled();
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
    expect(loaded.evaluateOutboundDialGate).not.toHaveBeenCalled();
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
    expect(loaded.evaluateOutboundDialGate).not.toHaveBeenCalled();
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
    expect(loaded.evaluateOutboundDialGate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, phone: REAL_NUMBER }),
    );
    expect(loaded.sendTenantMessage).toHaveBeenCalledWith(USER_ID, {
      to: REAL_NUMBER,
      body: "Hello",
      channel: "sms",
    });
    expect(loaded.response.body).toMatchObject({ ok: true, status: "queued" });
  });
});
