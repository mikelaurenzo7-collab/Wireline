import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    users: new Map<string, any>(),
    passwordResetTokens: new Map<string, any>(),
    emailVerificationTokens: new Map<string, any>(),
    randomCounter: 0,
  };

  const schema = {
    users: {
      __name: "users",
      id: "users.id",
      email: "users.email",
      passwordHash: "users.passwordHash",
      fullName: "users.fullName",
      emailVerifiedAt: "users.emailVerifiedAt",
      updatedAt: "users.updatedAt",
    },
    passwordResetTokens: {
      __name: "passwordResetTokens",
      id: "passwordResetTokens.id",
      userId: "passwordResetTokens.userId",
      tokenHash: "passwordResetTokens.tokenHash",
      expiresAt: "passwordResetTokens.expiresAt",
      usedAt: "passwordResetTokens.usedAt",
      requestedIp: "passwordResetTokens.requestedIp",
    },
    emailVerificationTokens: {
      __name: "emailVerificationTokens",
      id: "emailVerificationTokens.id",
      userId: "emailVerificationTokens.userId",
      tokenHash: "emailVerificationTokens.tokenHash",
      expiresAt: "emailVerificationTokens.expiresAt",
      usedAt: "emailVerificationTokens.usedAt",
    },
  };

  function findEqValue(condition: any, left: string): unknown {
    if (!condition) return undefined;
    if (condition.op === "eq") return condition.left === left ? condition.right : undefined;
    if (condition.op === "and") {
      for (const child of condition.conditions) {
        const value = findEqValue(child, left);
        if (value !== undefined) return value;
      }
    }
    return undefined;
  }

  function matchesCondition(condition: any, row: Record<string, any>): boolean {
    if (!condition) return true;
    if (condition.op === "eq") return row[condition.left] === condition.right;
    if (condition.op === "gte") return row[condition.left] >= condition.right;
    if (condition.op === "isNull") return row[condition.left] == null;
    if (condition.op === "and")
      return condition.conditions.every((child: any) => matchesCondition(child, row));
    return true;
  }

  function project(shape: Record<string, string> | undefined, row: Record<string, any>) {
    if (!shape) return row;
    return Object.fromEntries(Object.entries(shape).map(([key, column]) => [key, row[column]]));
  }

  function hydrateUserColumns(user: Record<string, any>) {
    return {
      [schema.users.id]: user.id,
      [schema.users.email]: user.email,
      [schema.users.passwordHash]: user.passwordHash,
      [schema.users.fullName]: user.fullName,
      [schema.users.emailVerifiedAt]: user.emailVerifiedAt ?? null,
      [schema.users.updatedAt]: user.updatedAt ?? null,
    };
  }

  function hydrateResetColumns(token: Record<string, any>) {
    return {
      [schema.passwordResetTokens.id]: token.id,
      [schema.passwordResetTokens.userId]: token.userId,
      [schema.passwordResetTokens.tokenHash]: token.tokenHash,
      [schema.passwordResetTokens.expiresAt]: token.expiresAt,
      [schema.passwordResetTokens.usedAt]: token.usedAt,
    };
  }

  function hydrateEmailVerificationColumns(token: Record<string, any>) {
    return {
      [schema.emailVerificationTokens.id]: token.id,
      [schema.emailVerificationTokens.userId]: token.userId,
      [schema.emailVerificationTokens.tokenHash]: token.tokenHash,
      [schema.emailVerificationTokens.expiresAt]: token.expiresAt,
      [schema.emailVerificationTokens.usedAt]: token.usedAt,
    };
  }

  function createSelectBuilder(shape?: Record<string, string>) {
    let fromTable: { __name: string } | undefined;
    let whereCondition: any;

    const resolve = () => {
      if (fromTable?.__name === "users") {
        return [...state.users.values()]
          .map((row) => ({ raw: row, columns: hydrateUserColumns(row) }))
          .filter((row) => matchesCondition(whereCondition, row.columns))
          .map((row) => (shape ? project(shape, row.columns) : row.raw));
      }
      if (fromTable?.__name === "passwordResetTokens") {
        return [...state.passwordResetTokens.values()]
          .map((row) => ({ raw: row, columns: hydrateResetColumns(row) }))
          .filter((row) => matchesCondition(whereCondition, row.columns))
          .map((row) => (shape ? project(shape, row.columns) : row.raw));
      }
      if (fromTable?.__name === "emailVerificationTokens") {
        return [...state.emailVerificationTokens.values()]
          .map((row) => ({ raw: row, columns: hydrateEmailVerificationColumns(row) }))
          .filter((row) => matchesCondition(whereCondition, row.columns))
          .map((row) => (shape ? project(shape, row.columns) : row.raw));
      }
      return [];
    };

    return {
      from(table: { __name: string }) {
        fromTable = table;
        return this;
      },
      where(condition: any) {
        whereCondition = condition;
        return this;
      },
      limit(count: number) {
        return Promise.resolve(resolve().slice(0, count));
      },
    };
  }

  const drizzle = {
    select: vi.fn((shape?: Record<string, string>) => createSelectBuilder(shape)),
    insert: vi.fn((table: { __name: string }) => ({
      values(values: Record<string, any>) {
        if (table.__name === "users") {
          const user = {
            id: values.id ?? `user-${state.users.size + 1}`,
            email: values.email,
            passwordHash: values.passwordHash ?? null,
            fullName: values.fullName ?? null,
            emailVerifiedAt: values.emailVerifiedAt ?? null,
            updatedAt: values.updatedAt ?? null,
          };
          state.users.set(user.id, user);
          return {
            returning() {
              return Promise.resolve([user]);
            },
          };
        }
        if (table.__name === "passwordResetTokens") {
          const row = {
            id: values.id ?? `prt-${state.passwordResetTokens.size + 1}`,
            userId: values.userId,
            tokenHash: values.tokenHash,
            expiresAt: values.expiresAt,
            usedAt: values.usedAt ?? null,
            requestedIp: values.requestedIp ?? null,
          };
          state.passwordResetTokens.set(row.id, row);
          return Promise.resolve();
        }
        if (table.__name === "emailVerificationTokens") {
          const row = {
            id: values.id ?? `evt-${state.emailVerificationTokens.size + 1}`,
            userId: values.userId,
            tokenHash: values.tokenHash,
            expiresAt: values.expiresAt,
            usedAt: values.usedAt ?? null,
          };
          state.emailVerificationTokens.set(row.id, row);
          return Promise.resolve();
        }
        return Promise.resolve();
      },
    })),
    update: vi.fn((table: { __name: string }) => ({
      set(values: Record<string, any>) {
        return {
          where(condition: any) {
            if (table.__name === "users") {
              const userId = String(findEqValue(condition, schema.users.id));
              const current = state.users.get(userId);
              if (current) state.users.set(userId, { ...current, ...values });
            }
            if (table.__name === "passwordResetTokens") {
              const tokenId = String(findEqValue(condition, schema.passwordResetTokens.id));
              const current = state.passwordResetTokens.get(tokenId);
              if (current) state.passwordResetTokens.set(tokenId, { ...current, ...values });
            }
            if (table.__name === "emailVerificationTokens") {
              const tokenId = String(findEqValue(condition, schema.emailVerificationTokens.id));
              const current = state.emailVerificationTokens.get(tokenId);
              if (current) state.emailVerificationTokens.set(tokenId, { ...current, ...values });
            }
            return Promise.resolve();
          },
        };
      },
    })),
    transaction: vi.fn(async (callback: (tx: any) => Promise<unknown>) => callback(drizzle)),
  };

  return {
    state,
    schema,
    drizzle,
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    auditLogger: {
      logAuth: vi.fn().mockResolvedValue(undefined),
      logBilling: vi.fn().mockResolvedValue(undefined),
    },
    sendPasswordResetEmail: vi.fn(async () => ({ ok: true, provider: "test" })),
    sendEmailVerification: vi.fn(async () => ({ ok: true, provider: "test" })),
    requireInternalJwtSecret: vi.fn(() => "super-secret-jwt-key-that-is-long-enough"),
    verifySupabaseJwt: vi.fn(async (token: string) =>
      token === "valid-session-token"
        ? {
            sub: "user-1",
            email: "person@example.com",
            aud: "authenticated",
            role: "authenticated",
            iat: Math.floor(Date.now() / 1000),
          }
        : null,
    ),
  };
});

