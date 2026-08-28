import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AGENTMAIL_MANAGED_CREDENTIAL_SENTINEL,
  AgentMailConnectError,
  deleteAgentMailInbox,
  eraseManagedAgentMailInboxesForPurge,
  hasExactAgentMailManagedScope,
  listAgentMailInboxes,
  verifyManagedAgentMailDomainIdentity,
} from "../src/lib/agentmail-mail";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("managed AgentMail lifecycle boundary", () => {
  it("recognizes only the exact BotBound-managed scope token", () => {
    expect(hasExactAgentMailManagedScope("imap managed-botbound webhook")).toBe(true);
    expect(hasExactAgentMailManagedScope("imap managed-botbound-shadow webhook")).toBe(false);
    expect(hasExactAgentMailManagedScope("imap tenant-managed-botbound webhook")).toBe(false);
    expect(hasExactAgentMailManagedScope(null)).toBe(false);
  });

  it("fully paginates inbox inventory beyond ten pages", async () => {
    const request = vi.fn(async (_credential: string, path: string) => {
      const url = new URL(`https://agentmail.test${path}`);
      const token = url.searchParams.get("page_token");
      const page = token ? Number(token.slice(1)) : 0;
      return {
        status: 200,
        body: {
          inboxes: [{ inbox_id: `inbox-${page}`, email: `bot-${page}@botbound.me` }],
          ...(page < 11 ? { next_page_token: `p${page + 1}` } : {}),
        },
      };
    });

    const inboxes = await listAgentMailInboxes("credential", request);

    expect(inboxes).toHaveLength(12);
    expect(inboxes.at(-1)).toEqual({ inboxId: "inbox-11", email: "bot-11@botbound.me" });
    expect(request).toHaveBeenCalledTimes(12);
  });

  it("fails closed on a cyclic or malformed provider inventory", async () => {
    const cyclic = vi.fn(async () => ({
      status: 200,
      body: { inboxes: [], next_page_token: "repeat" },
    }));
    await expect(listAgentMailInboxes("credential", cyclic)).rejects.toThrow(
      "repeated inbox page token",
    );
    expect(cyclic).toHaveBeenCalledTimes(2);

    await expect(
      listAgentMailInboxes("credential", async () => ({ status: 200, body: { inboxes: null } })),
    ).rejects.toThrow("invalid inbox inventory");
  });

  it("URL-encodes inbox ids and treats provider 404 as idempotent success", async () => {
    const request = vi.fn(async () => ({ status: 404, body: null }));
    await expect(deleteAgentMailInbox("credential", "inbox/with spaces", request)).resolves.toBe(
      "already_absent",
    );
    expect(request).toHaveBeenCalledWith("credential", "/inboxes/inbox%2Fwith%20spaces", {
      method: "DELETE",
    });

    await expect(
      deleteAgentMailInbox("credential", "inbox-1", async () => ({ status: 503, body: null })),
    ).rejects.toBeInstanceOf(AgentMailConnectError);
  });

  it("proves the active key owns the exact verified managed domain", async () => {
    vi.stubEnv("AGENTMAIL_DEFAULT_DOMAIN", "@BOTS.BOTBOUND.ME");
    const request = vi.fn(async (_credential: string, path: string) => {
      if (path === "/domains?limit=100") {
        return {
          status: 200,
          body: {
            domains: [{ domain_id: "domain-botbound", domain: "bots.botbound.me" }],
          },
        };
      }
      if (path === "/domains/domain-botbound") {
        return {
          status: 200,
          body: {
            domain_id: "domain-botbound",
            domain: "bots.botbound.me",
            status: "VERIFIED",
          },
        };
      }
      return { status: 404, body: null };
    });

    await expect(
      verifyManagedAgentMailDomainIdentity("credential", request),
    ).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("rejects an empty or unverified domain inventory from the active key", async () => {
    vi.stubEnv("AGENTMAIL_DEFAULT_DOMAIN", "bots.botbound.me");
    await expect(
      verifyManagedAgentMailDomainIdentity("credential", async () => ({
        status: 200,
        body: { domains: [] },
      })),
    ).rejects.toThrow("does not own BotBound's managed domain");

    await expect(
      verifyManagedAgentMailDomainIdentity("credential", async (_credential, path) =>
        path.startsWith("/domains?")
          ? {
              status: 200,
              body: {
                domains: [{ domain_id: "domain-botbound", domain: "bots.botbound.me" }],
              },
            }
          : {
              status: 200,
              body: {
                domain_id: "domain-botbound",
                domain: "bots.botbound.me",
                status: "PENDING",
              },
            },
      ),
    ).rejects.toThrow("is not verified under the active organization");
  });

  it("deletes only exact managed inboxes and never touches BYO AgentMail", async () => {
    const deleteInbox = vi.fn(async () => "deleted" as const);
    const listInboxes = vi.fn(async () => [
      { inboxId: "managed-id", email: "bot@botbound.me" },
      { inboxId: "byo-id", email: "owner@example.com" },
    ]);

    await expect(
      eraseManagedAgentMailInboxesForPurge(
        [
          {
            provider: "agentmail",
            emailAddress: "BOT@BOTBOUND.ME",
            accessToken: "encrypted-managed",
            oauthGrantedScopes: "imap managed-botbound webhook",
          },
          {
            provider: "agentmail",
            emailAddress: "owner@example.com",
            accessToken: "encrypted-byo",
            oauthGrantedScopes: "imap smtp webhook",
          },
          {
            provider: "google",
            emailAddress: "other@example.com",
            accessToken: "encrypted-other",
            oauthGrantedScopes: "managed-botbound",
          },
        ],
        {
          decryptAccessToken: () => AGENTMAIL_MANAGED_CREDENTIAL_SENTINEL,
          verifyManagedDomain: async () => undefined,
          listInboxes,
          deleteInbox,
        },
      ),
    ).resolves.toEqual({ managedAccountsReconciled: 1, inboxesDeleted: 1 });

    expect(listInboxes).toHaveBeenCalledOnce();
    expect(deleteInbox).toHaveBeenCalledOnce();
    expect(deleteInbox).toHaveBeenCalledWith(AGENTMAIL_MANAGED_CREDENTIAL_SENTINEL, "managed-id");
  });

  it("blocks local erasure when managed ownership or provider deletion cannot be proved", async () => {
    const managedAccount = {
      provider: "agentmail",
      emailAddress: "bot@botbound.me",
      accessToken: "encrypted-managed",
      oauthGrantedScopes: "managed-botbound",
    };

    await expect(
      eraseManagedAgentMailInboxesForPurge([managedAccount], {
        decryptAccessToken: () => "tenant-owned-key",
        listInboxes: async () => [],
      }),
    ).rejects.toThrow("does not use the BotBound credential sentinel");

    await expect(
      eraseManagedAgentMailInboxesForPurge([managedAccount], {
        decryptAccessToken: () => AGENTMAIL_MANAGED_CREDENTIAL_SENTINEL,
        verifyManagedDomain: async () => undefined,
        listInboxes: async () => [{ inboxId: "managed-id", email: "bot@botbound.me" }],
        deleteInbox: async () => {
          throw new Error("provider unavailable");
        },
      }),
    ).rejects.toThrow("provider unavailable");
  });

  it("blocks local purge when the active key cannot prove the managed organization", async () => {
    const listInboxes = vi.fn(async () => []);
    await expect(
      eraseManagedAgentMailInboxesForPurge(
        [
          {
            provider: "agentmail",
            emailAddress: "bot@botbound.me",
            accessToken: "encrypted-managed",
            oauthGrantedScopes: "managed-botbound",
          },
        ],
        {
          decryptAccessToken: () => AGENTMAIL_MANAGED_CREDENTIAL_SENTINEL,
          verifyManagedDomain: async () => {
            throw new AgentMailConnectError("wrong organization");
          },
          listInboxes,
        },
      ),
    ).rejects.toThrow("wrong organization");
    expect(listInboxes).not.toHaveBeenCalled();
  });

  it("reserves the exact managed address before provider creation and erases it before local purge", () => {
    const routes = read("src/routes/agentmail-routes.ts");
    const endpoint = routes.slice(
      routes.indexOf('"/api/agents/:agentId/managed-mailbox"'),
      routes.indexOf('"/api/integrations/agentmail/connect"'),
    );
    const reservation = endpoint.indexOf("const connected = await upsertOwnedEmailAccount");
    const providerResolution = endpoint.indexOf(
      "inbox = await resolveManagedBotInbox",
      reservation,
    );
    expect(reservation).toBeGreaterThan(-1);
    expect(providerResolution).toBeGreaterThan(reservation);
    expect(endpoint).toContain("reservedEmailAddress");
    expect(endpoint).toContain("hasExactAgentMailManagedScope");
    expect(endpoint).toContain("runTenantProviderWorkWithDeletionFence");
    expect(endpoint).toContain('operation: "managed_agentmail_mailbox_provision"');
    expect(endpoint.indexOf("runTenantProviderWorkWithDeletionFence")).toBeLessThan(reservation);

    const deletion = read("src/lib/account-deletion.ts");
    const externalRelease = deletion.slice(
      deletion.indexOf("async function releaseExternalResourcesOutsideTenantContext"),
      deletion.indexOf("export async function purgeAccount"),
    );
    expect(externalRelease).toContain("eraseManagedAgentMailInboxesForPurge");
    expect(externalRelease).toContain(
      "managed AgentMail inbox deletion failed, deferring account purge",
    );
    expect(externalRelease.indexOf("eraseManagedAgentMailInboxesForPurge")).toBeLessThan(
      externalRelease.indexOf("revokeAllOAuthGrantsForUser"),
    );
  });
});
