import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("daily brief scheduler launch contract", () => {
  const routes = read("src/routes/daily-brief-routes.ts");
  const schema = read("src/db/schema-base.ts");
  const migration = read("drizzle/migrations/0140_daily_brief_dispatch_lease.sql");
  const vercel = JSON.parse(read("vercel.json")) as {
    crons?: Array<{ path: string; schedule: string }>;
  };

  it("is actually reachable by Vercel Cron", () => {
    expect(routes).toContain('router.get("/api/daily-brief/schedule", runDailyBriefSchedule)');
    expect(vercel.crons).toContainEqual({
      path: "/api/daily-brief/schedule",
      schedule: "*/15 * * * *",
    });
    expect(routes).toContain('authz.startsWith("Bearer ")');
    expect(routes).toContain("cryptoTimingSafeEqual");
  });

  it("reconciles the tenant schedule instead of blasting every enabled tenant", () => {
    expect(routes).toContain("scheduledAtUtc(now, row.sendAt");
    expect(routes).toContain("if (now < scheduledAt)");
    expect(routes).toContain("row.lastSentAt >= scheduledAt");
    expect(routes).toContain("already_sent");
  });

  it("uses a durable lease and records delivery only after the send resolves", () => {
    expect(schema).toContain("dailyBriefDispatchClaimedAt");
    expect(migration).toContain("daily_brief_dispatch_claimed_at timestamptz");
    expect(routes).toContain("dailyBriefDispatchClaimedAt: claimAt");
    expect(routes).toContain("lt(schema.settings.dailyBriefDispatchClaimedAt, staleClaimBefore)");
    expect(routes).toContain("await withAuditCapture(() => sendDailyBriefEmail");
    expect(routes).toContain("dailyBriefLastSentAt: new Date()");
    expect(routes).toContain("dailyBriefDispatchClaimedAt: null");
  });
});
