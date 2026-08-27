import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  environmentPolicy: vi.fn(),
  entityPolicy: vi.fn(),
  federalDncLookup: vi.fn(),
  outboundGate: vi.fn(),
  placeOutboundCall: vi.fn(),
  sendTenantMessage: vi.fn(),
  sendEmail: vi.fn(),
  fence: vi.fn(),
  dueCallbacks: [] as Array<Record<string, unknown>>,
  currentMetadata: {} as Record<string, unknown>,
  claimReturning: [{ id: 1n }] as Array<{ id: bigint }>,
  callbackWrites: [] as Array<Record<string, unknown>>,
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("../src/lib/account-environment-policy", () => ({
  liveExternalActionPolicyForUser: mocks.environmentPolicy,
  externalEntityActionPolicyForUser: mocks.entityPolicy,
}));

vi.mock("../src/lib/federal-dnc-service", () => ({
  assertFederalDncForMarketing: mocks.federalDncLookup,
  isFederalDncListed: mocks.federalDncLookup,
}));

vi.mock("../src/lib/outbound-dial-gate", () => ({
  mergeLeadMetadata: (current: Record<string, unknown>, patch?: Record<string, unknown>) => ({
    ...current,
    ...patch,
  }),
  evaluateOutboundDialGate: mocks.outboundGate,
}));

vi.mock("../src/lib/voice/outbound-call-service", () => ({
  placeOutboundCall: mocks.placeOutboundCall,
}));

vi.mock("../src/lib/twilio-service", () => ({
  sendTenantMessage: mocks.sendTenantMessage,
}));

vi.mock("../src/lib/integrations", () => ({
  IntegrationService: class {
    sendEmail = mocks.sendEmail;
  },
}));

vi.mock("../src/lib/voice-spend-control", () => ({
  assertOutboundVoiceAllowed: vi.fn(async () => undefined),
}));

vi.mock("../src/lib/tenant-provider-deletion-fence", () => ({
  runTenantProviderWorkWithDeletionFence: mocks.fence,
}));

vi.mock("../src/lib/server-context", () => {
  function selectChain(rows: unknown[]) {
    const limit = vi.fn(async () => rows);
    const orderBy = vi.fn(() => ({ limit }));
    const where = vi.fn(() => ({ limit, orderBy }));
    const from = vi.fn(() => ({ where }));
    return { from };
  }

  const tx = {
    execute: vi.fn(async () => undefined),
    select: vi.fn(() => selectChain([{ metadata: mocks.currentMetadata }])),
    update: vi.fn(() => ({
      set: vi.fn((patch: Record<string, unknown>) => {
        mocks.callbackWrites.push(patch);
        return { where: vi.fn(async () => undefined) };
      }),
    })),
  };

  const drizzle = {
    select: vi.fn((projection: Record<string, unknown>) =>
      selectChain("callbackScheduledAt" in projection ? mocks.dueCallbacks : []),
    ),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => mocks.claimReturning),
        })),
      })),
    })),
    insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
    transaction: vi.fn((operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx)),
  };

  return {
    drizzle,
    log: { info: vi.fn(), warn: mocks.warn, error: mocks.error },
  };
});

import { executeStep as executeCadenceStep } from "../src/lib/cadence-engine";
import { tickDueCallbacks } from "../src/lib/callback-engine";

const productionPolicy = { allowed: true as const, environment: "production" as const };
const demoPolicy = {
  allowed: false as const,
  environment: "demo" as const,
  status: 403 as const,
  code: "NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED" as const,
  message: "Live external actions are disabled in this demo or test workspace.",
};
const testPolicy = { ...demoPolicy, environment: "test" as const };
const missingPolicy = {
  allowed: false as const,
  environment: null,
  status: 503 as const,
  code: "ACCOUNT_ENVIRONMENT_UNAVAILABLE" as const,
  message: "Live external actions are unavailable until this workspace is fully configured.",
};
const fixturePolicy = {
  allowed: false as const,
  status: 403 as const,
  code: "DEMO_ENTITY_EXTERNAL_ACTION_BLOCKED" as const,
  message: "Live outreach to showcase data is disabled.",
  reason: "demo_lead" as const,
};

const cadence = {
  id: "cadence-1",
  userId: "tenant-1",
  name: "Follow up",
  agentId: "agent-1",
  steps: [],
};
const cadenceLead = {
  id: 1n,
  customerName: "Showcase Contact",
  customerNumber: "+12025550123",
  email: "contact@example.test",
  agentId: "agent-1",
  lastCalledAt: null,
  metadata: {},
};

