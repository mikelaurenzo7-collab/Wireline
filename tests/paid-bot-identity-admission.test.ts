import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  accounts: [] as Array<{
    id: string;
    emailAddress: string;
    oauthGrantedScopes: string;
    refreshToken: string | null;
  }>,
  target: "newest",
  beforePerform: undefined as undefined | (() => void),
  enqueue: vi.fn(),
  provider: vi.fn(),
  createInbox: vi.fn(),
  phoneProvision: vi.fn(),
  phoneRelease: vi.fn(),
  ownedNumbers: vi.fn(),
  vaultConfigured: vi.fn(),
  inboxesRead: vi.fn(),
  domainIdentity: vi.fn(),
  webhookUrl: vi.fn(),
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
              ? h.accounts
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
    retainOnSuccess,
  }: {
    perform: () => Promise<unknown>;
    retainOnSuccess: boolean;
  }) => {
    h.fence(retainOnSuccess);
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
  releaseNativeTenantNumber: (...args: unknown[]) => h.phoneRelease(...args),
}));
vi.mock("../src/lib/secret-vault", () => ({
  encryptSecret: h.provider,
  isVaultConfigured: h.vaultConfigured,
}));
vi.mock("../src/lib/owned-email-account", () => ({
  EMAIL_ACCOUNT_OWNERSHIP_CONFLICT_MESSAGE: "ownership conflict",
  upsertOwnedEmailAccount: h.provider,
}));
vi.mock("../src/lib/agentmail-mail", () => ({
  AGENTMAIL_MANAGED_CREDENTIAL_SENTINEL: "managed",
  AGENTMAIL_MANAGED_SCOPE_MARKER: "managed",
  agentmailGrantedScopes: h.provider,
  createAgentMailInbox: h.createInbox,
  ensureAgentMailWebhook: h.provider,
  getAgentMailWebhook: h.provider,
  hasExactAgentMailManagedScope: (scopes: string) => scopes === "managed",
  listAgentMailInboxes: h.inboxesRead,
  publicAgentMailWebhookUrl: h.webhookUrl,
  verifyAgentMailCredentials: h.provider,
  verifyManagedAgentMailDomainIdentity: h.domainIdentity,
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
  h.accounts = [];
  h.beforePerform = undefined;
  h.enqueue.mockResolvedValue({ jobId: "test-job" });
  h.provider.mockImplementation(() => {
    throw new Error("Provider work must not run");
  });
  h.phoneProvision.mockImplementation((...args: unknown[]) => h.provider(...args));
  h.createInbox.mockImplementation((...args: unknown[]) => h.provider(...args));
  h.phoneRelease.mockResolvedValue({ ok: true });
  h.ownedNumbers.mockResolvedValue([{ sid: "PN_test_owned_line" }]);
  h.vaultConfigured.mockReturnValue(true);
  h.inboxesRead.mockResolvedValue([]);
  h.domainIdentity.mockResolvedValue(undefined);
  h.webhookUrl.mockReturnValue("https://botbound.app/api/webhooks/agentmail/configuration-check");
  vi.stubEnv("AGENTMAIL_API_KEY", "test-only-agentmail-key");
  vi.stubEnv("AGENTMAIL_DEFAULT_DOMAIN", "botbound.app");
});
afterEach(() => vi.unstubAllEnvs());

describe("paid identity admission at queue and provider boundaries", () => {
  it.each(["bots.botbound.me", "bots.botbound.app"])(
    "retains an existing %s mailbox after the configured domain changes",
    async (domain) => {
      h.target = "oldest";
      const email = `existing@${domain}`;
      h.accounts = [
        {
          id: "mailbox",
          emailAddress: email,
          oauthGrantedScopes: "managed",
          refreshToken: "stored-secret",
        },
      ];
      h.inboxesRead.mockResolvedValue([{ inboxId: "existing-inbox", email }]);
      h.phoneProvision.mockResolvedValue({ ok: true, phoneNumber: "+12025550123", reused: true });
      h.provider.mockReturnValue({ webhookId: "existing-webhook", secret: null });

      await expect(
        ensurePaidBotIdentity({ userId: "tenant", agentId: "oldest" }),
      ).resolves.toMatchObject({ email, emailReused: true });
      expect(h.domainIdentity).toHaveBeenCalledWith("test-only-agentmail-key", undefined, domain);
      expect(h.createInbox).not.toHaveBeenCalled();
    },
  );

  it("does not recreate a missing legacy mailbox or buy a line for it", async () => {
    h.target = "oldest";
    h.accounts = [
      {
        id: "mailbox",
        emailAddress: "existing@bots.botbound.me",
        oauthGrantedScopes: "managed",
        refreshToken: "stored-secret",
      },
    ];
    await expect(ensurePaidBotIdentity({ userId: "tenant", agentId: "oldest" })).rejects.toThrow(
      "legacy managed mailbox is missing",
    );
    expect(h.phoneProvision).not.toHaveBeenCalled();
    expect(h.createInbox).not.toHaveBeenCalled();
  });

  it("does not provision a new identity on the retired domain", async () => {
    h.target = "oldest";
    vi.stubEnv("AGENTMAIL_DEFAULT_DOMAIN", "bots.botbound.me");
    await expect(ensurePaidBotIdentity({ userId: "tenant", agentId: "oldest" })).rejects.toThrow(
      "must be botbound.app",
    );
    expect(h.phoneProvision).not.toHaveBeenCalled();
    expect(h.createInbox).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    "preserves a persisted line on transient carrier verification failure (reused=%s)",
    async (reused) => {
      h.target = "oldest";
      h.lines = [{ agentId: "oldest" }];
      h.phoneProvision.mockResolvedValue({ ok: true, phoneNumber: "+12025550123", reused });
      const unavailable = Object.assign(new Error("Twilio temporarily unavailable"), {
        status: 503,
      });
      h.ownedNumbers.mockRejectedValue(unavailable);

      await expect(ensurePaidBotIdentity({ userId: "tenant", agentId: "oldest" })).rejects.toBe(
        unavailable,
      );

      expect(h.phoneRelease).not.toHaveBeenCalled();
      expect(h.provider).not.toHaveBeenCalled();
      expect(h.lines).toEqual([{ agentId: "oldest" }]);

      // The durable retry reuses the same reservation after ownership recovers.
      h.ownedNumbers.mockResolvedValue([{ sid: "PN_test_owned_line" }]);
      await expect(ensurePaidBotIdentity({ userId: "tenant", agentId: "oldest" })).rejects.toThrow(
        "Provider work must not run",
      );
      expect(h.phoneRelease).not.toHaveBeenCalled();
      expect(h.phoneProvision).toHaveBeenCalledTimes(2);
    },
  );

  it("retains an unverified existing line for reconciliation without provisioning a mailbox", async () => {
    h.target = "oldest";
    h.lines = [{ agentId: "oldest" }];
    h.phoneProvision.mockResolvedValue({
      ok: true,
      phoneNumber: "+12025550123",
      reused: true,
    });
    h.ownedNumbers.mockResolvedValue([]);

    await expect(ensurePaidBotIdentity({ userId: "tenant", agentId: "oldest" })).rejects.toThrow(
      "Paid Bot line is not owned by the configured Twilio account",
    );

    expect(h.phoneRelease).not.toHaveBeenCalled();
    expect(h.provider).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "missing or invalid vault",
      setup: () => h.vaultConfigured.mockReturnValue(false),
      error: "Credential vault",
    },
    {
      name: "missing AgentMail key",
      setup: () => vi.stubEnv("AGENTMAIL_API_KEY", ""),
      error: "AGENTMAIL_API_KEY",
    },
    {
      name: "missing managed domain",
      setup: () => vi.stubEnv("AGENTMAIL_DEFAULT_DOMAIN", ""),
      error: "AGENTMAIL_DEFAULT_DOMAIN",
    },
    {
      name: "malformed managed domain",
      setup: () => vi.stubEnv("AGENTMAIL_DEFAULT_DOMAIN", "bad..botbound.app"),
      error: "AGENTMAIL_DEFAULT_DOMAIN",
    },
    {
      name: "non-BotBound domain",
      setup: () => vi.stubEnv("AGENTMAIL_DEFAULT_DOMAIN", "other.example"),
      error: "AGENTMAIL_DEFAULT_DOMAIN",
    },
    {
      name: "invalid webhook origin",
      setup: () => h.webhookUrl.mockReturnValue(null),
      error: "public APP_URL",
    },
    {
      name: "rejected AgentMail credential",
      setup: () => h.inboxesRead.mockRejectedValue(new Error("AgentMail credential rejected")),
      error: "AgentMail credential rejected",
    },
    {
      name: "stored mailbox on another domain",
      setup: () => {
        h.accounts = [
          {
            id: "mailbox",
            emailAddress: "legacy@other.example",
            oauthGrantedScopes: "managed",
            refreshToken: null,
          },
        ];
      },
      error: "Existing managed mailbox",
    },
    ...["unowned", "unverified"].map((state) => ({
      name: `${state} managed domain`,
      setup: () => h.domainIdentity.mockRejectedValue(new Error(`Managed domain ${state}`)),
      error: `Managed domain ${state}`,
    })),
  ])("rejects $name before buying or reserving a phone", async ({ setup, error }) => {
    h.target = "oldest";
    setup();
    await expect(ensurePaidBotIdentity({ userId: "tenant", agentId: "oldest" })).rejects.toThrow(
      error,
    );
    expect(h.phoneProvision).not.toHaveBeenCalled();
    expect(h.provider).not.toHaveBeenCalled();
  });
  it("retains connected draft protection after a web business-profile edit", async () => {
    const id = "agent-0123456789abcdef0123456789abcdef";
    h.target = id;
    h.agents = [{ id, businessVariables: { businessName: "Edited in Studio" } }];
    await expect(enqueuePaidBotIdentityReconciliation("tenant")).resolves.toMatchObject({
      agents: 0,
      queued: 0,
    });
    await expect(ensurePaidBotIdentity({ userId: "tenant", agentId: id })).resolves.toMatchObject({
      eligible: false,
    });
    expect(h.phoneProvision).not.toHaveBeenCalled();
    expect(h.provider).not.toHaveBeenCalled();
  });
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
    expect(h.fence).toHaveBeenCalledWith(true);
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
    await expect(ensurePaidBotIdentity({ userId: "tenant", agentId: "oldest" })).rejects.toThrow(
      "PAID_IDENTITY_ENTITLEMENT_MISMATCH",
    );
    expect(h.fence).toHaveBeenCalledOnce();
    expect(h.provider).not.toHaveBeenCalled();
  });
  it("surfaces active-subscription projection mismatches instead of intentional skips", async () => {
    h.slots = 0;
    await expect(enqueuePaidBotIdentityReconciliation("tenant")).rejects.toThrow(
      "PAID_IDENTITY_ENTITLEMENT_MISMATCH",
    );
    await expect(ensurePaidBotIdentity({ userId: "tenant", agentId: "newest" })).rejects.toThrow(
      "PAID_IDENTITY_ENTITLEMENT_MISMATCH",
    );
    expect(h.enqueue).not.toHaveBeenCalled();
    expect(h.phoneProvision).not.toHaveBeenCalled();
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
