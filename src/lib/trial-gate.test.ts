// trial-gate tests — locks down the billing gate that converts free
// signups into paying tenants. Every regression here directly
// affects revenue:
//   - If 402 stops firing → tenants use the product forever for free.
//   - If 402 fires too eagerly → paying tenants get locked out and churn.
//   - If the counter mis-increments → tenants exhaust their trial in
//     half the time and feel cheated.
//
// Heavy on mocking because the middleware touches the DB. We mock
// server-context (drizzle + log) and assert the chains the
// middleware calls.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";

// ────────────────────────────────────────────────────────────────────
//  drizzle / log mocks
//
//  The mock chain has to support the call patterns the middleware uses:
//
//    drizzle.select({...}).from(table).where(...).limit(1)   → [row?]
//    drizzle.select({n: ...}).from(agents).where(...)         → [{n: number}]
//    drizzle.update(settings).set({...}).where(...)           → { rowCount }
//    drizzle.insert(settings).values({...}).onConflictDoNothing()
//
//  Each test rebinds the terminal `then` of each chain to a deterministic
//  value so we don't share state across tests.
// ────────────────────────────────────────────────────────────────────

type AnyFn = (...args: any[]) => any;
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

// Fixtures:
//   selectQueue        — FIFO of result arrays. Each `.limit(N)` chain
//                        pops the head. Tests describe multi-select
//                        flows (e.g. isEmailVerified → getTrialState)
//                        explicitly so order matters.
//   selectRows         — legacy single-value fallback used when the
//                        queue is empty (backward-compat with the
//                        original test bodies).
//   agentCountRow      — first row for the `.select({n: ...})` aggregate.
//   updateRowCount     — `.update(...).set(...).where(...)` result.
const fixtures: {
  selectQueue: any[][];
  selectRows: any[];
  agentCountRow: { n: number } | null;
  updateRowCount: number;
  insertThrow: Error | null;
} = {
  selectQueue: [],
  selectRows: [],
  agentCountRow: { n: 0 },
  updateRowCount: 0,
  insertThrow: null,
};

function buildSelectChain() {
  const selectCalls: any[] = [];
  const popOrFallback = () =>
    fixtures.selectQueue.length > 0 ? fixtures.selectQueue.shift()! : fixtures.selectRows;
  const chain = {
    from: (_t: any) => chain,
    where: (_w: any) => chain,
    limit: (_n: number) => popOrFallback(),
    then: (onFulfilled: AnyFn) => {
      const last = selectCalls[selectCalls.length - 1];
      const isCountQuery = last && typeof last === "object" && "n" in last;
      const value = isCountQuery
        ? fixtures.agentCountRow
          ? [fixtures.agentCountRow]
          : []
        : popOrFallback();
      return Promise.resolve(value).then(onFulfilled);
    },
  };
  return { chain, selectCalls };
}

const drizzle = {
  select: vi.fn((shape?: any) => {
    const { chain, selectCalls } = buildSelectChain();
    selectCalls.push(shape);
    return chain;
  }),
  update: vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve({ rowCount: fixtures.updateRowCount })),
    })),
  })),
  insert: vi.fn(() => ({
    values: vi.fn(() => ({
      onConflictDoNothing: vi.fn(() =>
        fixtures.insertThrow ? Promise.reject(fixtures.insertThrow) : Promise.resolve(),
      ),
    })),
  })),
  execute: vi.fn(),
};

vi.mock("./server-context", () => ({
  drizzle,
  log,
}));

// Schema is referenced but never inspected by trial-gate.ts beyond
// passing table objects to drizzle. Stub with the minimum shape
// drizzle's eq() helper needs to not throw.
vi.mock("../db/schema", () => ({
  settings: {
    userId: "settings.userId",
    subscriptionStatus: "settings.subscriptionStatus",
    trialEndsAt: "settings.trialEndsAt",
    trialOutboundCount: "settings.trialOutboundCount",
  },
  agents: {
    userId: "agents.userId",
  },
  users: {
    id: "users.id",
    emailVerifiedAt: "users.emailVerifiedAt",
  },
}));

/**
 * Helper to assemble the multi-row fixture sequence the middleware
 * needs. trial-gate.ts now performs TWO selects per request:
 *   1. isEmailVerified  → users.emailVerifiedAt
 *   2. getTrialState    → settings row
 * Tests describe both rows so we can exercise EMAIL_UNVERIFIED and
 * status branches independently. Default: verified + active.
 */
