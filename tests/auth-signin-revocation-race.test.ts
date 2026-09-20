import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JwtPayload } from "../src/lib/auth-utils";
import { isSessionGenerationActive } from "../src/lib/session-generation";

const state = vi.hoisted(() => ({
  user: {} as Record<string, unknown>,
  duringKdf: undefined as ((call: number) => void) | undefined,
  kdfCalls: 0,
}));

type Predicate = { column: string; value: unknown } | { all: Predicate[] };

vi.mock("drizzle-orm", () => ({
  eq: (column: string, value: unknown) => ({ column, value }),
  and: (...all: Predicate[]) => ({ all }),
  getTableColumns: (table: Record<string, unknown>) => table,
  gte: vi.fn(),
  isNull: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("../src/db/schema", () => ({
  users: {
    id: "id",
    email: "email",
    fullName: "fullName",
    passwordHash: "passwordHash",
  },
  subscriptions: { plan: "plan", userId: "userId" },
}));

vi.mock("../src/db/security-schema", () => ({
  sessionUsers: { id: "id", sessionVersion: "sessionVersion" },
}));

vi.mock("node:crypto", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:crypto")>()),
  // Control the async KDF boundary without spending 128 MiB per attempt.
  scrypt: (password: string, _salt: string, _size: number, ...rest: unknown[]) => {
    const callback = rest.at(-1) as (error: null, key: Buffer) => void;
    state.duringKdf?.(++state.kdfCalls);
    callback(null, Buffer.alloc(64, password === "old-password" ? 1 : 2));
  },
}));

vi.mock("../src/lib/server-context", () => {
  function matches(predicate: Predicate): boolean {
    return "all" in predicate
      ? predicate.all.every(matches)
      : state.user[predicate.column] === predicate.value;
  }
  return {
    log: { warn: vi.fn(), error: vi.fn() },
    tenantStore: { run: (_id: string, callback: () => unknown) => callback() },
    drizzle: {
      select: (selection?: Record<string, string>) => {
        let table: Record<string, unknown>;
        let predicate: Predicate;
        const query = {
          from: (value: Record<string, unknown>) => {
            table = value;
            return query;
          },
          where: (value: Predicate) => {
            predicate = value;
            return query;
          },
          limit: async () => {
            if ("plan" in table) return [{ plan: "free" }];
            if (!matches(predicate)) return [];
            return [
              selection
                ? Object.fromEntries(
                    Object.entries(selection).map(([key, column]) => [key, state.user[column]]),
                  )
                : { ...state.user },
            ];
          },
        };
        return query;
      },
      update: () => ({
        set: (changes: Record<string, unknown>) => ({
          where: (predicate: Predicate) => ({
            returning: async () => {
              if (!matches(predicate)) return [];
              Object.assign(state.user, changes);
              // Production's password-change trigger also runs on a rehash.
              state.user.sessionVersion = Number(state.user.sessionVersion) + 1;
              return [{ sessionVersion: state.user.sessionVersion }];
            },
          }),
        }),
      }),
    },
  };
});

vi.mock("../src/lib/account-service", () => ({
  ensureDefaultAccount: vi.fn(async () => ({ type: "business" })),
}));

import { authService } from "../src/lib/auth-service";

const originalHash = `${"a".repeat(32)}:${"01".repeat(64)}`;
const resetHash = `scrypt2$${"b".repeat(32)}:${"02".repeat(64)}`;

function resetPassword() {
  state.user.passwordHash = resetHash;
  state.user.sessionVersion = 4;
}

function payloadOf(result: Awaited<ReturnType<typeof authService.signIn>>): JwtPayload {
  expect(result).not.toBeNull();
  return JSON.parse(Buffer.from(result!.token.split(".")[1], "base64url").toString());
}

beforeEach(() => {
  process.env.INTERNAL_JWT_SECRET = "wireline-test-internal-jwt-secret-minimum-32-chars";
  delete process.env.SUPABASE_JWT_SECRET;
  state.user = {
    id: "00000000-0000-4000-8000-000000000001",
    email: "owner@example.com",
    fullName: "Owner",
    passwordHash: `scrypt2$${originalHash}`,
    sessionVersion: 3,
  };
  state.duringKdf = undefined;
  state.kdfCalls = 0;
});

describe("sign-in revocation races", () => {
  it("issues the generation observed with the verified password", async () => {
    const payload = payloadOf(await authService.signIn("owner@example.com", "old-password"));
    expect(payload.session_version).toBe(3);
  });

  it("does not adopt a reset's new generation while verifying the old password", async () => {
    state.duringKdf = resetPassword;
    const payload = payloadOf(await authService.signIn("owner@example.com", "old-password"));
    expect(
      isSessionGenerationActive(payload, {
        sessionVersion: Number(state.user.sessionVersion),
        sessionRevokedBefore: new Date(0),
      }),
    ).toBe(false);
    expect(state.user.passwordHash).toBe(resetHash);
  });

  it("does not adopt a sign-out's new generation during password verification", async () => {
    state.duringKdf = () => {
      state.user.sessionVersion = 4;
    };
    const payload = payloadOf(await authService.signIn("owner@example.com", "old-password"));
    expect(payload.session_version).toBe(3);
  });

  it.each([1, 2])("cannot undo a reset during legacy KDF call %i", async (resetAt) => {
    state.user.passwordHash = originalHash;
    state.duringKdf = (call) => {
      if (call === resetAt) resetPassword();
    };
    const payload = payloadOf(await authService.signIn("owner@example.com", "old-password"));
    expect(state.user.passwordHash).toBe(resetHash);
    expect(payload.session_version).toBe(3);
  });

  it("still upgrades a legacy hash when no password change intervenes", async () => {
    state.user.passwordHash = originalHash;
    const payload = payloadOf(await authService.signIn("owner@example.com", "old-password"));
    expect(state.user.passwordHash).toMatch(/^scrypt2\$/);
    expect(payload.session_version).toBe(4);
    expect(
      isSessionGenerationActive(payload, {
        sessionVersion: Number(state.user.sessionVersion),
        sessionRevokedBefore: new Date(0),
      }),
    ).toBe(true);
  });

  it("cannot adopt a sign-out generation through a legacy rehash", async () => {
    state.user.passwordHash = originalHash;
    state.duringKdf = () => {
      state.user.sessionVersion = 4;
    };
    const payload = payloadOf(await authService.signIn("owner@example.com", "old-password"));
    expect(state.user.passwordHash).toBe(originalHash);
    expect(payload.session_version).toBe(3);
  });

  it("does not issue a session for an incorrect password", async () => {
    expect(await authService.signIn("owner@example.com", "wrong-password")).toBeNull();
  });
});
