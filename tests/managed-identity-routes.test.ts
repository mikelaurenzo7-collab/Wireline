import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (req: unknown, res: unknown) => Promise<void>;
const h = vi.hoisted(() => ({
  routes: new Map<string, Handler>(),
  agent: true,
  phone: "+12025550123" as string | null,
  beforeFence: undefined as (() => void) | undefined,
  ensure: vi.fn(),
  eligible: vi.fn(),
  phoneOwned: vi.fn(),
  domain: vi.fn(),
  mutate: vi.fn(),
  where: vi.fn(),
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
                : [],
          ).then(resolve),
      };
      return query;
    },
  },
}));
vi.mock("../src/lib/paid-bot-identity", () => ({
  ensurePaidBotIdentity: h.ensure,
  getPaidBotIdentityAgentIds: h.eligible,
  assertTwilioOwnedNumber: h.phoneOwned,
}));
vi.mock("../src/lib/agentmail-mail", () => ({
  AGENTMAIL_API_BASE: "https://api.example.test",
  AGENTMAIL_MANAGED_CREDENTIAL_SENTINEL: "managed",
  AgentMailConnectError: class extends Error {},
  agentmailLocalPart: h.mutate,
  agentmailGrantedScopes: h.mutate,
  deleteAgentMailWebhook: h.mutate,
  deleteAgentMailWebhooksForAccount: h.mutate,
  ensureAgentMailWebhook: h.mutate,
  hasExactAgentMailManagedScope: () => false,
  listAgentMailInboxes: h.mutate,
  listAgentMailWebhooks: h.mutate,
  normalizeAgentMailInbox: h.mutate,
  resolveAgentMailInbox: h.mutate,
  verifyAgentMailCredentials: h.mutate,
  verifyManagedAgentMailDomainIdentity: h.domain,
}));
vi.mock("../src/lib/owned-email-account", () => ({
  EMAIL_ACCOUNT_OWNERSHIP_CONFLICT_MESSAGE: "ownership conflict",
  upsertOwnedEmailAccount: h.mutate,
}));
vi.mock("../src/lib/api-validation", () => ({
  validateBody: () => () => {},
  agentmailConnectSchema: {},
}));
vi.mock("../src/lib/secret-vault", () => ({
  encryptSecret: h.mutate,
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
  h.beforeFence = undefined;
  h.eligible.mockResolvedValue(["bot"]);
  h.phoneOwned.mockResolvedValue(undefined);
  h.domain.mockResolvedValue(undefined);
  h.ensure.mockResolvedValue({
    eligible: true,
    phone: "+12025550123",
    email: "bot@botbound.me",
    phoneReused: true,
    emailReused: true,
  });
  h.mutate.mockImplementation(() => {
    throw new Error("Unexpected provider mutation");
  });
  vi.stubEnv("AGENTMAIL_API_KEY", "test-only-key");
  vi.stubEnv("AGENTMAIL_DEFAULT_DOMAIN", "botbound.me");
});
afterEach(() => vi.unstubAllEnvs());

describe("shared web identity reconciliation", () => {
  it("binds the shared reconciler to the authenticated tenant and returns both identities", async () => {
    const res = await invoke("managed-identity");
    expect(h.ensure).toHaveBeenCalledExactlyOnceWith({ userId: "tenant", agentId: "bot" });
    expect(h.where).toHaveBeenCalledWith([
      ["agent.id", "bot"],
      ["agent.user", "tenant"],
    ]);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true, email: "bot@botbound.me", phone_number: "+12025550123" }),
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
  it("keeps configuration failures out of the customer response", async () => {
    h.ensure.mockRejectedValue(new Error("Internal provider configuration details"));
    await expect(invoke("managed-identity")).rejects.toMatchObject({
      status: 503,
      message: "Bot phone and email setup is temporarily unavailable. Please try again.",
    });
  });
});

describe("compatibility mailbox admission", () => {
  it("rejects trialing, private, or excess-capacity Bots excluded by the shared roster", async () => {
    h.eligible.mockResolvedValue([]);
    await expect(invoke("managed-mailbox")).rejects.toMatchObject({ code: "ACTIVATION_REQUIRED" });
    expect(h.mutate).not.toHaveBeenCalled();
  });
  it("requires a persisted phone before any mailbox mutation", async () => {
    h.phone = null;
    await expect(invoke("managed-mailbox")).rejects.toMatchObject({ code: "ACTIVATION_REQUIRED" });
    expect(h.mutate).not.toHaveBeenCalled();
  });
  it("rejects unverified carrier ownership before any mailbox mutation", async () => {
    h.phoneOwned.mockRejectedValue(new Error("Phone ownership unverified"));
    await expect(invoke("managed-mailbox")).rejects.toThrow("Phone ownership unverified");
    expect(h.mutate).not.toHaveBeenCalled();
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
