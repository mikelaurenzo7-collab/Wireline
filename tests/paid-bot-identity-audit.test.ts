import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";

const h = vi.hoisted(() => ({
  rows: [
    {
      agentId: "private-draft",
      userId: "tenant",
      name: "Private",
      plan: "starter",
      status: "active",
    },
    { agentId: "eligible", userId: "tenant", name: "Ready", plan: "starter", status: "active" },
  ],
  eligible: ["eligible"] as string[],
  phones: [] as Array<{ phone: string }>,
  mailboxes: [] as Array<{ email: string; scopes: string }>,
  roster: vi.fn(),
  ownership: vi.fn(),
  provision: vi.fn(),
  inspected: [] as string[],
}));

vi.mock("../src/db/schema", () => ({
  agents: {
    table: "agents",
    id: "agent.id",
    userId: "agent.user",
    name: "agent.name",
    createdAt: "agent.created",
  },
  subscriptions: {
    table: "subscriptions",
    userId: "sub.user",
    plan: "sub.plan",
    status: "sub.status",
  },
  settings: {
    table: "settings",
    userId: "settings.user",
    accountEnvironment: "settings.environment",
  },
  phoneNumbers: {
    table: "phones",
    id: "phone.id",
    userId: "phone.user",
    agentId: "phone.agent",
    phoneNumber: "phone.number",
  },
  emailAccounts: {
    table: "emails",
    id: "email.id",
    userId: "email.user",
    agentId: "email.agent",
    provider: "email.provider",
    emailAddress: "email.address",
    oauthGrantedScopes: "email.scopes",
  },
}));
vi.mock("drizzle-orm", () => ({
  eq: (column: unknown, value: unknown) => {
    if (column === undefined) throw new Error("Query referenced an absent schema column");
    return [column, value];
  },
  and: (...values: unknown[]) => values,
  asc: (value: unknown) => value,
  inArray: (...values: unknown[]) => values,
  gt: (...values: unknown[]) => values,
}));
vi.mock("../src/lib/server-context", () => ({
  log: { error: vi.fn() },
  drizzle: {
    select: () => {
      let table = "";
      const query = {
        from: (value: { table: string }) => {
          table = value.table;
          return query;
        },
        innerJoin: () => query,
        where: () => query,
        orderBy: () => query,
        limit: () => query,
        then: (
          resolveRows: (rows: unknown[]) => unknown,
          reject?: (reason: unknown) => unknown,
        ) => {
          if (table !== "agents") h.inspected.push(table);
          return Promise.resolve(
            table === "agents" ? h.rows : table === "phones" ? h.phones : h.mailboxes,
          ).then(resolveRows, reject);
        },
      };
      return query;
    },
  },
}));
vi.mock("../src/lib/paid-bot-identity", () => ({
  assertTwilioOwnedNumber: (...args: unknown[]) => h.ownership(...args),
  getPaidBotIdentityAgentIds: (...args: unknown[]) => h.roster(...args),
  ensurePaidBotIdentity: (...args: unknown[]) => h.provision(...args),
}));
vi.mock("../src/lib/agentmail-mail", () => ({
  hasExactAgentMailManagedScope: (scope: string) => scope === "managed",
}));

import { main } from "../scripts/reconcile-paid-bot-identities.mts";

let exitCode: typeof process.exitCode;
beforeEach(() => {
  exitCode = process.exitCode;
  process.exitCode = undefined;
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.eligible = ["eligible"];
  h.phones = [];
  h.mailboxes = [];
  h.inspected = [];
  h.roster.mockImplementation(async () => h.eligible);
  h.ownership.mockResolvedValue(undefined);
  h.provision.mockImplementation(() => {
    throw new Error("Dry run must never provision");
  });
});
afterEach(() => {
  process.exitCode = exitCode;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("paid identity repair reporting", () => {
  it.each([false, true])("the operator API reports complete=%s truthfully", async (complete) => {
    vi.stubEnv("CRON_SECRET", "test-only-operator-secret");
    h.provision.mockImplementation(async ({ agentId }: { agentId: string }) => ({
      eligible: agentId === "eligible",
      selectionRequired: agentId === "eligible" && !complete,
      phone: agentId === "eligible" && complete ? "+12025550123" : null,
      email: agentId === "eligible" && complete ? "managed@botbound.app" : null,
    }));
    const { default: handler } = await import("../api/reconcile-paid-bot-identities");
    const res = { statusCode: 0, setHeader: vi.fn(), end: vi.fn() };
    await handler(
      {
        method: "POST",
        url: "/api/reconcile-paid-bot-identities",
        headers: { authorization: "Bearer test-only-operator-secret" },
      } as IncomingMessage,
      res as unknown as ServerResponse,
    );
    expect(res.statusCode).toBe(complete ? 200 : 207);
    expect(JSON.parse(res.end.mock.calls[0][0])).toMatchObject({
      ok: complete,
      failed: complete ? 0 : 1,
      intentionally_ineligible: 1,
      results: [
        { agentId: "private-draft", ok: true, skipped: true },
        { agentId: "eligible", ok: complete, selection_required: !complete },
      ],
    });
  });

  it.each([false, true])("the apply command counts complete=%s truthfully", async (complete) => {
    vi.stubEnv("AGENTMAIL_DEFAULT_DOMAIN", "botbound.app");
    vi.stubEnv("AGENTMAIL_API_KEY", "test-only-provider-key");
    h.provision.mockResolvedValue({
      eligible: true,
      selectionRequired: !complete,
      phone: complete ? "+12025550123" : null,
      email: complete ? "managed@botbound.app" : null,
    });
    const originalArgv = process.argv;
    try {
      process.argv = [...originalArgv, "--apply"];
      vi.resetModules();
      const { main: apply } = await import("../scripts/reconcile-paid-bot-identities.mts");
      await apply();
    } finally {
      process.argv = originalArgv;
    }
    const result = JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]);
    expect(result.repaired).toBe(complete ? 1 : 0);
    expect(result.failures).toEqual(
      complete ? [] : [{ agentId: "eligible", error: expect.stringContaining("Choose a number") }],
    );
    expect(process.exitCode).toBe(complete ? undefined : 1);
    expect(h.provision).toHaveBeenCalledExactlyOnceWith({ userId: "tenant", agentId: "eligible" });
  });
});

