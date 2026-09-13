import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  slots: 1,
  status: "active",
  planId: "starter",
  agents: [{ id: "oldest" }, { id: "newest" }] as Array<{
    id: string;
    businessVariables?: unknown;
  }>,
  lines: [] as Array<{ agentId: string | null }>,
  jobs: [] as Array<{ payload: { agentId: string } }>,
  target: "newest",
  beforePerform: undefined as undefined | (() => void),
  enqueue: vi.fn(),
  provider: vi.fn(),
  phoneProvision: vi.fn(),
  ownedNumbers: vi.fn(),
  fence: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => args,
  eq: (...args: unknown[]) => args,
  asc: (v: unknown) => v,
  inArray: (...args: unknown[]) => args,
}));
vi.mock("../src/db/schema", () => ({
  agents: {
    table: "agents",
    id: "agent.id",
    userId: "agent.user",
    name: "agent.name",
    createdAt: "agent.created",
    businessVariables: "agent.variables",
  },
  subscriptions: {
    table: "subscriptions",
    plan: "sub.plan",
    status: "sub.status",
    userId: "sub.user",
  },
  phoneNumbers: { table: "phones", agentId: "phone.agent", userId: "phone.user" },
  emailAccounts: {
    table: "emails",
    id: "email.id",
    userId: "email.user",
    agentId: "email.agent",
    provider: "email.provider",
    emailAddress: "email.address",
    oauthGrantedScopes: "email.scopes",
    refreshToken: "email.refresh",
  },
  jobs: {
    table: "jobs",
    payload: "job.payload",
    userId: "job.user",
    type: "job.type",
    status: "job.status",
  },
}));
vi.mock("../src/lib/server-context", () => ({
  log: { error: vi.fn(), warn: vi.fn() },
  drizzle: {
    select: (fields: Record<string, unknown>) => {
      let table: string;
      const rows = () =>
        table === "subscriptions"
          ? [{ planId: h.planId, status: h.status }]
          : table === "phones"
            ? h.lines
            : table === "emails"
              ? []
              : table === "jobs"
                ? h.jobs
                : "name" in fields
                  ? [{ id: h.target, name: "Test Bot" }]
                  : h.agents;
      const query = {
        from: (value: { table: string }) => {
          table = value.table;
          return query;
        },
        where: () => query,
        orderBy: () => query,
        limit: () => query,
        then: (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) =>
          Promise.resolve(rows()).then(resolve, reject),
      };
      return query;
    },
  },
}));
vi.mock("../src/lib/plan-catalog", () => ({
  planById: (id: string) =>
    id === "starter"
      ? { price_usd_monthly: 19, included_phone_numbers: 1 }
      : { price_usd_monthly: 0, included_phone_numbers: 0 },
}));
vi.mock("../src/lib/phone-line-entitlements", () => ({
  getIncludedPhoneLineSlots: async () => h.slots,
}));
vi.mock("../src/lib/account-environment-policy", () => ({
  assertLiveExternalActionAllowed: async () => {},
}));
vi.mock("../src/lib/tenant-provider-deletion-fence", () => ({
  runTenantProviderWorkWithDeletionFence: async ({
    perform,
  }: {
    perform: () => Promise<unknown>;
  }) => {
    h.fence();
    h.beforePerform?.();
    return { performed: true, result: await perform() };
  },
}));
vi.mock("../src/lib/job-queue", () => ({ enqueue: (...args: unknown[]) => h.enqueue(...args) }));
vi.mock("../src/lib/twilio-service", () => ({
  getTwilioClient: () => ({ incomingPhoneNumbers: { list: h.ownedNumbers } }),
}));
vi.mock("../src/lib/voice/native-phone-provisioning", () => ({
  provisionNativeTenantNumber: (...args: unknown[]) => h.phoneProvision(...args),
}));
vi.mock("../src/lib/voice/native-phone-release", () => ({
  releaseNativeTenantNumber: (...args: unknown[]) => h.provider(...args),
}));
vi.mock("../src/lib/secret-vault", () => ({
  encryptSecret: h.provider,
  isVaultConfigured: h.provider,
}));
vi.mock("../src/lib/owned-email-account", () => ({
  EMAIL_ACCOUNT_OWNERSHIP_CONFLICT_MESSAGE: "ownership conflict",
  upsertOwnedEmailAccount: h.provider,
}));
vi.mock("../src/lib/agentmail-mail", () => ({
  AGENTMAIL_MANAGED_CREDENTIAL_SENTINEL: "managed",
  AGENTMAIL_MANAGED_SCOPE_MARKER: "managed",
  agentmailGrantedScopes: h.provider,
  createAgentMailInbox: h.provider,
  deleteAgentMailWebhook: h.provider,
  ensureAgentMailWebhook: h.provider,
  hasExactAgentMailManagedScope: h.provider,
  listAgentMailInboxes: h.provider,
  listAgentMailWebhooks: h.provider,
  verifyAgentMailCredentials: h.provider,
}));

import {
  enqueuePaidBotIdentityReconciliation,
  ensurePaidBotIdentity,
} from "../src/lib/paid-bot-identity";

beforeEach(() => {
  vi.clearAllMocks();
  h.slots = 1;
  h.status = "active";
  h.planId = "starter";
  h.target = "newest";
  h.agents = [{ id: "oldest" }, { id: "newest" }];
  h.lines = [];
  h.jobs = [];
  h.beforePerform = undefined;
  h.enqueue.mockResolvedValue({ jobId: "test-job" });
  h.provider.mockImplementation(() => {
    throw new Error("Provider work must not run");
  });
  h.phoneProvision.mockImplementation((...args: unknown[]) => h.provider(...args));
  h.ownedNumbers.mockResolvedValue([{ sid: "PN_test_owned_line" }]);
});

