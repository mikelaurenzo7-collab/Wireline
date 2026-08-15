import type { NextFunction, Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const NOW_MS = Date.UTC(2030, 0, 2, 12);

const mocks = vi.hoisted(() => ({
  deletionStates: [] as Array<{
    status: string | null;
    scheduledPurgeAt: Date | null;
  }>,
  select: vi.fn(),
  tenantRun: vi.fn((_userId: string, perform: () => unknown) => perform()),
  tenantGetStore: vi.fn(() => undefined as string | undefined),
  verifyInternalJwt: vi.fn(async () => ({
    sub: USER_ID,
    aud: "authenticated",
    role: "authenticated",
    iat: 1_893_499_140,
    exp: 1_893_506_400,
    session_version: 4,
  })),
  log: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("../src/lib/server-context", () => {
  mocks.select.mockImplementation((selection: Record<string, unknown>) => {
    const rows = Object.prototype.hasOwnProperty.call(selection, "email")
      ? [
          {
            id: USER_ID,
            email: "owner@example.com",
            sessionRevokedBefore: new Date(0),
            sessionVersion: 4,
          },
        ]
      : mocks.deletionStates;
    const query = {
      from: vi.fn(),
      where: vi.fn(),
      limit: vi.fn(),
      then: (
        onFulfilled: (value: typeof rows) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => Promise.resolve(rows).then(onFulfilled, onRejected),
    };
    query.from.mockReturnValue(query);
    query.where.mockReturnValue(query);
    query.limit.mockImplementation((limit: number) => Promise.resolve(rows.slice(0, limit)));
    return query;
  });

  return {
    auditLogger: { logAuth: vi.fn().mockResolvedValue(undefined) },
    drizzle: { select: mocks.select },
    log: mocks.log,
    tenantStore: {
      getStore: mocks.tenantGetStore,
      run: mocks.tenantRun,
    },
  };
});

vi.mock("../src/lib/auth-utils", () => ({
  verifyInternalJwt: mocks.verifyInternalJwt,
}));

vi.mock("../src/lib/internal-jwt-secret", () => ({
  requireInternalJwtSecret: vi.fn(() => "test-secret"),
}));

vi.mock("../src/lib/session-cookie", () => ({
  getSessionTokenFromRequest: vi.fn(() => "test-session-token"),
  isProductionRuntime: vi.fn(() => false),
}));

vi.mock("../src/lib/session-generation", () => ({
  isSessionGenerationActive: vi.fn(() => true),
}));

import {
  accountDeletionBlocksAuthentication,
  authenticateEventStream,
  authenticateUser,
} from "../src/middleware/auth";

function requestWithActor(preattached: boolean): Request {
  const req: Record<string, unknown> = {
    body: {},
    headers: {},
    ip: "203.0.113.10",
    path: "/api/private",
    query: {},
    get: vi.fn(() => undefined),
  };
  if (preattached) {
    req.user = { id: USER_ID, tenantId: USER_ID };
  }
  return req as unknown as Request;
}

function responseHarness(): {
  res: Response;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
} {
  const status = vi.fn();
  const json = vi.fn();
  const response = { locals: { requestId: "request-1" }, status, json };
  status.mockReturnValue(response);
  json.mockReturnValue(response);
  return { res: response as unknown as Response, status, json };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW_MS);
  mocks.deletionStates = [];
  mocks.select.mockClear();
  mocks.tenantRun.mockClear();
  mocks.tenantGetStore.mockClear();
  mocks.verifyInternalJwt.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("terminal account deletion authentication gate", () => {
  it("allows only a pending deletion with a strictly future deadline", () => {
    const now = new Date(NOW_MS);

    expect(
      accountDeletionBlocksAuthentication(
        { status: "pending", scheduledPurgeAt: new Date(NOW_MS + 1) },
        now,
      ),
    ).toBe(false);
    expect(
      accountDeletionBlocksAuthentication(
        { status: "pending", scheduledPurgeAt: new Date(NOW_MS) },
        now,
      ),
    ).toBe(true);
    expect(
      accountDeletionBlocksAuthentication(
        { status: "pending", scheduledPurgeAt: new Date(NOW_MS - 1) },
        now,
      ),
    ).toBe(true);
    expect(
      accountDeletionBlocksAuthentication({ status: "pending", scheduledPurgeAt: null }, now),
    ).toBe(true);
    expect(
      accountDeletionBlocksAuthentication(
        { status: "purging", scheduledPurgeAt: new Date(NOW_MS + 86_400_000) },
        now,
      ),
    ).toBe(true);
    expect(
      accountDeletionBlocksAuthentication(
        { status: "cancelled", scheduledPurgeAt: new Date(NOW_MS - 1) },
        now,
      ),
    ).toBe(false);
  });

  describe.each([
    ["ordinary API", authenticateUser],
    ["event stream", authenticateEventStream],
  ] as const)("%s middleware", (_label, middleware) => {
    it.each([
      ["pre-attached actor", true],
      ["verified session", false],
    ] as const)("fails closed for a due deletion on the %s path", async (_path, preattached) => {
      mocks.deletionStates = [{ status: "pending", scheduledPurgeAt: new Date(NOW_MS) }];
      const { res, status, json } = responseHarness();
      const next = vi.fn() as NextFunction;

      await middleware(requestWithActor(preattached), res, next);

      expect(status).toHaveBeenCalledWith(410);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ code: "ACCOUNT_DELETION_IN_PROGRESS" }),
      );
      expect(next).not.toHaveBeenCalled();
      expect(mocks.tenantRun).toHaveBeenCalledWith(USER_ID, expect.any(Function));
    });

    it.each([
      ["pre-attached actor", true],
      ["verified session", false],
    ] as const)("preserves grace-period access on the %s path", async (_path, preattached) => {
      mocks.deletionStates = [{ status: "pending", scheduledPurgeAt: new Date(NOW_MS + 1) }];
      const { res, status } = responseHarness();
      const next = vi.fn() as NextFunction;

      await middleware(requestWithActor(preattached), res, next);

      expect(status).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
    });
  });
});
