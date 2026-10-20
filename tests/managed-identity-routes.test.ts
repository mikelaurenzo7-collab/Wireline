import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (req: unknown, res: unknown) => Promise<void>;
const h = vi.hoisted(() => ({
  routes: new Map<string, Handler>(),
  agent: true,
  phone: "+12025550123" as string | null,
  accounts: [] as Array<{
    id: string;
    emailAddress: string;
    oauthGrantedScopes: string;
    refreshToken: string | null;
  }>,
  inboxes: vi.fn(),
  verifyCredentials: vi.fn(),
  ensureWebhook: vi.fn(),
  beforeFence: undefined as (() => void) | undefined,
  ensure: vi.fn(),
  eligible: vi.fn(),
  phoneOwned: vi.fn(),
  channel: vi.fn(),
  domain: vi.fn(),
  mutate: vi.fn(),
  where: vi.fn(),
  getWebhook: vi.fn(),
  updates: [] as Array<{ refreshToken: string }>,
  persistedRows: 1,
}));
vi.mock("express", () => ({
  Router: () => ({
    post: (path: string, ...handlers: Handler[]) => h.routes.set(path, handlers.at(-1)!),
  }),
}));
vi.mock("drizzle-orm", () => ({ and: (...v: unknown[]) => v, eq: (...v: unknown[]) => v }));
vi.mock("../src/db/schema", () => ({
  agents: { table: "agents", id: "agent.id", userId: "agent.user", name: "agent.name" },
  phoneNumbers: {
    table: "phones",
    phoneNumber: "phone.number",
    userId: "phone.user",
    agentId: "phone.agent",
  },
  emailAccounts: {
    table: "emails",
    id: "email.id",
    userId: "email.user",
    agentId: "email.agent",
    provider: "email.provider",
  },
}));
vi.mock("../src/lib/server-context", () => ({
  log: { warn: vi.fn() },
  fetchWithTimeout: h.mutate,
  drizzle: {
    select: () => {
      let table: string;
      const query = {
        from: (value: { table: string }) => {
          table = value.table;
          return query;
        },
        where: (value: unknown) => {
          h.where(value);
          return query;
        },
        limit: () => query,
        then: (resolve: (value: unknown[]) => unknown) =>
          Promise.resolve(
            table === "agents"
              ? h.agent
                ? [{ id: "bot", name: "Bot" }]
                : []
              : table === "phones"
                ? h.phone
                  ? [{ phoneNumber: h.phone }]
                  : []
                : h.accounts,
          ).then(resolve),
      };
      return query;
    },
    update: () => ({
      set: (value: { refreshToken: string }) => {
        h.updates.push(value);
        return {
          where: () => ({
            returning: async () =>
              Array.from({ length: h.persistedRows }, () => ({ id: "mailbox" })),
          }),
        };
      },
    }),
  },
}));
vi.mock("../src/lib/paid-bot-identity", () => ({
  ensurePaidBotIdentity: h.ensure,
  getPaidBotMailboxAgentIds: h.eligible,
  assertTwilioOwnedNumber: h.phoneOwned,
}));
vi.mock("../src/lib/channel-entitlements", () => ({ requireTenantChannel: h.channel }));
vi.mock("../src/lib/agentmail-mail", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/agentmail-mail")>();
  return {
    AGENTMAIL_API_BASE: "https://api.example.test",
    AGENTMAIL_MANAGED_CREDENTIAL_SENTINEL: "managed",
    AgentMailConnectError: class extends Error {},
    agentMailManagedInboxClientId: actual.agentMailManagedInboxClientId,
    agentmailLocalPart: (email: string) => email.split("@")[0],
    agentmailGrantedScopes: h.mutate,
    deleteAgentMailWebhooksForAccount: h.mutate,
    ensureAgentMailWebhook: h.ensureWebhook,
    getAgentMailWebhook: h.getWebhook,
    hasExactAgentMailManagedScope: (scopes: string) => scopes === "managed",
    listAgentMailInboxes: h.inboxes,
    normalizeAgentMailInbox: actual.normalizeAgentMailInbox,
    resolveAgentMailInbox: h.mutate,
    verifyAgentMailCredentials: h.verifyCredentials,
    verifyManagedAgentMailDomainIdentity: h.domain,
  };
});
vi.mock("../src/lib/owned-email-account", () => ({
  EMAIL_ACCOUNT_OWNERSHIP_CONFLICT_MESSAGE: "ownership conflict",
  upsertOwnedEmailAccount: h.mutate,
}));
vi.mock("../src/lib/api-validation", () => ({
  validateBody: () => () => {},
  agentmailConnectSchema: {},
}));
vi.mock("../src/lib/secret-vault", () => ({
  encryptSecret: (value: string) => `enc:${value}`,
  decryptSecret: h.mutate,
  isVaultConfigured: () => true,
}));
vi.mock("../src/middleware/auth", () => ({ authenticateUser: () => {} }));
vi.mock("../src/middleware/api-rate-limits", () => ({ createRateLimiter: () => () => {} }));
vi.mock("../src/lib/account-environment-policy", () => ({
  assertLiveExternalActionAllowed: async () => {},
}));
vi.mock("../src/lib/tenant-provider-deletion-fence", () => ({
  runTenantProviderWorkWithDeletionFence: async ({
    perform,
  }: {
    perform: () => Promise<unknown>;
  }) => {
    h.beforeFence?.();
    return { performed: true, result: await perform() };
  },
}));