function expectNoExternalFanout(): void {
  expect(mocks.federalDncLookup).not.toHaveBeenCalled();
  expect(mocks.outboundGate).not.toHaveBeenCalled();
  expect(mocks.placeOutboundCall).not.toHaveBeenCalled();
  expect(mocks.sendTenantMessage).not.toHaveBeenCalled();
  expect(mocks.sendEmail).not.toHaveBeenCalled();
}

describe("system scheduled fan-out account environment boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dueCallbacks.length = 0;
    mocks.claimReturning = [{ id: 1n }];
    mocks.currentMetadata = {};
    mocks.callbackWrites.length = 0;
    mocks.environmentPolicy.mockResolvedValue(productionPolicy);
    mocks.entityPolicy.mockResolvedValue({ allowed: true });
    mocks.federalDncLookup.mockReturnValue({ allowed: true });
    mocks.outboundGate.mockImplementation(async () => {
      mocks.federalDncLookup();
      return { allowed: true, tcpaDecision: { allowed: true } };
    });
    mocks.placeOutboundCall.mockResolvedValue({ ok: false, error: "provider declined" });
    mocks.sendTenantMessage.mockResolvedValue({ ok: true, sid: "SM1" });
    mocks.sendEmail.mockResolvedValue(true);
    mocks.fence.mockImplementation(async (input: { perform: () => Promise<unknown> }) => ({
      performed: true,
      result: await input.perform(),
    }));
  });

  it.each(["call", "sms", "email"] as const)(
    "pauses a demo cadence %s step before Federal DNC or provider work",
    async (type) => {
      mocks.environmentPolicy.mockResolvedValue(demoPolicy);

      await expect(
        executeCadenceStep({ type, delayHours: 0 }, cadence, cadenceLead),
      ).resolves.toMatchObject({
        ok: false,
        failRun: true,
        result: expect.stringContaining("paused"),
      });

      expect(mocks.entityPolicy).not.toHaveBeenCalled();
      expectNoExternalFanout();
    },
  );

  it.each([testPolicy, missingPolicy])(
    "pauses a $environment cadence without consuming the scheduled step",
    async (policy) => {
      mocks.environmentPolicy.mockResolvedValue(policy);

      const result = await executeCadenceStep(
        { type: "call", delayHours: 0 },
        cadence,
        cadenceLead,
      );

      expect(result).toMatchObject({
        ok: false,
        failRun: true,
        result: expect.stringContaining("paused"),
      });
      expect(result).not.toHaveProperty("retryable");
      expectNoExternalFanout();
    },
  );

  it.each(["call", "sms", "email"] as const)(
    "terminally blocks a showcase cadence %s target without a retry-spend loop",
    async (type) => {
      mocks.entityPolicy.mockResolvedValue(fixturePolicy);

      const result = await executeCadenceStep({ type, delayHours: 0 }, cadence, cadenceLead);
      expect(result).toMatchObject({
        ok: false,
        failRun: true,
        result: expect.stringContaining("blocked"),
      });
      expect(result).not.toHaveProperty("retryable");

      expectNoExternalFanout();
    },
  );

  it("fails a cadence policy lookup closed without entering compliance or provider code", async () => {
    mocks.environmentPolicy.mockRejectedValue(new Error("settings lookup unavailable"));

    await expect(
      executeCadenceStep({ type: "call", delayHours: 0 }, cadence, cadenceLead),
    ).resolves.toMatchObject({
      ok: false,
      failRun: true,
      result: expect.stringContaining("paused"),
    });

    expectNoExternalFanout();
  });

  it("preserves the production cadence order: environment, entity, Federal DNC, provider", async () => {
    const events: string[] = [];
    mocks.environmentPolicy.mockImplementation(async () => {
      events.push("environment");
      return productionPolicy;
    });
    mocks.entityPolicy.mockImplementation(async () => {
      events.push("entity");
      return { allowed: true };
    });
    mocks.outboundGate.mockImplementation(async () => {
      events.push("federal-dnc");
      mocks.federalDncLookup();
      return { allowed: true, tcpaDecision: { allowed: true } };
    });
    mocks.placeOutboundCall.mockImplementation(async () => {
      events.push("provider");
      return { ok: false, error: "provider declined" };
    });

    await executeCadenceStep({ type: "call", delayHours: 0 }, cadence, cadenceLead);

    expect(events).toEqual(["environment", "entity", "federal-dnc", "provider"]);
    expect(mocks.federalDncLookup).toHaveBeenCalledOnce();
  });

  it("restores a demo callback's exact schedule without Federal DNC or provider work", async () => {
    const scheduledAt = new Date("2026-08-27T12:00:00.000Z");
    mocks.dueCallbacks.push({
      id: 1n,
      userId: "tenant-1",
      agentId: "agent-1",
      customerName: "Demo Contact",
      customerNumber: "+12025550123",
      lastCalledAt: null,
      callbackScheduledAt: scheduledAt,
      metadata: { callback_requested_via: "phone_call" },
    });
    mocks.currentMetadata = { callback_requested_via: "phone_call" };
    mocks.environmentPolicy.mockResolvedValue(demoPolicy);

    await expect(tickDueCallbacks()).resolves.toEqual({
      processed: 1,
      placed: 0,
      deferred: 0,
      skipped: 1,
    });

    expect(mocks.callbackWrites).toContainEqual(
      expect.objectContaining({
        callbackScheduledAt: scheduledAt,
        lastContactSummary: expect.stringContaining("Callback paused"),
      }),
    );
    expect(mocks.entityPolicy).not.toHaveBeenCalled();
    expectNoExternalFanout();
  });

  it("terminally blocks a showcase callback and consumes its one-shot marker", async () => {
    mocks.dueCallbacks.push({
      id: 1n,
      userId: "tenant-1",
      agentId: "agent-1",
      customerName: "Fixture Contact",
      customerNumber: "+12025550123",
      lastCalledAt: null,
      callbackScheduledAt: new Date("2026-08-27T12:00:00.000Z"),
      metadata: { callback_requested_via: "phone_call", note: "return my call" },
    });
    mocks.currentMetadata = { callback_requested_via: "phone_call", note: "return my call" };
    mocks.entityPolicy.mockResolvedValue(fixturePolicy);

    await expect(tickDueCallbacks()).resolves.toMatchObject({ skipped: 1, placed: 0, deferred: 0 });

    expect(mocks.callbackWrites).toContainEqual(
      expect.objectContaining({
        callbackScheduledAt: null,
        lastContactSummary: expect.stringContaining("Callback blocked"),
        metadata: { note: "return my call", callback_deferrals: 0 },
      }),
    );
    expectNoExternalFanout();
  });

  it("restores a callback after an environment lookup failure without provider work", async () => {
    const scheduledAt = new Date("2026-08-27T12:00:00.000Z");
    mocks.dueCallbacks.push({
      id: 1n,
      userId: "tenant-1",
      agentId: "agent-1",
      customerName: "Pending Contact",
      customerNumber: "+14155550123",
      lastCalledAt: null,
      callbackScheduledAt: scheduledAt,
      metadata: {},
    });
    mocks.environmentPolicy.mockRejectedValue(new Error("settings lookup unavailable"));

    await expect(tickDueCallbacks()).resolves.toMatchObject({ skipped: 1, placed: 0, deferred: 0 });

    expect(mocks.callbackWrites).toContainEqual(
      expect.objectContaining({
        callbackScheduledAt: scheduledAt,
        lastContactSummary: expect.stringContaining("Callback paused"),
      }),
    );
    expectNoExternalFanout();
  });

  it("preserves the production callback order: environment, entity, Federal DNC, provider", async () => {
    const events: string[] = [];
    mocks.dueCallbacks.push({
      id: 1n,
      userId: "tenant-1",
      agentId: "agent-1",
      customerName: "Live Contact",
      customerNumber: "+14155550123",
      lastCalledAt: null,
      callbackScheduledAt: new Date("2026-08-27T12:00:00.000Z"),
      metadata: { callback_requested_via: "phone_call" },
    });
    mocks.environmentPolicy.mockImplementation(async () => {
      events.push("environment");
      return productionPolicy;
    });
    mocks.entityPolicy.mockImplementation(async () => {
      events.push("entity");
      return { allowed: true };
    });
    mocks.outboundGate.mockImplementation(async () => {
      events.push("federal-dnc");
      mocks.federalDncLookup();
      return { allowed: true, tcpaDecision: { allowed: true } };
    });
    mocks.placeOutboundCall.mockImplementation(async () => {
      events.push("provider");
      return { ok: false, error: "provider declined" };
    });

    await tickDueCallbacks();

    expect(events).toEqual(["environment", "entity", "federal-dnc", "provider"]);
    expect(mocks.federalDncLookup).toHaveBeenCalledOnce();
  });
});