function setUserState(opts: { verified?: boolean; settingsRow?: any; agentCount?: number }) {
  const now = new Date();
  fixtures.selectQueue = [
    // 1. isEmailVerified
    opts.verified === false ? [] : [{ verifiedAt: now }],
    // 2. getTrialState
    opts.settingsRow ? [opts.settingsRow] : [],
  ];
  if (typeof opts.agentCount === "number") {
    fixtures.agentCountRow = { n: opts.agentCount };
  }
}

// Lazy import AFTER mocks are in place.
const trialGate = await import("./trial-gate");

beforeEach(() => {
  log.info.mockClear();
  log.warn.mockClear();
  log.error.mockClear();
  drizzle.select.mockClear();
  drizzle.update.mockClear();
  drizzle.insert.mockClear();
  fixtures.selectQueue = [];
  fixtures.selectRows = [];
  fixtures.agentCountRow = { n: 0 };
  fixtures.updateRowCount = 0;
  fixtures.insertThrow = null;
  // Default for ALL existing tests that only know about trial state:
  // primed as "email verified" so the new email-gate check passes
  // and the trial-specific branches under test still fire.
  fixtures.selectQueue = [[{ verifiedAt: new Date() }]];
});

function mockResAndNext() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;
  return { res, next };
}

function reqWithUser(id: string | null = "user-1"): Request {
  return { user: id ? { id } : undefined } as any;
}

// ────────────────────────────────────────────────────────────────────
//  Constants pin the operator contract — if any of these change, the
//  marketing copy on /pricing has to change too.
// ────────────────────────────────────────────────────────────────────
describe("trial-gate — exported constants", () => {
  it("trial is 14 days, 1 agent, 25 outbound dials", () => {
    expect(trialGate.TRIAL_DAYS).toBe(14);
    expect(trialGate.TRIAL_MAX_AGENTS).toBe(1);
    expect(trialGate.TRIAL_MAX_OUTBOUND).toBe(25);
  });
});