describe("paid identity operator dry-run audit", () => {
  it("fails on an entitlement projection error rather than reporting intentional skips", async () => {
    h.roster.mockRejectedValue(new Error("PAID_IDENTITY_ENTITLEMENT_MISMATCH"));
    await expect(main()).rejects.toThrow("PAID_IDENTITY_ENTITLEMENT_MISMATCH");
    expect(console.log).not.toHaveBeenCalled();
    expect(h.provision).not.toHaveBeenCalled();
  });
  it("does not pass a stored phone row whose configured-account ownership is unverified", async () => {
    h.phones = [{ phone: "+12025550123" }];
    h.mailboxes = [{ email: "managed@botbound.app", scopes: "managed" }];
    h.ownership.mockRejectedValue(new Error("Phone is not owned by the configured Twilio account"));
    await main();
    expect(JSON.parse(vi.mocked(console.log).mock.calls[0][0])).toMatchObject({
      complete: 0,
      missingIdentity: 1,
      missing: [{ hasPhone: true, phoneOwnership: "unverified" }],
    });
    expect(h.ownership).toHaveBeenCalledWith("+12025550123");
    expect(process.exitCode).toBe(2);
    expect(h.provision).not.toHaveBeenCalled();
  });
  it("reports intentionally ineligible Bots without a repair failure or provider work", async () => {
    h.eligible = [];
    await main();
    expect(JSON.parse(vi.mocked(console.log).mock.calls[0][0])).toMatchObject({
      mode: "dry-run",
      paidBots: 0,
      intentionallyIneligibleBots: 2,
      missingIdentity: 0,
    });
    expect(process.exitCode).toBeUndefined();
    expect(h.roster).toHaveBeenCalledOnce();
    expect(h.inspected).toEqual([]);
    expect(h.provision).not.toHaveBeenCalled();
  });
  it("still fails for a genuinely eligible Bot with missing identity", async () => {
    await main();
    expect(JSON.parse(vi.mocked(console.log).mock.calls[0][0])).toMatchObject({
      paidBots: 1,
      intentionallyIneligibleBots: 1,
      missingIdentity: 1,
      missing: [{ agentId: "eligible" }],
    });
    expect(process.exitCode).toBe(2);
    expect(h.provision).not.toHaveBeenCalled();
  });
  it("finds a managed mailbox even when an ordinary AgentMail account appears first", async () => {
    h.phones = [{ phone: "+12025550123" }];
    h.mailboxes = [
      { email: "ordinary@example.test", scopes: "ordinary" },
      { email: "managed@botbound.app", scopes: "managed" },
    ];
    await main();
    expect(JSON.parse(vi.mocked(console.log).mock.calls[0][0])).toMatchObject({
      complete: 1,
      missingIdentity: 0,
    });
    expect(process.exitCode).toBeUndefined();
  });
  it("does not count an ordinary connected AgentMail mailbox as managed identity", async () => {
    h.phones = [{ phone: "+12025550123" }];
    h.mailboxes = [{ email: "ordinary@example.test", scopes: "ordinary" }];
    await main();
    expect(JSON.parse(vi.mocked(console.log).mock.calls[0][0])).toMatchObject({
      missingIdentity: 1,
      missing: [{ hasPhone: true, hasManagedEmail: false }],
    });
    expect(process.exitCode).toBe(2);
  });
});