import "../src/routes/agentmail-routes";

const invoke = async (suffix: string) => {
  const res = { json: vi.fn(), status: vi.fn() };
  res.status.mockReturnValue(res);
  await h.routes.get(`/api/agents/:agentId/${suffix}`)!(
    { user: { id: "tenant" }, params: { agentId: "bot" }, body: { userId: "other-tenant" } },
    res,
  );
  return res;
};

beforeEach(() => {
  vi.clearAllMocks();
  h.agent = true;
  h.phone = "+12025550123";
  h.accounts = [];
  h.updates = [];
  h.persistedRows = 1;
  h.beforeFence = undefined;
  h.eligible.mockResolvedValue(["bot"]);
  h.phoneOwned.mockResolvedValue(undefined);
  h.channel.mockResolvedValue(undefined);
  h.domain.mockResolvedValue(undefined);
  h.ensure.mockResolvedValue({
    eligible: true,
    planId: "voice-email",
    selectionRequired: false,
    phone: "+12025550123",
    email: "bot@botbound.app",
    phoneReused: true,
    emailReused: true,
  });
  h.mutate.mockImplementation(() => {
    throw new Error("Unexpected provider mutation");
  });
  h.inboxes.mockResolvedValue([]);
  h.verifyCredentials.mockResolvedValue(undefined);
  h.ensureWebhook.mockResolvedValue({ webhookId: "existing-hook", secret: null });
  h.getWebhook.mockRejectedValue(new Error("Unexpected AgentMail webhook GET"));
  vi.stubEnv("AGENTMAIL_API_KEY", "test-only-key");
  vi.stubEnv("AGENTMAIL_DEFAULT_DOMAIN", "botbound.app");
});
afterEach(() => vi.unstubAllEnvs());

describe("shared web identity reconciliation", () => {
  it.each([
    { planId: "email", phone: null, email: "bot@botbound.app", customDomain: true },
    { planId: "voice", phone: "+12025550123", email: null, customDomain: false },
  ])(
    "returns the purchased $planId identity without requiring the excluded channel",
    async ({ planId, phone, email, customDomain }) => {
      h.ensure.mockResolvedValue({
        eligible: true,
        planId,
        selectionRequired: false,
        phone,
        email,
        phoneReused: Boolean(phone),
        emailReused: Boolean(email),
      });
      const res = await invoke("managed-identity");
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: true,
          phone_number: phone,
          email,
          custom_domain: customDomain,
        }),
      );
      expect(h.ensure).toHaveBeenCalledExactlyOnceWith({ userId: "tenant", agentId: "bot" });
      expect(h.channel).not.toHaveBeenCalled();
      expect(h.mutate).not.toHaveBeenCalled();
    },
  );
  it.each([
    { planId: "email", phone: null, email: null },
    { planId: "voice", phone: null, email: null },
    { planId: "voice-email", phone: "+12025550123", email: null },
    { planId: "unknown", phone: "+12025550123", email: "bot@botbound.app" },
  ])("does not report incomplete or unknown $planId coverage as ready", async (identity) => {
    h.ensure.mockResolvedValue({ eligible: true, selectionRequired: false, ...identity });
    await expect(invoke("managed-identity")).rejects.toMatchObject({ status: 503 });
    expect(h.mutate).not.toHaveBeenCalled();
  });
  it("binds the shared reconciler to the authenticated tenant and returns both identities", async () => {
    const res = await invoke("managed-identity");
    expect(h.ensure).toHaveBeenCalledExactlyOnceWith({ userId: "tenant", agentId: "bot" });
    expect(h.where).toHaveBeenCalledWith([
      ["agent.id", "bot"],
      ["agent.user", "tenant"],
    ]);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        email: "bot@botbound.app",
        phone_number: "+12025550123",
      }),
    );
    expect(h.mutate).not.toHaveBeenCalled();
  });
  it("rejects a missing or foreign Bot before reconciliation", async () => {
    h.agent = false;
    await expect(invoke("managed-identity")).rejects.toMatchObject({ status: 404 });
    expect(h.ensure).not.toHaveBeenCalled();
  });
  it("returns an activation response for intentionally excluded Bots", async () => {
    h.ensure.mockResolvedValue({ eligible: false });
    await expect(invoke("managed-identity")).rejects.toMatchObject({ code: "ACTIVATION_REQUIRED" });
  });
  it("asks an eligible customer to select a number instead of reporting an empty identity as ready", async () => {
    h.ensure.mockResolvedValue({
      eligible: true,
      planId: "voice",
      selectionRequired: true,
      phone: null,
      email: null,
    });
    await expect(invoke("managed-identity")).rejects.toMatchObject({
      status: 409,
      code: "NUMBER_SELECTION_REQUIRED",
      message: "Choose a number in Calls setup to finish connecting this Bot.",
    });
    expect(h.mutate).not.toHaveBeenCalled();
  });
  it("keeps configuration failures out of the customer response", async () => {
    h.ensure.mockRejectedValue(new Error("Internal provider configuration details"));
    await expect(invoke("managed-identity")).rejects.toMatchObject({
      status: 503,
      message: "Bot channel setup is temporarily unavailable. Please try again.",
    });
  });
});

