import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACCOUNT_PRIVACY_VERSION,
  ACCOUNT_TERMS_VERSION,
  OAUTH_SIGNUP_CONSENT_REQUIRED,
  type AccountLegalConsentEvidence,
} from "../src/lib/legal-consent";
import { OAUTH_UNVERIFIED_ACCOUNT_COLLISION } from "../src/lib/oauth-public-error";

type UserRow = {
  id: string;
  email: string;
  fullName: string | null;
  emailVerifiedAt: Date | null;
  passwordHash: string | null;
  sessionVersion: number;
  sessionRevokedBefore: Date;
  mcpGranted: boolean;
};
type Predicate = { column: keyof UserRow; value: unknown };
type Projection = Record<string, keyof UserRow>;
const h = vi.hoisted(() => ({
  user: undefined as unknown as UserRow,
  exists: true,
  audit: [] as Array<Record<string, unknown>>,
  locked: false,
  waiters: [] as Array<() => void>,
  update: vi.fn(),
  revoke: vi.fn(),
  trial: vi.fn(),
}));

vi.mock("../src/db/schema", () => ({
  users: {
    kind: "user",
    id: "id",
    email: "email",
    fullName: "fullName",
    emailVerifiedAt: "emailVerifiedAt",
  },
  auditLog: { kind: "audit" },
}));
vi.mock("../src/db/security-schema", () => ({
  sessionUsers: { id: "id", sessionVersion: "sessionVersion" },
}));
vi.mock("drizzle-orm", () => ({
  eq: (column: string, value: unknown) => ({ column, value }),
  lt: vi.fn(),
  sql: vi.fn(),
}));
vi.mock("../src/lib/auth-service", () => ({ generateToken: vi.fn(), isOwnerEmail: () => false }));
vi.mock("../src/lib/founder-bootstrap", () => ({ scheduleFounderBootstrap: vi.fn() }));
vi.mock("../src/lib/google-apis", () => ({ googleApis: vi.fn() }));
vi.mock("../src/lib/yahoo-openid", () => ({ verifyYahooIdToken: vi.fn() }));
vi.mock("../src/lib/oauth-helpers", () => ({
  generateOAuthState: vi.fn(),
  verifyAndClaimOAuthState: vi.fn(),
}));
vi.mock("../src/middleware/rate-limit-middleware", () => ({ oauthRateLimiter: vi.fn() }));
vi.mock("../src/lib/trial-gate", () => ({ startTrialForUser: h.trial }));
vi.mock("../src/lib/mcp-oauth-security", () => ({ revokeAllMcpGrantsForUser: h.revoke }));
vi.mock("../src/lib/server-context", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  drizzle: {
    async transaction(work: (tx: unknown) => Promise<unknown>) {
      let ownsLock = false;
      let pending: UserRow | undefined;
      const pendingAudit: Array<Record<string, unknown>> = [];
      const lock = async () => {
        if (ownsLock) return;
        if (h.locked) await new Promise<void>((ready) => h.waiters.push(ready));
        else h.locked = true;
        ownsLock = true;
      };
      const current = () => pending ?? h.user;
      const project = (row: UserRow, projection: Projection) =>
        Object.fromEntries(Object.entries(projection).map(([key, column]) => [key, row[column]]));
      const tx = {
        insert: (table: { kind: string }) => ({
          values: (values: Record<string, unknown>) => {
            if (table.kind === "audit") {
              pendingAudit.push(values);
              return Promise.resolve();
            }
            return {
              onConflictDoNothing: () => ({
                returning: async (projection: Projection) => {
                  if (h.exists) return [];
                  pending = {
                    id: "account-new",
                    email: values.email as string,
                    fullName: values.fullName as string | null,
                    emailVerifiedAt: values.emailVerifiedAt as Date,
                    passwordHash: null,
                    sessionVersion: 0,
                    sessionRevokedBefore: new Date(0),
                    mcpGranted: false,
                  };
                  return [project(pending, projection)];
                },
              }),
            };
          },
        }),
        select: (projection: Projection) => {
          let predicate: Predicate;
          let forUpdate = false;
          const query = {
            from: () => query,
            where: (value: Predicate) => {
              predicate = value;
              return query;
            },
            limit: () => query,
            for: () => {
              forUpdate = true;
              return query;
            },
            then: async (resolve: (rows: unknown[]) => unknown) => {
              if (forUpdate) await lock();
              const row = current();
              return resolve(
                (h.exists || pending) && row[predicate.column] === predicate.value
                  ? [project(row, projection)]
                  : [],
              );
            },
          };
          return query;
        },
        update: () => {
          h.update();
          return {
            set: (patch: Record<string, unknown>) => ({
              where: async (predicate: Predicate) => {
                await lock();
                const row = current();
                if (row[predicate.column] === predicate.value)
                  pending = { ...row, ...patch } as UserRow;
              },
            }),
          };
        },
      };
      try {
        const result = await work(tx);
        if (pending) {
          h.user = pending;
          h.exists = true;
        }
        h.audit.push(...pendingAudit);
        return result;
      } finally {
        if (ownsLock) {
          const next = h.waiters.shift();
          if (next) next();
          else h.locked = false;
        }
      }
    },
  },
}));