describe("paid identity admission at queue and provider boundaries", () => {
  it("does not enqueue or provision a private connected-client draft on a paid account", async () => {
    h.agents = [
      { id: "newest", businessVariables: { customizationProfile: { source: "chatgpt_mcp" } } },
    ];
    await expect(enqueuePaidBotIdentityReconciliation("tenant")).resolves.toMatchObject({
      agents: 0,
      queued: 0,
    });
    await expect(
      ensurePaidBotIdentity({ userId: "tenant", agentId: "newest" }),
    ).resolves.toMatchObject({ eligible: false });
    expect(h.phoneProvision).not.toHaveBeenCalled();
    expect(h.provider).not.toHaveBeenCalled();
  });
  it("creates no mailbox when a competing phone request wins the final slot", async () => {
    h.target = "oldest";
    h.phoneProvision.mockImplementation(async () => {
      h.lines = [{ agentId: "newest" }];
      return { ok: false, code: "PHONE_CAPACITY_REACHED", error: "Phone capacity was claimed" };
    });
    await expect(ensurePaidBotIdentity({ userId: "tenant", agentId: "oldest" })).rejects.toThrow(
      "Phone capacity was claimed",
    );
    expect(h.phoneProvision).toHaveBeenCalledOnce();
    expect(h.provider).not.toHaveBeenCalled();
    await expect(
      ensurePaidBotIdentity({ userId: "tenant", agentId: "oldest" }),
    ).resolves.toMatchObject({ eligible: false });
    expect(h.phoneProvision).toHaveBeenCalledOnce();
    expect(h.provider).not.toHaveBeenCalled();
  });
  it("retains phone ownership so a failed mailbox can be retried for the same Bot", async () => {
    h.target = "oldest";
    h.phoneProvision.mockImplementation(async () => {
      const reused = h.lines.some((line) => line.agentId === "oldest");
      h.lines = [{ agentId: "oldest" }];
      return { ok: true, phoneNumber: "+12025550123", reused };
    });
    h.provider.mockImplementation(() => {
      expect(h.lines).toEqual([{ agentId: "oldest" }]);
      throw new Error("Mailbox temporarily unavailable");
    });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(ensurePaidBotIdentity({ userId: "tenant", agentId: "oldest" })).rejects.toThrow(
        "Mailbox temporarily unavailable",
      );
    }
    expect(h.phoneProvision).toHaveBeenCalledTimes(2);
    expect(h.ownedNumbers).toHaveBeenCalledTimes(2);
    expect(h.provider).toHaveBeenCalledTimes(2);
    expect(h.lines).toEqual([{ agentId: "oldest" }]);
  });
  it("still admits the eligible Bot to the managed-identity path", async () => {
    h.target = "oldest";
    await expect(ensurePaidBotIdentity({ userId: "tenant", agentId: "oldest" })).rejects.toThrow(
      "Provider work must not run",
    );
    expect(h.fence).toHaveBeenCalledOnce();
    expect(h.provider).toHaveBeenCalledOnce();
  });
  it("does not enqueue excess retained Bots after a downgrade", async () => {
    await expect(enqueuePaidBotIdentityReconciliation("tenant")).resolves.toEqual({
      agents: 1,
      queued: 1,
      alreadyQueued: 0,
    });
    expect(h.enqueue).toHaveBeenCalledTimes(1);
    expect(h.enqueue.mock.calls[0][1].payload).toEqual({ userId: "tenant", agentId: "oldest" });
  });
  it("reuses an eligible queued job without adding another", async () => {
    h.jobs = [{ payload: { agentId: "oldest" } }];
    await expect(enqueuePaidBotIdentityReconciliation("tenant")).resolves.toEqual({
      agents: 1,
      queued: 0,
      alreadyQueued: 1,
    });
    expect(h.enqueue).not.toHaveBeenCalled();
  });
  it("rejects a stale over-capacity job before mailbox, vault or carrier work", async () => {
    await expect(
      ensurePaidBotIdentity({ userId: "tenant", agentId: "newest" }),
    ).resolves.toMatchObject({ eligible: false, phone: null, email: null });
    expect(h.provider).not.toHaveBeenCalled();
    expect(h.fence).not.toHaveBeenCalled();
  });
  it("rechecks capacity inside the deletion fence before calling providers", async () => {
    h.target = "oldest";
    h.beforePerform = () => {
      h.slots = 0;
    };
    await expect(
      ensurePaidBotIdentity({ userId: "tenant", agentId: "oldest" }),
    ).resolves.toMatchObject({ eligible: false });
    expect(h.fence).toHaveBeenCalledOnce();
    expect(h.provider).not.toHaveBeenCalled();
  });
  it.each(["trialing", "canceled", "past_due"])(
    "does not allocate provider resources for %s",
    async (status) => {
      h.status = status;
      await expect(enqueuePaidBotIdentityReconciliation("tenant")).resolves.toMatchObject({
        agents: 0,
        queued: 0,
      });
      await expect(
        ensurePaidBotIdentity({ userId: "tenant", agentId: "newest" }),
      ).resolves.toMatchObject({ eligible: false });
      expect(h.provider).not.toHaveBeenCalled();
    },
  );
  it("queues purchased additional capacity while preserving the same worker gate", async () => {
    h.slots = 2;
    await expect(enqueuePaidBotIdentityReconciliation("tenant")).resolves.toMatchObject({
      agents: 2,
      queued: 2,
    });
    expect(h.enqueue.mock.calls.map((call) => call[1].payload.agentId)).toEqual([
      "oldest",
      "newest",
    ]);
  });
});
