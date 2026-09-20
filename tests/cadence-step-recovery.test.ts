import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  run: {} as Record<string, unknown>,
  writes: [] as Record<string, unknown>[],
  failWritesAfterSend: 0,
  cadenceActive: true,
  send: vi.fn(),
  gate: vi.fn(),
  fence: vi.fn(),
}));

vi.mock("../src/lib/account-environment-policy", () => ({
  liveExternalActionPolicyForUser: async () => ({ allowed: true }),
  externalEntityActionPolicyForUser: async () => ({ allowed: true }),
}));
vi.mock("../src/lib/outbound-dial-gate", () => ({
  evaluateOutboundDialGate: h.gate,
  mergeLeadMetadata: () => ({}),
}));
vi.mock("../src/lib/twilio-service", () => ({ sendTenantMessage: h.send }));
vi.mock("../src/lib/integrations", () => ({
  IntegrationService: class {
    sendEmail = h.send;
  },
}));
vi.mock("../src/lib/voice/outbound-call-service", () => ({ placeOutboundCall: h.send }));
vi.mock("../src/lib/voice-spend-control", () => ({ assertOutboundVoiceAllowed: async () => {} }));
vi.mock("../src/lib/tenant-provider-deletion-fence", () => ({
  runTenantProviderWorkWithDeletionFence: h.fence,
}));
vi.mock("../src/lib/server-context", async () => {
  const schema = await import("../src/db/schema");
  const cadence = {
    id: "cadence",
    userId: "tenant",
    active: true,
    name: "Follow Up",
    agentId: "default-bot",
    steps: [{ type: "sms", delayHours: 0, agentId: "step-bot" }],
  };
  const lead = { id: 1n, userId: "tenant", customerNumber: "+12025550123", metadata: {} };
  return {
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    jsonSafeId: String,
    drizzle: {
      select: () => {
        let table: unknown;
        const rows = () =>
          table === schema.cadences
            ? [cadence]
            : table === schema.outboundLeads
              ? [lead]
              : h.run.status === "active" &&
                  h.run.nextDueAt instanceof Date &&
                  h.run.nextDueAt <= new Date()
                ? [{ ...h.run }]
                : [];
        const query = {
          from: (value: unknown) => {
            table = value;
            cadence.active = h.cadenceActive;
            return query;
          },
          where: () => query,
          orderBy: () => query,
          limit: async () => rows(),
          then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows()).then(resolve),
        };
        return query;
      },
      update: () => ({
        set: (patch: Record<string, unknown>) => ({
          where: () => {
            const apply = () => {
              h.writes.push(patch);
              if (h.send.mock.calls.length && h.failWritesAfterSend > 0) {
                h.failWritesAfterSend--;
                throw new Error("database temporarily unavailable");
              }
              Object.assign(h.run, patch);
              return [{ id: "run" }];
            };
            return {
              returning: async () => apply(),
              then: (resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) =>
                Promise.resolve().then(apply).then(resolve, reject),
            };
          },
        }),
      }),
    },
  };
});

import { executeStep, tickDueCadenceRuns } from "../src/lib/cadence-engine";

beforeEach(() => {
  vi.clearAllMocks();
  h.run = {
    id: "run",
    cadenceId: "cadence",
    userId: "tenant",
    leadId: 1n,
    currentStep: 0,
    status: "active",
    nextDueAt: new Date(0),
    lastResult: null,
  };
  h.writes = [];
  h.failWritesAfterSend = 0;
  h.cadenceActive = true;
  h.send.mockResolvedValue({ ok: true, sid: "SMaccepted" });
  h.gate.mockResolvedValue({ allowed: true });
  h.fence.mockImplementation(async ({ perform }) => ({ performed: true, result: await perform() }));
});

describe("cadence provider boundary", () => {
  it("uses the step's Bot for SMS, matching call-step routing", async () => {
    await executeStep(
      { type: "sms", delayHours: 0, agentId: "step-bot" },
      { id: "cadence", userId: "tenant", name: "Follow Up", agentId: "default-bot", steps: [] },
      {
        id: 1n,
        customerName: null,
        customerNumber: "+12025550123",
        email: null,
        agentId: "lead-bot",
        lastCalledAt: null,
        metadata: {},
      },
    );
    expect(h.send).toHaveBeenCalledWith("tenant", expect.objectContaining({ agentId: "step-bot" }));
  });

  it("does not resend an accepted message when saving the completed step fails", async () => {
    h.failWritesAfterSend = 1;
    await tickDueCadenceRuns({});
    expect(h.run).toMatchObject({ status: "paused", nextDueAt: null, currentStep: 0 });
    await tickDueCadenceRuns({});
    expect(h.send).toHaveBeenCalledTimes(1);
  });

  it("does not resend after both completion and recovery writes fail", async () => {
    h.failWritesAfterSend = 2;
    await tickDueCadenceRuns({}).catch(() => undefined);
    // The durable claim survives a worker crash or a database outage. Expire
    // its lease to exercise the next worker's recovery decision.
    h.run.nextDueAt = new Date(0);
    await tickDueCadenceRuns({});
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.run).toMatchObject({ status: "paused", nextDueAt: null });
  });

  it("pauses an exception with an unknown provider outcome", async () => {
    h.send.mockRejectedValue(new Error("connection lost after submission"));
    await tickDueCadenceRuns({});
    expect(h.run).toMatchObject({ status: "paused", nextDueAt: null });
    expect(h.run.lastResult).toMatch(/verif/i);
  });

  it("still retries a failure proven to precede provider submission, once", async () => {
    h.gate.mockRejectedValue(new Error("compliance lookup unavailable"));
    await tickDueCadenceRuns({});
    expect(h.run.status).toBe("active");
    expect(h.run.nextDueAt).toBeInstanceOf(Date);
    h.run.nextDueAt = new Date(0);
    await tickDueCadenceRuns({});
    expect(h.run.status).toBe("failed");
    expect(h.send).not.toHaveBeenCalled();
  });

  it("completes a successful step normally", async () => {
    await tickDueCadenceRuns({});
    expect(h.run).toMatchObject({ status: "completed", currentStep: 1, nextDueAt: null });
    expect(h.send).toHaveBeenCalledTimes(1);
  });

  it("preserves a scheduled run across a parent sequence pause and resume", async () => {
    h.cadenceActive = false;
    await tickDueCadenceRuns({});
    expect(h.send).not.toHaveBeenCalled();
    expect(h.run).toMatchObject({ status: "active", currentStep: 0, nextDueAt: new Date(0) });
    h.cadenceActive = true;
    await tickDueCadenceRuns({});
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.run.status).toBe("completed");
  });
});
