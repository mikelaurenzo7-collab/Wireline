import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("daily brief scheduler launch contract", () => {
  const routes = read("src/routes/daily-brief-routes.ts");
  const brief = read("src/lib/daily-brief.ts");
  const schema = read("src/db/schema-base.ts");
  const canonicalSchema = read("src/db/schema.ts");
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

  it("uses a durable lease and latches an ambiguous provider send before Gmail is called", () => {
    expect(schema).toContain("dailyBriefDispatchClaimedAt");
    // src/db/schema.ts intentionally re-declares settings and overrides the
    // schema-base export. Keep scheduler-only columns on the canonical table
    // too, or Drizzle receives undefined columns and the cron 500s at SELECT.
    expect(canonicalSchema).toContain("dailyBriefDispatchClaimedAt");
    expect(canonicalSchema).toContain("dailyBriefLastAttemptAt");
    expect(migration).toContain("daily_brief_dispatch_claimed_at timestamptz");
    expect(migration).toContain("daily_brief_last_attempt_at timestamptz");
    expect(routes).toContain("dailyBriefDispatchClaimedAt: claimAt");
    expect(routes).toContain("dailyBriefLastAttemptAt: claimAt");
    expect(routes).toContain("lt(schema.settings.dailyBriefDispatchClaimedAt, staleClaimBefore)");
    expect(routes).toContain("await runInAuditContext(auditContext");
    expect(brief).toContain("await oauth2Client.getAccessToken()");
    expect(brief).toContain("opts?.onProviderSendAttempt?.()");
    expect(brief.indexOf("await oauth2Client.getAccessToken()")).toBeLessThan(
      brief.indexOf("opts?.onProviderSendAttempt?.()"),
    );
    expect(brief.indexOf("opts?.onProviderSendAttempt?.()")).toBeLessThan(
      brief.indexOf("await gmail.users.messages.send"),
    );
    expect(routes).toContain("providerSendAttempted = true");
    expect(routes).toContain("providerSendAccepted = true");
    expect(routes).toContain("providerHttpResponseStatus(e)");
    expect(routes).toContain("providerSendAttempted && providerResponseStatus === null");
    expect(routes).toContain("dailyBriefLastSentAt: new Date()");
    expect(routes).toContain("dailyBriefDispatchClaimedAt: null");
    expect(routes).toContain("preserveAttemptLatch ? {} : { dailyBriefLastAttemptAt");
  });
});
