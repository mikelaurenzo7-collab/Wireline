import { afterEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.doUnmock("../src/lib/server-context");
  vi.doUnmock("../src/lib/secret-vault");
  vi.doUnmock("../src/lib/account-environment-policy");
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("connector disconnect during token refresh", () => {
  it.each(["apollo", "google_sheets", "microsoft_teams"] as const)(
    "does not resurrect or use a %s credential after disconnection",
    async (provider) => {
      const pendingRefresh = deferred<Response>();
      const refreshStarted = deferred<void>();
      const calls = vi.fn(async () => {
        refreshStarted.resolve();
        return pendingRefresh.promise;
      });
      const dataCall = vi.fn();
      const dialect = new PgDialect();
      let saved: Record<string, unknown> | null = {
        id: "connection-1",
        userId: "owner-1",
        provider,
        active: true,
        accessToken: "old-access",
        refreshToken: "old-refresh",
        expiresAt: new Date(0),
        metadata: {},
      };
      const matches = (predicate: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        if (!saved) return false;
        const query = dialect.sqlToQuery(predicate);
        const params = query.params;
        return (
          (!params.includes("connection-1") || saved.id === "connection-1") &&
          (!params.includes("owner-1") || saved.userId === "owner-1") &&
          (!params.includes(provider) || saved.provider === provider) &&
          (!params.includes(true) || saved.active === true) &&
          (!params.includes("old-access") || saved.accessToken === "old-access") &&
          (!params.includes("old-refresh") || saved.refreshToken === "old-refresh")
        );
      };
      const drizzle = {
        select: () => ({
          from: () => ({
            where: (where: Parameters<PgDialect["sqlToQuery"]>[0]) => ({
              limit: async () => (matches(where) ? [{ ...saved }] : []),
            }),
          }),
        }),
        update: () => ({
          set: (values: Record<string, unknown>) => ({
            where: (where: Parameters<PgDialect["sqlToQuery"]>[0]) => {
              const apply = () => {
                if (!matches(where)) return [];
                saved = { ...saved, ...values };
                return [{ id: "connection-1" }];
              };
              return {
                returning: async () => apply(),
                then: (ok: (value: unknown) => void) => Promise.resolve(apply()).then(ok),
              };
            },
          }),
        }),
        delete: () => ({
          where: async (where: Parameters<PgDialect["sqlToQuery"]>[0]) => {
            if (matches(where)) saved = null;
          },
        }),
      };
      vi.doMock("../src/lib/server-context", () => ({
        drizzle,
        log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
        fetchWithTimeout: calls,
      }));
      vi.doMock("../src/lib/secret-vault", () => ({
        encryptSecret: (value: string) => value,
        decryptSecret: (value: string) => value,
      }));
      vi.doMock("../src/lib/account-environment-policy", () => ({
        liveExternalActionPolicyForUser: vi.fn().mockResolvedValue({ allowed: true }),
        externalEntityActionPolicyForUser: vi.fn().mockResolvedValue({ allowed: true }),
      }));
      vi.stubEnv("APOLLO_API_KEY", "platform-key");
      vi.stubGlobal("fetch", dataCall);

      let action: Promise<unknown>;
      let disconnect: () => Promise<void>;
      if (provider === "apollo") {
        const module = await import("../src/lib/apollo-service");
        action = module.searchLeads({ titles: ["Owner"] }, "owner-1");
        disconnect = () => module.disconnectApollo("owner-1");
      } else if (provider === "google_sheets") {
        const module = await import("../src/lib/google-sheets-service");
        action = module.logToGoogleSheets({
          userId: "owner-1",
          caller: "A",
          outcome: "B",
          details: "C",
        });
        disconnect = () => module.disconnectGoogleSheets("owner-1");
      } else {
        const module = await import("../src/lib/microsoft-graph-service");
        action = module.sendTeamsMessage({ userId: "owner-1", text: "Hello" });
        disconnect = () => module.disconnectMicrosoftGraph("owner-1", "microsoft_teams");
      }
      await refreshStarted.promise;
      await disconnect();
      pendingRefresh.resolve(
        new Response(
          JSON.stringify({
            access_token: "new-access",
            refresh_token: "new-refresh",
            expires_in: 3600,
          }),
          { status: 200 },
        ),
      );
      const result = await action;
      expect(result).toEqual(provider === "apollo" ? [] : false);
      expect(saved === null || (saved.active === false && saved.accessToken === "")).toBe(true);
      expect(calls).toHaveBeenCalledTimes(1);
      expect(dataCall).not.toHaveBeenCalled();
    },
  );
});