vi.mock("../db/schema", () => h.schema);
vi.mock("drizzle-orm", () => ({
  eq: (left: string, right: unknown) => ({ op: "eq", left, right }),
  and: (...conditions: any[]) => ({ op: "and", conditions }),
  gte: (left: string, right: unknown) => ({ op: "gte", left, right }),
  isNull: (left: string) => ({ op: "isNull", left }),
}));
vi.mock("node:crypto", async () => {
  const actual = await vi.importActual<typeof import("node:crypto")>("node:crypto");
  return {
    ...actual,
    randomBytes: vi.fn((size: number) => {
      h.state.randomCounter += 1;
      return Buffer.alloc(size, h.state.randomCounter);
    }),
    scryptSync: vi.fn((password: string, salt: string, keylen: number) =>
      Buffer.from(`${password}:${salt}`.padEnd(keylen, "#")).subarray(0, keylen),
    ),
  };
});
vi.mock("../lib/server-context", () => ({
  drizzle: h.drizzle,
  log: h.log,
  auditLogger: h.auditLogger,
}));
vi.mock("../middleware/rate-limit-middleware", () => {
  const passThrough = (_req: any, _res: any, next: any) => next();
  return {
    signinRateLimiter: passThrough,
    signupRateLimiter: passThrough,
    forgotPasswordRateLimiter: passThrough,
    resendVerificationRateLimiter: passThrough,
  };
});
vi.mock("../lib/email-service", () => ({
  sendPasswordResetEmail: h.sendPasswordResetEmail,
  sendEmailVerification: h.sendEmailVerification,
}));
vi.mock("../lib/trial-gate", () => ({ startTrialForUser: vi.fn(async () => undefined) }));
vi.mock("../lib/internal-jwt-secret", () => ({
  requireInternalJwtSecret: h.requireInternalJwtSecret,
}));
vi.mock("../lib/auth-utils", () => ({ verifySupabaseJwt: h.verifySupabaseJwt }));

