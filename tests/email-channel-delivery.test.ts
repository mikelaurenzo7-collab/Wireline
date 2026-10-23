import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  accounts: [] as Record<string, unknown>[],
  select: vi.fn(),
  channel: vi.fn(),
  environment: vi.fn(),
  entity: vi.fn(),
  reserve: vi.fn(),
  agentmail: vi.fn(),
  icloud: vi.fn(),
  platform: vi.fn(),
  fetchInbox: vi.fn(),
}));
vi.mock("../src/lib/server-context", () => ({
  drizzle: { select: h.select },
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
  fetchWithTimeout: vi.fn(),
}));
vi.mock("../src/lib/channel-entitlements", () => ({ requireTenantChannel: h.channel }));
vi.mock("../src/lib/managed-mail-send-spend", () => ({ sendFundedManagedEmail: h.reserve }));
vi.mock("../src/lib/account-environment-policy", () => ({
  liveExternalActionPolicyForUser: h.environment,
  assertExternalEntityActionAllowed: h.entity,
}));
vi.mock("../src/lib/tenant-provider-deletion-fence", () => ({
  runTenantProviderWorkWithDeletionFence: async ({
    perform,
  }: {
    perform: () => Promise<boolean>;
  }) => ({ performed: true, result: await perform() }),
}));
vi.mock("../src/lib/secret-vault", () => ({
  decryptSecret: (value: string) => value,
  encryptSecret: (value: string) => value,
}));
vi.mock("../src/lib/google-apis", () => ({ googleApis: vi.fn() }));
vi.mock("../src/lib/zoom-service", () => ({ createMeeting: vi.fn() }));
vi.mock("../src/lib/icloud-mail", () => ({
  fetchIcloudInbox: h.fetchInbox,
  sendIcloudMail: h.icloud,
}));
vi.mock("../src/lib/agentmail-mail", () => ({
  fetchAgentMailInbox: h.fetchInbox,
  sendAgentMail: h.agentmail,
}));
vi.mock("../src/lib/email-service", () => ({ sendEmail: h.platform }));

import { IntegrationService } from "../src/lib/integrations";
const message = {
  to: "recipient@example.com",
  subject: "Requested details",
  body: "Your information",
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("RESEND_API_KEY", "test-only");
  h.accounts = [
    {
      id: "mailbox-a",
      provider: "agentmail",
      accessToken: "test-only",
      emailAddress: "bot@example.com",
    },
  ];
  h.select.mockImplementation((fields) => ({
    from: () => ({
      where: () => (fields ? { limit: async () => [] } : Promise.resolve(h.accounts)),
    }),
  }));
  h.channel.mockResolvedValue({ channels: ["email"] });
  h.environment.mockResolvedValue({ allowed: true });
  h.reserve.mockImplementation(async ({ perform }) => perform());
  h.agentmail.mockResolvedValue(true);
  h.icloud.mockResolvedValue(true);
  h.platform.mockResolvedValue({ ok: true });
});
afterEach(() => vi.unstubAllEnvs());