// ────────────────────────────────────────────────────────────────────
//  startTrialForUser
// ────────────────────────────────────────────────────────────────────
describe("startTrialForUser", () => {
  it("inserts a settings row with subscription_status='trialing' and a 14-day clock", async () => {
    const values = vi.fn(() => ({ onConflictDoNothing: vi.fn(() => Promise.resolve()) }));
    drizzle.insert.mockImplementationOnce(() => ({ values }) as any);

    const before = Date.now();
    await trialGate.startTrialForUser("user-1");
    const after = Date.now();

    expect(drizzle.insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledTimes(1);

    const args = (values.mock.calls[0] as any)[0];
    expect(args.subscriptionStatus).toBe("trialing");
    expect(args.id).toBe("user-1");
    expect(args.userId).toBe("user-1");
    expect(args.trialOutboundCount).toBe(0);
    const endsAtMs = (args.trialEndsAt as Date).getTime();
    const expectedMin = before + 14 * 86_400_000 - 1000;
    const expectedMax = after + 14 * 86_400_000 + 1000;
    expect(endsAtMs).toBeGreaterThanOrEqual(expectedMin);
    expect(endsAtMs).toBeLessThanOrEqual(expectedMax);
  });

  it("does not throw when the insert rejects (e.g. row already exists)", async () => {
    fixtures.insertThrow = new Error("unique violation");
    await expect(trialGate.startTrialForUser("user-1")).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith(
      "startTrialForUser failed (continuing)",
      expect.objectContaining({ userId: "user-1" }),
    );
  });
});

// ────────────────────────────────────────────────────────────────────
//  enforceTrialAgentCap
//
//  Each test sets fixtures.selectRows to the settings row that
//  getTrialState would see, then asserts the middleware's behavior.
// ────────────────────────────────────────────────────────────────────
describe("enforceTrialAgentCap", () => {
  it("calls next() when no userId is on the request (unauthenticated route)", async () => {
    const { res, next } = mockResAndNext();
    await trialGate.enforceTrialAgentCap(reqWithUser(null), res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("grandfathers legacy tenants with no settings row (treated as active)", async () => {
    fixtures.selectRows = []; // no row found
    fixtures.agentCountRow = { n: 5 }; // even with 5 agents, no gate
    const { res, next } = mockResAndNext();
    await trialGate.enforceTrialAgentCap(reqWithUser("user-1"), res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("calls next() for an active subscription regardless of agent count", async () => {
    fixtures.selectRows = [{ status: "active", trialEndsAt: null, trialOutboundCount: 0 }];
    fixtures.agentCountRow = { n: 7 };
    const { res, next } = mockResAndNext();
    await trialGate.enforceTrialAgentCap(reqWithUser("user-1"), res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 402 TRIAL_LIMIT_HIT when in trial and already at cap (1 agent)", async () => {
    const future = new Date(Date.now() + 5 * 86_400_000);
    fixtures.selectRows = [{ status: "trialing", trialEndsAt: future, trialOutboundCount: 0 }];
    fixtures.agentCountRow = { n: 1 };
    const { res, next } = mockResAndNext();
    await trialGate.enforceTrialAgentCap(reqWithUser("user-1"), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(402);
    const body = (res.json as any).mock.calls[0][0];
    expect(body.code).toBe("TRIAL_LIMIT_HIT");
    expect(body.limit).toBe(1);
    expect(body.current).toBe(1);
    expect(typeof body.days_left).toBe("number");
  });

  it("calls next() when in trial and BELOW the agent cap", async () => {
    const future = new Date(Date.now() + 10 * 86_400_000);
    fixtures.selectRows = [{ status: "trialing", trialEndsAt: future, trialOutboundCount: 0 }];
    fixtures.agentCountRow = { n: 0 };
    const { res, next } = mockResAndNext();
    await trialGate.enforceTrialAgentCap(reqWithUser("user-1"), res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 402 TRIAL_EXPIRED when the trial has aged out (lazy expiry)", async () => {
    const past = new Date(Date.now() - 86_400_000);
    fixtures.selectRows = [{ status: "trialing", trialEndsAt: past, trialOutboundCount: 0 }];
    const { res, next } = mockResAndNext();
    await trialGate.enforceTrialAgentCap(reqWithUser("user-1"), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(402);
    expect((res.json as any).mock.calls[0][0].code).toBe("TRIAL_EXPIRED");
  });

  it("returns 402 SUBSCRIPTION_REQUIRED on past_due", async () => {
    fixtures.selectRows = [{ status: "past_due", trialEndsAt: null, trialOutboundCount: 0 }];
    const { res, next } = mockResAndNext();
    await trialGate.enforceTrialAgentCap(reqWithUser("user-1"), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(402);
    expect((res.json as any).mock.calls[0][0].code).toBe("SUBSCRIPTION_REQUIRED");
  });
});

// ────────────────────────────────────────────────────────────────────
//  enforceTrialOutboundCap
// ────────────────────────────────────────────────────────────────────
describe("enforceTrialOutboundCap", () => {
  it("calls next() for active subscription and does NOT increment the counter", async () => {
    fixtures.selectRows = [{ status: "active", trialEndsAt: null, trialOutboundCount: 0 }];
    const { res, next } = mockResAndNext();
    await trialGate.enforceTrialOutboundCap(reqWithUser("user-1"), res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(drizzle.update).not.toHaveBeenCalled();
  });

  it("increments the counter and calls next() while in trial below cap", async () => {
    const future = new Date(Date.now() + 5 * 86_400_000);
    fixtures.selectRows = [{ status: "trialing", trialEndsAt: future, trialOutboundCount: 7 }];
    const { res, next } = mockResAndNext();
    await trialGate.enforceTrialOutboundCap(reqWithUser("user-1"), res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(drizzle.update).toHaveBeenCalledTimes(1);
  });

  it("returns 402 TRIAL_LIMIT_HIT at exactly the 25-call cap and does NOT increment", async () => {
    const future = new Date(Date.now() + 5 * 86_400_000);
    fixtures.selectRows = [{ status: "trialing", trialEndsAt: future, trialOutboundCount: 25 }];
    const { res, next } = mockResAndNext();
    await trialGate.enforceTrialOutboundCap(reqWithUser("user-1"), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(402);
    const body = (res.json as any).mock.calls[0][0];
    expect(body.code).toBe("TRIAL_LIMIT_HIT");
    expect(body.limit).toBe(25);
    expect(body.current).toBe(25);
    expect(drizzle.update).not.toHaveBeenCalled();
  });

  it("returns 402 TRIAL_EXPIRED when trial endsAt is in the past", async () => {
    const past = new Date(Date.now() - 60_000);
    fixtures.selectRows = [{ status: "trialing", trialEndsAt: past, trialOutboundCount: 3 }];
    const { res, next } = mockResAndNext();
    await trialGate.enforceTrialOutboundCap(reqWithUser("user-1"), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(402);
    expect((res.json as any).mock.calls[0][0].code).toBe("TRIAL_EXPIRED");
  });

  it("returns 402 SUBSCRIPTION_REQUIRED on canceled subscription", async () => {
    fixtures.selectRows = [{ status: "canceled", trialEndsAt: null, trialOutboundCount: 0 }];
    const { res, next } = mockResAndNext();
    await trialGate.enforceTrialOutboundCap(reqWithUser("user-1"), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(402);
    expect((res.json as any).mock.calls[0][0].code).toBe("TRIAL_EXPIRED");
  });
});

// ────────────────────────────────────────────────────────────────────
//  sweepExpiredTrials
// ────────────────────────────────────────────────────────────────────
describe("sweepExpiredTrials", () => {
  it("returns the rowCount reported by the update", async () => {
    fixtures.updateRowCount = 3;
    const n = await trialGate.sweepExpiredTrials();
    expect(n).toBe(3);
    expect(drizzle.update).toHaveBeenCalledTimes(1);
  });

  it("returns 0 when no rows need flipping", async () => {
    fixtures.updateRowCount = 0;
    const n = await trialGate.sweepExpiredTrials();
    expect(n).toBe(0);
  });

  it("logs when the sweep actually flipped at least one tenant", async () => {
    fixtures.updateRowCount = 2;
    await trialGate.sweepExpiredTrials();
    expect(log.info).toHaveBeenCalledWith(
      "Trial sweep flipped tenants to trial_expired",
      expect.objectContaining({ count: 2 }),
    );
  });

  it("catches DB errors and returns 0 (never throws into the cron)", async () => {
    drizzle.update.mockImplementationOnce(
      () =>
        ({
          set: vi.fn(() => ({
            where: vi.fn(() => Promise.reject(new Error("db down"))),
          })),
        }) as any,
    );
    const n = await trialGate.sweepExpiredTrials();
    expect(n).toBe(0);
    expect(log.error).toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────
//  Email-verification gate — runs BEFORE the trial-state checks in
//  both middlewares. Unverified callers can poke the product but
//  can't burn money (outbound dial) or scale up (new agents).
// ────────────────────────────────────────────────────────────────────
describe("email-verification gate", () => {
  it("enforceTrialAgentCap returns 402 EMAIL_UNVERIFIED when the user has no verifiedAt", async () => {
    setUserState({ verified: false });
    const { res, next } = mockResAndNext();
    await trialGate.enforceTrialAgentCap(reqWithUser("user-1"), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(402);
    const body = (res.json as any).mock.calls[0][0];
    expect(body.code).toBe("EMAIL_UNVERIFIED");
  });

  it("enforceTrialOutboundCap returns 402 EMAIL_UNVERIFIED when the user has no verifiedAt", async () => {
    setUserState({ verified: false });
    const { res, next } = mockResAndNext();
    await trialGate.enforceTrialOutboundCap(reqWithUser("user-1"), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(402);
    const body = (res.json as any).mock.calls[0][0];
    expect(body.code).toBe("EMAIL_UNVERIFIED");
  });

  it("verified user with active subscription passes both middlewares", async () => {
    setUserState({
      verified: true,
      settingsRow: { status: "active", trialEndsAt: null, trialOutboundCount: 0 },
      agentCount: 0,
    });
    const r1 = mockResAndNext();
    await trialGate.enforceTrialAgentCap(reqWithUser("user-1"), r1.res, r1.next);
    expect(r1.next).toHaveBeenCalledTimes(1);
    expect(r1.res.status).not.toHaveBeenCalled();

    setUserState({
      verified: true,
      settingsRow: { status: "active", trialEndsAt: null, trialOutboundCount: 0 },
    });
    const r2 = mockResAndNext();
    await trialGate.enforceTrialOutboundCap(reqWithUser("user-1"), r2.res, r2.next);
    expect(r2.next).toHaveBeenCalledTimes(1);
    expect(r2.res.status).not.toHaveBeenCalled();
  });

  it("email gate runs BEFORE trial-status — unverified caller with an active sub still hits 402", async () => {
    // If somehow a tenant has subscription_status='active' but email
    // unverified (e.g. an admin manually flipped status), email gate
    // should still block — verification is independent.
    setUserState({
      verified: false,
      settingsRow: { status: "active", trialEndsAt: null, trialOutboundCount: 0 },
    });
    const { res, next } = mockResAndNext();
    await trialGate.enforceTrialAgentCap(reqWithUser("user-1"), res, next);
    expect(next).not.toHaveBeenCalled();
    const body = (res.json as any).mock.calls[0][0];
    expect(body.code).toBe("EMAIL_UNVERIFIED");
  });
});