import authRouter from "./auth-routes";

function deriveHash(password: string, salt: string) {
  return Buffer.from(`${password}:${salt}`.padEnd(64, "#")).subarray(0, 64).toString("hex");
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(authRouter);
  return app;
}

describe("auth routes integration", () => {
  beforeEach(() => {
    h.state.users = new Map();
    h.state.passwordResetTokens = new Map();
    h.state.emailVerificationTokens = new Map();
    h.state.randomCounter = 0;
    process.env.APP_URL = "https://wireline.test";

    vi.clearAllMocks();
    h.requireInternalJwtSecret.mockReturnValue("super-secret-jwt-key-that-is-long-enough");
    h.verifySupabaseJwt.mockImplementation(async (token: string) =>
      token === "valid-session-token"
        ? {
            sub: "user-1",
            email: "person@example.com",
            aud: "authenticated",
            role: "authenticated",
            iat: Math.floor(Date.now() / 1000),
          }
        : null,
    );

    h.state.users.set("user-1", {
      id: "user-1",
      email: "person@example.com",
      passwordHash: `salt1:${deriveHash("correct-password", "salt1")}`,
      fullName: "Pat Person",
      emailVerifiedAt: null,
      updatedAt: null,
    });
  });

  it("signs in with valid credentials and returns a JWT", async () => {
    const response = await request(buildApp()).post("/api/auth/signin").send({
      email: "person@example.com",
      password: "correct-password",
    });

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual(
      expect.objectContaining({
        id: "user-1",
        email: "person@example.com",
        full_name: "Pat Person",
      }),
    );
    expect(response.body.token).toMatch(/^[^.]+\.[^.]+\.[^.]+$/);
  });

  it("rejects bad passwords with 401", async () => {
    const response = await request(buildApp()).post("/api/auth/signin").send({
      email: "person@example.com",
      password: "wrong-password",
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Invalid email or password" });
  });

  it("returns 409 for signup when the email already exists", async () => {
    const response = await request(buildApp()).post("/api/auth/signup").send({
      email: "person@example.com",
      password: "New-password-123",
      fullName: "Pat Person",
    });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: "An account with this email already exists. Try signing in instead.",
      code: "EMAIL_TAKEN",
    });
  });

  it("refreshes a valid authenticated session with a new JWT", async () => {
    const response = await request(buildApp())
      .post("/api/auth/refresh")
      .set("Authorization", ["Bearer", "valid-session-token"].join(" "));

    expect(response.status).toBe(200);
    expect(response.body.token).toMatch(/^[^.]+\.[^.]+\.[^.]+$/);
    expect(h.verifySupabaseJwt).toHaveBeenCalledWith(
      "valid-session-token",
      "super-secret-jwt-key-that-is-long-enough",
    );
  });

  it("issues a password reset and then completes it", async () => {
    const app = buildApp();

    const requestReset = await request(app).post("/api/auth/forgot-password").send({
      email: "person@example.com",
    });

    expect(requestReset.status).toBe(200);
    expect(requestReset.body.ok).toBe(true);
    expect(h.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    const [{ resetUrl }] = h.sendPasswordResetEmail.mock.calls[0] as [{ resetUrl: string }];
    const token = new URL(resetUrl).searchParams.get("token");

    expect(token).toBeTruthy();
    expect(h.state.passwordResetTokens.size).toBe(1);

    const completeReset = await request(app).post("/api/auth/reset-password").send({
      token,
      new_password: "New-password-123",
    });

    expect(completeReset.status).toBe(200);
    expect(completeReset.body.user).toEqual(
      expect.objectContaining({ id: "user-1", email: "person@example.com" }),
    );
    expect(completeReset.body.token).toMatch(/^[^.]+\.[^.]+\.[^.]+$/);
    expect([...h.state.passwordResetTokens.values()][0]?.usedAt).toBeInstanceOf(Date);
    expect(h.state.users.get("user-1")?.passwordHash).not.toBe(
      `salt1:${deriveHash("correct-password", "salt1")}`,
    );
  });
});
