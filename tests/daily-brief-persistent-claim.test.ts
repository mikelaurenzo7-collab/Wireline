import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const h = vi.hoisted(() => ({
  row: {
    userId: "00000000-0000-4000-8000-000000000001",
    sendAt: "13:00",
    lastSentAt: null as Date | null,
    lastAttemptAt: null as Date | null,
    claimedAt: null as Date | null,
  },
  send: vi.fn(),
  claimQueries: [] as string[],
}));

vi.mock("../src/lib/server-context", async () => {
  const { PgDialect } = await import("drizzle-orm/pg-core");
  const dialect = new PgDialect();
  return {
    log: { error: vi.fn(), warn: vi.fn() },
    drizzle: {
      select: () => ({ from: () => ({ where: async () => [{ ...h.row }] }) }),
      update: () => ({
        set: (patch: Record<string, unknown>) => ({
          where: (condition: Parameters<typeof dialect.sqlToQuery>[0]) => {
            const query = dialect.sqlToQuery(condition);
            const apply = () => {
              if ("dailyBriefDispatchClaimedAt" in patch) {
                h.row.claimedAt = patch.dailyBriefDispatchClaimedAt as Date | null;
              }
              if ("dailyBriefLastAttemptAt" in patch) {
                h.row.lastAttemptAt = patch.dailyBriefLastAttemptAt as Date | null;
              }
              if ("dailyBriefLastSentAt" in patch) {
                h.row.lastSentAt = patch.dailyBriefLastSentAt as Date | null;
              }
            };
            return {
              returning: async () => {
                h.claimQueries.push(query.sql);
                // Evaluate the actual emitted claim predicate for this fixture.
                // The fixture's previous-day send/attempt fields are eligible.
                const permitsStaleClaim = query.sql.includes('"daily_brief_dispatch_claimed_at" <');
                const cutoff = new Date(Date.now() - 20 * 60 * 1000);
                if (h.row.claimedAt && !(permitsStaleClaim && h.row.claimedAt < cutoff)) return [];
                apply();
                return [{ userId: h.row.userId }];
              },
              then: (resolve: (value: unknown[]) => unknown) => {
                apply();
                return Promise.resolve([]).then(resolve);
              },
              catch: () => Promise.resolve([]),
            };
          },
        }),
      }),
    },
  };
});
vi.mock("../src/lib/auth-service", () => ({ isOwnerEmail: () => false }));
vi.mock("../src/middleware/auth", () => ({ authenticateUser: vi.fn() }));
vi.mock("../src/middleware/api-rate-limits", () => ({ createRateLimiter: () => vi.fn() }));
vi.mock("../src/middleware/audit-middleware", () => ({
  withAudit: () => vi.fn(),
  persistRuntimeAuditRecords: vi.fn(),
}));
vi.mock("../src/lib/ai-audit", () => ({
  createAuditContext: () => ({ records: [] }),
  runInAuditContext: (_context: unknown, work: () => unknown) => work(),
}));
vi.mock("../src/lib/provider-identity-context", () => ({
  runWithProviderIdentity: (_userId: string, work: () => unknown) => work(),
}));
vi.mock("../src/lib/spend-guards", () => ({ enforceSpendCap: vi.fn() }));
vi.mock("../src/lib/daily-brief", () => ({ sendDailyBriefEmail: h.send }));
vi.mock("../src/lib/server-utils", () => ({
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

import router from "../src/routes/daily-brief-routes";

const schedule = router.stack.find((layer) => layer.route?.path === "/api/daily-brief/schedule")!
  .route.stack[0].handle as (req: Request, res: Response) => Promise<void>;

async function runSchedule() {
  const json = vi.fn();
  await schedule(
    { headers: { authorization: "Bearer cron-secret-for-scheduler-test" } } as Request,
    { json } as unknown as Response,
  );
  return json.mock.calls[0][0] as { sent: number; contended: number; already_attempted: number };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-23T13:01:00Z"));
  vi.stubEnv("CRON_SECRET", "cron-secret-for-scheduler-test");
  vi.stubEnv("RENDER", "true");
  vi.stubEnv("RENDER_SERVICE_ID", "");
  vi.stubEnv("RENDER_GIT_BRANCH", "main");
  vi.stubEnv("RENDER_GIT_COMMIT", "a".repeat(40));
  vi.stubEnv("IS_PULL_REQUEST", "false");
  vi.stubEnv("WIRELINE_DEPLOYMENT_ENVIRONMENT", "production");
  for (const key of ["VERCEL", "VERCEL_ENV", "VERCEL_GIT_COMMIT_REF", "VERCEL_GIT_COMMIT_SHA"]) {
    vi.stubEnv(key, "");
  }
  h.row.lastSentAt = null;
  h.row.lastAttemptAt = null;
  h.row.claimedAt = null;
  h.claimQueries = [];
  h.send.mockReset().mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("daily brief claims on persistent hosts", () => {
  it("does not steal a live claim when the original request survives into the next day", async () => {
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    h.send.mockImplementationOnce(async () => {
      entered();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    const original = runSchedule();
    await started;

    vi.setSystemTime(new Date("2026-09-24T13:01:00Z"));
    const overlapping = await runSchedule();
    expect(overlapping.contended).toBe(1);
    expect(overlapping.sent).toBe(0);
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.claimQueries[1]).toContain('"daily_brief_dispatch_claimed_at" is null');
    expect(h.claimQueries[1]).not.toContain('"daily_brief_dispatch_claimed_at" <');

    release();
    expect((await original).sent).toBe(1);
    expect(h.row.claimedAt).toBeNull();
  });

  it("requires explicit recovery of a stale claim after an unconfirmed process loss", async () => {
    h.row.claimedAt = new Date("2026-09-22T13:01:00Z");
    h.row.lastAttemptAt = new Date(h.row.claimedAt);
    expect((await runSchedule()).contended).toBe(1);
    expect(h.send).not.toHaveBeenCalled();
    expect(h.row.claimedAt).not.toBeNull();
  });

  it("continues sending unclaimed scheduled briefs and suppresses same-day replay", async () => {
    expect((await runSchedule()).sent).toBe(1);
    expect(h.row.claimedAt).toBeNull();
    await runSchedule();
    expect(h.send).toHaveBeenCalledTimes(1);
  });

  it("preserves Vercel reclamation after its bounded invocation has expired", async () => {
    for (const key of ["RENDER", "RENDER_SERVICE_ID", "RENDER_GIT_BRANCH", "RENDER_GIT_COMMIT"]) {
      vi.stubEnv(key, "");
    }
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    h.row.claimedAt = new Date("2026-09-22T13:01:00Z");
    h.row.lastAttemptAt = new Date(h.row.claimedAt);
    expect((await runSchedule()).sent).toBe(1);
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.claimQueries[0]).toContain('"daily_brief_dispatch_claimed_at" <');
  });
});
