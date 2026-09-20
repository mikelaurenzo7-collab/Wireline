import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  committed: { used: false, hash: "original", version: 2 },
  revoke: vi.fn(),
  tx: {} as object,
}));

vi.mock("../src/db/schema", () => ({
  users: { kind: "user", id: "id", passwordHash: "passwordHash" },
  passwordResetTokens: {
    kind: "reset",
    userId: "userId",
    tokenHash: "tokenHash",
    usedAt: "usedAt",
    expiresAt: "expiresAt",
  },
  subscriptions: { plan: "plan", userId: "userId" },
}));
vi.mock("../src/db/security-schema", () => ({
  sessionUsers: { kind: "session", id: "id", sessionVersion: "sessionVersion" },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  gte: vi.fn(),
  isNull: vi.fn(),
  getTableColumns: vi.fn(),
  sql: vi.fn(),
}));
vi.mock("node:crypto", async (original) => ({
  ...(await original<typeof import("node:crypto")>()),
  scrypt: (_password: string, _salt: string, _size: number, ...rest: unknown[]) => {
    (rest.at(-1) as (error: null, key: Buffer) => void)(null, Buffer.alloc(64, 1));
  },
}));
vi.mock("../src/lib/breached-passwords", () => ({
  assertPasswordIsSafe: async () => ({ checked: true }),
}));
vi.mock("../src/lib/account-service", () => ({
  ensureDefaultAccount: async () => ({ type: "business" }),
}));
vi.mock("../src/lib/mcp-oauth-security", () => ({ revokeAllMcpGrantsForUser: h.revoke }));
vi.mock("../src/lib/server-context", () => ({
  log: { warn: vi.fn(), error: vi.fn() },
  tenantStore: { run: (_id: string, work: () => unknown) => work() },
  drizzle: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ id: "user-1", email: "owner@example.com", plan: "free" }],
        }),
      }),
    }),
    transaction: async (work: (tx: object) => Promise<unknown>) => {
      const pending = { ...h.committed };
      h.tx = {
        update: (table: { kind: string }) => ({
          set: (changes: { passwordHash?: string }) => ({
            where: () => ({
              returning: async () => {
                if (table.kind === "reset") {
                  pending.used = true;
                  return [{ userId: "user-1" }];
                }
                if (table.kind === "user") {
                  pending.hash = changes.passwordHash!;
                  pending.version += 1;
                  return [{ id: "user-1" }];
                }
                pending.version += 1;
                return [{ sessionVersion: pending.version }];
              },
            }),
          }),
        }),
      };
      const result = await work(h.tx);
      h.committed = pending;
      return result;
    },
  },
}));

import { authService } from "../src/lib/auth-service";

beforeEach(() => {
  process.env.INTERNAL_JWT_SECRET = "wireline-test-internal-jwt-secret-minimum-32-chars";
  delete process.env.SUPABASE_JWT_SECRET;
  h.committed = { used: false, hash: "original", version: 2 };
  h.revoke.mockReset().mockResolvedValue(undefined);
});

describe("password reset connector revocation", () => {
  it("rolls back password, session generation and reset-token consumption when grant revocation fails", async () => {
    h.revoke.mockRejectedValue(new Error("Connector revocation unavailable"));
    await expect(authService.completePasswordReset("valid-reset", "new-password")).rejects.toThrow(
      "Connector revocation unavailable",
    );
    expect(h.revoke).toHaveBeenCalledWith("user-1", h.tx);
    expect(h.committed).toEqual({ used: false, hash: "original", version: 2 });
  });

  it("returns the new session only after connector revocation and the password commit", async () => {
    h.revoke.mockImplementation(async () => {
      expect(h.committed.hash).toBe("original");
    });
    const result = await authService.completePasswordReset("valid-reset", "new-password");
    expect(h.revoke).toHaveBeenCalledWith("user-1", h.tx);
    expect(h.committed.used).toBe(true);
    expect(h.committed.hash).not.toBe("original");
    const token = JSON.parse(Buffer.from(result!.token.split(".")[1], "base64url").toString());
    expect(token.session_version).toBe(h.committed.version);
  });
});