import { findOrCreateUserByEmail } from "../src/routes/auth-oauth-routes";

const consent: AccountLegalConsentEvidence = {
  termsVersion: ACCOUNT_TERMS_VERSION,
  privacyVersion: ACCOUNT_PRIVACY_VERSION,
  source: "oauth_google",
};

beforeEach(() => {
  h.user = {
    id: "account-a",
    email: "owner@example.test",
    fullName: null,
    emailVerifiedAt: null,
    passwordHash: "unverified-password-hash",
    sessionVersion: 4,
    sessionRevokedBefore: new Date(0),
    mcpGranted: true,
  };
  h.exists = true;
  h.audit = [];
  h.locked = false;
  h.waiters = [];
  h.update.mockReset();
  h.trial.mockReset().mockResolvedValue(undefined);
  h.revoke.mockReset();
});

describe("OAuth account collisions and signup", () => {
  it.each(["unverified-password-hash", null])(
    "rejects an unverified collision without changing account data or credentials (password: %s)",
    async (passwordHash) => {
      h.user.passwordHash = passwordHash;
      const original = { ...h.user };

      await expect(
        findOrCreateUserByEmail("owner@example.test", "Verified Owner", consent),
      ).rejects.toThrow(OAUTH_UNVERIFIED_ACCOUNT_COLLISION);

      expect(h.user).toEqual(original);
      expect(h.update).not.toHaveBeenCalled();
      expect(h.trial).not.toHaveBeenCalled();
      expect(h.revoke).not.toHaveBeenCalled();
      expect(h.audit).toEqual([]);
    },
  );

  it("allows an already-verified account while preserving its password and existing credentials", async () => {
    h.user.emailVerifiedAt = new Date("2026-09-01T00:00:00Z");
    const original = { ...h.user };

    const result = await findOrCreateUserByEmail("owner@example.test", "Verified Owner");

    expect(result).toEqual({
      user: { id: "account-a", email: "owner@example.test", fullName: "Verified Owner" },
      isNewUser: false,
    });
    expect(h.user).toMatchObject({ ...original, fullName: "Verified Owner" });
    expect(h.trial).toHaveBeenCalledExactlyOnceWith("account-a", {}, expect.any(Object));
    expect(h.revoke).not.toHaveBeenCalled();
    expect(h.audit).toEqual([]);
  });

  it("rejects simultaneous unverified collisions without either callback activating the account", async () => {
    const original = { ...h.user };
    const results = await Promise.allSettled([
      findOrCreateUserByEmail("owner@example.test", "Verified Owner", consent),
      findOrCreateUserByEmail("owner@example.test", "Verified Owner", consent),
    ]);

    for (const result of results) {
      expect(result.status).toBe("rejected");
      if (result.status === "rejected")
        expect(result.reason.message).toBe(OAUTH_UNVERIFIED_ACCOUNT_COLLISION);
    }
    expect(h.user).toEqual(original);
    expect(h.update).not.toHaveBeenCalled();
    expect(h.trial).not.toHaveBeenCalled();
    expect(h.revoke).not.toHaveBeenCalled();
    expect(h.audit).toEqual([]);
  });

  it("creates a verified new OAuth account with transactional consent and activation", async () => {
    h.exists = false;

    const result = await findOrCreateUserByEmail(" NEW@Example.Test ", "New Owner", consent);

    expect(result).toEqual({
      user: { id: "account-new", email: "new@example.test", fullName: "New Owner" },
      isNewUser: true,
    });
    expect(h.exists).toBe(true);
    expect(h.user.emailVerifiedAt).toBeInstanceOf(Date);
    expect(h.user.passwordHash).toBeNull();
    expect(h.audit).toEqual([
      expect.objectContaining({
        userId: "account-new",
        eventType: "auth.terms_accepted",
        metadata: expect.objectContaining({
          terms_version: ACCOUNT_TERMS_VERSION,
          privacy_version: ACCOUNT_PRIVACY_VERSION,
          source: "oauth_google",
        }),
      }),
    ]);
    expect(h.trial).toHaveBeenCalledExactlyOnceWith("account-new", {}, expect.any(Object));
    expect(h.revoke).not.toHaveBeenCalled();
  });

  it("rolls new-account creation back when consent is absent", async () => {
    h.exists = false;

    await expect(findOrCreateUserByEmail("new@example.test", "New Owner")).rejects.toThrow(
      OAUTH_SIGNUP_CONSENT_REQUIRED,
    );

    expect(h.exists).toBe(false);
    expect(h.audit).toEqual([]);
    expect(h.trial).not.toHaveBeenCalled();
  });

  it("rolls new-account creation and consent back when activation fails", async () => {
    h.exists = false;
    h.trial.mockRejectedValueOnce(new Error("activation unavailable"));

    await expect(findOrCreateUserByEmail("new@example.test", "New Owner", consent)).rejects.toThrow(
      "activation unavailable",
    );

    expect(h.exists).toBe(false);
    expect(h.audit).toEqual([]);
  });
});