describe("customer email admission and funded transport", () => {
  it("denies every transport and inbox fetch before provider/account work when Email is excluded", async () => {
    h.channel.mockRejectedValue(new Error("Email is not included"));
    const integration = new IntegrationService("tenant-a");
    expect(await integration.sendEmail(message)).toBe(false);
    expect((await integration.fetchInboxMessages()).failures).toHaveLength(1);
    expect(h.select).not.toHaveBeenCalled();
    expect(h.reserve).not.toHaveBeenCalled();
    expect(h.agentmail).not.toHaveBeenCalled();
    expect(h.platform).not.toHaveBeenCalled();
    expect(h.fetchInbox).not.toHaveBeenCalled();
  });
  it("keeps demo workspaces from reserving or sending", async () => {
    h.environment.mockResolvedValue({ allowed: false });
    expect(await new IntegrationService("tenant-a").sendEmail(message)).toBe(false);
    expect(h.reserve).not.toHaveBeenCalled();
    expect(h.agentmail).not.toHaveBeenCalled();
  });
  it("does not reserve without mailbox credentials", async () => {
    h.accounts[0].accessToken = null;
    expect(await new IntegrationService("tenant-a").sendEmail(message)).toBe(false);
    expect(h.reserve).not.toHaveBeenCalled();
  });
  it.each(["a@example.com,b@example.com", "a@example.com\r\nBcc: b@example.com"])(
    "rejects recipient lists or header injection before billing",
    async (to) => {
      expect(await new IntegrationService("tenant-a").sendEmail({ ...message, to })).toBe(false);
      expect(h.reserve).not.toHaveBeenCalled();
      expect(h.agentmail).not.toHaveBeenCalled();
    },
  );
  it("funds AgentMail before sending under the tenant identity", async () => {
    expect(await new IntegrationService("tenant-a").sendEmail(message)).toBe(true);
    expect(h.channel).toHaveBeenCalledWith("tenant-a", "email");
    expect(h.reserve).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "tenant-a", provider: "agentmail" }),
    );
    expect(h.agentmail).toHaveBeenCalledWith(
      "bot@example.com",
      "test-only",
      expect.objectContaining({
        ...message,
        textBody: "Your information\n\nbot@example.com",
        htmlBody: expect.stringContaining("bot@example.com"),
      }),
    );
  });
  it("uses the originating Bot's mailbox when another Bot's mailbox is listed first", async () => {
    h.accounts = [
      {
        id: "mailbox-other",
        agentId: "bot-other",
        provider: "agentmail",
        accessToken: "other-credential",
        emailAddress: "other@example.com",
      },
      {
        id: "mailbox-front-desk",
        agentId: "bot-front-desk",
        provider: "agentmail",
        accessToken: "front-desk-credential",
        emailAddress: "front-desk@example.com",
      },
    ];
    const scopedMessage = { ...message, agentId: "bot-front-desk" };
    expect(await new IntegrationService("tenant-a").sendEmail(scopedMessage)).toBe(true);
    expect(h.agentmail).toHaveBeenCalledExactlyOnceWith(
      "front-desk@example.com",
      "front-desk-credential",
      expect.objectContaining({
        ...scopedMessage,
        textBody: "Your information\n\nfront-desk@example.com",
        htmlBody: expect.stringContaining("front-desk@example.com"),
      }),
    );
    expect(h.platform).not.toHaveBeenCalled();
  });
  it("renders the assigned Bot's saved signature and the tenant's business identity", async () => {
    h.accounts[0].agentId = "bot-front-desk";
    h.select.mockImplementation((fields) => ({
      from: () => ({
        where: () =>
          fields
            ? {
                limit: async () =>
                  fields.businessName
                    ? [{ businessName: "Oak & Elm", brandName: "Oak & Elm", logoUrl: null }]
                    : fields.preferences
                      ? [{ preferences: { company_identity: { website: "https://oak.example/" } } }]
                      : [{ name: "Nora", signature: "Nora\nGuest Services", website: null }],
              }
            : Promise.resolve(h.accounts),
      }),
    }));
    expect(
      await new IntegrationService("tenant-a").sendEmail({ ...message, agentId: "bot-front-desk" }),
    ).toBe(true);
    const sent = h.agentmail.mock.calls[0][2];
    expect(sent.textBody).toBe(
      "Your information\n\nNora\nGuest Services\nOak & Elm\nbot@example.com\nhttps://oak.example/",
    );
    expect(sent.htmlBody).toContain('href="https://oak.example/"');
    expect(sent.htmlBody).not.toContain("BotBound");
  });
  it("refuses a Bot send without its own mailbox instead of using another sender or fallback", async () => {
    h.accounts[0].agentId = "bot-other";
    expect(
      await new IntegrationService("tenant-a").sendEmail({ ...message, agentId: "bot-front-desk" }),
    ).toBe(false);
    expect(h.select).toHaveBeenCalledTimes(1);
    expect(h.reserve).not.toHaveBeenCalled();
    expect(h.agentmail).not.toHaveBeenCalled();
    expect(h.icloud).not.toHaveBeenCalled();
    expect(h.platform).not.toHaveBeenCalled();
  });
  it("stops SMTP when its allowance refuses the reservation", async () => {
    h.reserve.mockResolvedValue(false);
    expect(await new IntegrationService("tenant-a").sendEmail(message)).toBe(false);
    expect(h.agentmail).not.toHaveBeenCalled();
  });
  it("funds the platform fallback too", async () => {
    h.accounts = [];
    expect(await new IntegrationService("tenant-a").sendEmail(message)).toBe(true);
    expect(h.reserve).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "tenant-a", provider: "resend" }),
    );
    expect(h.platform).toHaveBeenCalledOnce();
  });
  it("does not bill connected customer SMTP as platform AgentMail capacity", async () => {
    h.accounts[0].provider = "icloud";
    expect(await new IntegrationService("tenant-a").sendEmail(message)).toBe(true);
    expect(h.channel).toHaveBeenCalledWith("tenant-a", "email");
    expect(h.reserve).not.toHaveBeenCalled();
    expect(h.icloud).toHaveBeenCalledOnce();
  });
});