describe("compatibility mailbox admission", () => {
  it("retries a reserved mailbox with a provider-valid ID and then reuses its exact address", async () => {
    h.accounts = [
      {
        id: "mailbox",
        emailAddress: "reserved@botbound.app",
        oauthGrantedScopes: "managed",
        refreshToken: "stored-secret",
      },
    ];
    h.mutate.mockImplementation(async (_url: string, options: RequestInit) => {
      const body = JSON.parse(String(options.body));
      const valid = /^[A-Za-z0-9._~-]+$/.test(body.client_id);
      return {
        ok: valid,
        status: valid ? 201 : 400,
        text: async () =>
          JSON.stringify(
            valid
              ? { inbox_id: `${body.username}@${body.domain}` }
              : { message: "client_id invalid_format" },
          ),
      };
    });
    const res = await invoke("managed-mailbox");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "reserved@botbound.app",
      }),
    );
    expect(h.mutate).toHaveBeenCalledOnce();
    expect(h.verifyCredentials).toHaveBeenCalledWith("reserved@botbound.app", "test-only-key");
    h.inboxes.mockResolvedValue([
      { inboxId: "reserved@botbound.app", email: "reserved@botbound.app" },
    ]);
    await invoke("managed-mailbox");
    expect(h.mutate).toHaveBeenCalledOnce();
  });
  it.each(["bots.botbound.app", "bots.botbound.me"])(
    "reconciles a legacy mailbox while provisioning uses %s",
    async (configuredDomain) => {
      vi.stubEnv("AGENTMAIL_DEFAULT_DOMAIN", configuredDomain);
      h.accounts = [
        {
          id: "mailbox",
          emailAddress: "existing@bots.botbound.me",
          oauthGrantedScopes: "managed",
          refreshToken: "stored-secret",
        },
      ];
      h.inboxes.mockResolvedValue([
        { inboxId: "legacy-inbox", email: "existing@bots.botbound.me" },
      ]);
      const res = await invoke("managed-mailbox");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ email: "existing@bots.botbound.me", reused: true }),
      );
      expect(h.domain).toHaveBeenCalledWith("test-only-key", undefined, "bots.botbound.me");
      expect(h.ensureWebhook).toHaveBeenCalledWith(
        expect.objectContaining({ inboxId: "legacy-inbox", hasStoredSecret: true }),
      );
      expect(h.mutate).not.toHaveBeenCalled();
    },
  );
  it("persists a created AgentMail webhook signing secret onto the mailbox row", async () => {
    h.accounts = [
      {
        id: "mailbox",
        emailAddress: "existing@bots.botbound.me",
        oauthGrantedScopes: "managed",
        refreshToken: null,
      },
    ];
    h.inboxes.mockResolvedValue([{ inboxId: "legacy-inbox", email: "existing@bots.botbound.me" }]);
    h.ensureWebhook.mockResolvedValue({ webhookId: "wh_created", secret: "whsec_create" });
    h.mutate.mockResolvedValue(undefined);
    const res = await invoke("managed-mailbox");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(h.ensureWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ inboxId: "legacy-inbox", hasStoredSecret: false }),
    );
    expect(h.updates).toEqual([{ refreshToken: "enc:whsec_create" }]);
    expect(h.getWebhook).not.toHaveBeenCalled();
    expect(h.mutate).toHaveBeenCalledExactlyOnceWith({
      apiKey: "test-only-key",
      accountId: "mailbox",
      keepWebhookId: "wh_created",
    });
  });
  it("GETs an existing webhook secret when BotBound has not stored one and keeps the webhook", async () => {
    h.accounts = [
      {
        id: "mailbox",
        emailAddress: "existing@bots.botbound.me",
        oauthGrantedScopes: "managed",
        refreshToken: null,
      },
    ];
    h.inboxes.mockResolvedValue([{ inboxId: "legacy-inbox", email: "existing@bots.botbound.me" }]);
    h.ensureWebhook.mockResolvedValue({ webhookId: "wh_console", secret: null });
    h.getWebhook.mockResolvedValue({ webhookId: "wh_console", secret: "whsec_get" });
    h.mutate.mockResolvedValue(undefined);
    const res = await invoke("managed-mailbox");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(h.getWebhook).toHaveBeenCalledWith("test-only-key", "wh_console");
    expect(h.updates).toEqual([{ refreshToken: "enc:whsec_get" }]);
    expect(h.mutate).toHaveBeenCalledExactlyOnceWith({
      apiKey: "test-only-key",
      accountId: "mailbox",
      keepWebhookId: "wh_console",
    });
  });
  it("does not retire older hooks when the replacement signing secret is not persisted", async () => {
    h.accounts = [
      {
        id: "mailbox",
        emailAddress: "existing@bots.botbound.me",
        oauthGrantedScopes: "managed",
        refreshToken: null,
      },
    ];
    h.inboxes.mockResolvedValue([{ inboxId: "legacy-inbox", email: "existing@bots.botbound.me" }]);
    h.ensureWebhook.mockResolvedValue({ webhookId: "wh_created", secret: "whsec_create" });
    h.persistedRows = 0;

    await invoke("managed-mailbox");
    expect(h.updates).toEqual([{ refreshToken: "enc:whsec_create" }]);
    expect(h.mutate).not.toHaveBeenCalled();
  });
  it("does not recreate a missing legacy mailbox", async () => {
    h.accounts = [
      {
        id: "mailbox",
        emailAddress: "existing@bots.botbound.me",
        oauthGrantedScopes: "managed",
        refreshToken: "stored-secret",
      },
    ];
    await expect(invoke("managed-mailbox")).rejects.toMatchObject({ status: 503 });
    expect(h.mutate).not.toHaveBeenCalled();
    expect(h.ensureWebhook).not.toHaveBeenCalled();
  });
  it.each(["bots.botbound.me", "notbotbound.app", "bad..botbound.app"])(
    "blocks new provisioning on %s",
    async (domain) => {
      vi.stubEnv("AGENTMAIL_DEFAULT_DOMAIN", domain);
      await expect(invoke("managed-mailbox")).rejects.toMatchObject({ status: 503 });
      expect(h.domain).not.toHaveBeenCalled();
      expect(h.mutate).not.toHaveBeenCalled();
    },
  );
  it("rejects trialing, private, or excess-capacity Bots excluded by the shared roster", async () => {
    h.eligible.mockResolvedValue([]);
    await expect(invoke("managed-mailbox")).rejects.toMatchObject({ code: "ACTIVATION_REQUIRED" });
    expect(h.mutate).not.toHaveBeenCalled();
  });
  it("does not consult a phone or carrier when Email is included", async () => {
    h.phone = null;
    h.domain.mockRejectedValue(new Error("Reached independent email setup"));
    await expect(invoke("managed-mailbox")).rejects.toThrow("Reached independent email setup");
    expect(h.phoneOwned).not.toHaveBeenCalled();
  });
  it("rejects an excluded Email channel before any mailbox provider work", async () => {
    h.channel.mockRejectedValue(
      Object.assign(new Error("Add Email"), { status: 402, code: "CHANNEL_NOT_INCLUDED" }),
    );
    await expect(invoke("managed-mailbox")).rejects.toMatchObject({ code: "CHANNEL_NOT_INCLUDED" });
    expect(h.mutate).not.toHaveBeenCalled();
    expect(h.domain).not.toHaveBeenCalled();
  });
  it("rechecks eligibility after waiting for the deletion fence", async () => {
    h.beforeFence = () => h.eligible.mockResolvedValue([]);
    await expect(invoke("managed-mailbox")).rejects.toMatchObject({ code: "ACTIVATION_REQUIRED" });
    expect(h.mutate).not.toHaveBeenCalled();
  });
  it("requires verified managed-domain ownership before any mailbox mutation", async () => {
    h.domain.mockRejectedValue(new Error("Domain ownership unverified"));
    await expect(invoke("managed-mailbox")).rejects.toThrow("Domain ownership unverified");
    expect(h.mutate).not.toHaveBeenCalled();
  });
});
