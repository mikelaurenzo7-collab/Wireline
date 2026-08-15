import { afterEach, describe, expect, it, vi } from "vitest";

import { getPlatformJobWindowStats } from "../src/lib/operator-slos";
import { evaluatePlatformOperationalSlos } from "../src/lib/platform-operational-slos";

afterEach(() => {
  vi.unstubAllEnvs();
});

function setIncidentEnvironment(input: { token?: string; cron?: string; owner?: string }) {
  vi.stubEnv("HEALTH_MONITOR_TOKEN", input.token ?? "");
  vi.stubEnv("CRON_SECRET", input.cron ?? "");
  vi.stubEnv("OWNER_EMAIL", input.owner ?? "");
}

describe("platform operational SLO accuracy", () => {
  it("requires both protected monitor access and an owner contact", () => {
    setIncidentEnvironment({ token: "monitor-secret" });
    const tokenOnly = evaluatePlatformOperationalSlos({ dbOk: true, dbLatencyMs: 12 });
    expect(tokenOnly.targets.incident_response).toMatchObject({
      configured: false,
      status: "insufficient_data",
      evidence: {
        monitor_token_configured: true,
        owner_contact_configured: false,
      },
    });

    setIncidentEnvironment({ owner: "owner@example.com" });
    const ownerOnly = evaluatePlatformOperationalSlos({ dbOk: true, dbLatencyMs: 12 });
    expect(ownerOnly.targets.incident_response).toMatchObject({
      configured: false,
      status: "insufficient_data",
      evidence: {
        monitor_token_configured: false,
        owner_contact_configured: true,
      },
    });

    setIncidentEnvironment({ token: "   ", owner: "   " });
    const whitespaceOnly = evaluatePlatformOperationalSlos({ dbOk: true, dbLatencyMs: 12 });
    expect(whitespaceOnly.targets.incident_response.configured).toBe(false);

    setIncidentEnvironment({ cron: "cron-secret", owner: "owner@example.com" });
    const complete = evaluatePlatformOperationalSlos({ dbOk: true, dbLatencyMs: 12 });
    expect(complete.targets.incident_response).toMatchObject({ configured: true, status: "ok" });
  });

  it("degrades the measured target below 95% webhook success", () => {
    setIncidentEnvironment({ token: "monitor-secret", owner: "owner@example.com" });

    const warning = evaluatePlatformOperationalSlos({
      dbOk: true,
      dbLatencyMs: 12,
      pendingJobs: 0,
      webhookAttempts: 20,
      webhookSuccessRate: 0.949,
    });
    expect(warning.targets.webhooks.status).toBe("degraded");
    expect(warning.dimensions.webhooks).toBe("warn");
    expect(warning.status).toBe("degraded");

    const healthy = evaluatePlatformOperationalSlos({
      dbOk: true,
      dbLatencyMs: 12,
      pendingJobs: 0,
      webhookAttempts: 20,
      webhookSuccessRate: 0.95,
    });
    expect(healthy.targets.webhooks.status).toBe("ok");
    expect(healthy.dimensions.webhooks).toBe("ok");
    expect(healthy.status).toBe("ok");
  });

  it("requires ten completed webhook deliveries, not pending records", () => {
    setIncidentEnvironment({ token: "monitor-secret", owner: "owner@example.com" });
    const tooFewCompleted = evaluatePlatformOperationalSlos({
      dbOk: true,
      dbLatencyMs: 12,
      pendingJobs: 0,
      webhookAttempts: 100,
      webhookCompletedDeliveries: 9,
      webhookSuccessRate: 8 / 9,
    });

    expect(tooFewCompleted.targets.webhooks).toMatchObject({
      configured: false,
      status: "insufficient_data",
    });
    expect(tooFewCompleted.notes).toContain(
      "Webhook success rate needs at least 10 completed deliveries in the window.",
    );
  });
});

describe("platform job-window measurements", () => {
  it("maps actual queue age and enrichment states instead of placeholders", async () => {
    const now = new Date("2026-08-15T12:00:00.000Z");
    const where = vi.fn().mockResolvedValue([
      {
        oldestPendingAt: "2026-08-15T11:57:55.000Z",
        enrichmentPending: "7",
        enrichmentRunning: 2,
        enrichmentFailed: "3",
        enrichmentDead: 4,
        enrichmentDone: "19",
      },
    ]);
    const db = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where })) })),
    } as unknown as Parameters<typeof getPlatformJobWindowStats>[0];

    await expect(getPlatformJobWindowStats(db, 48, now)).resolves.toEqual({
      oldest_pending_age_seconds: 125,
      enrichment: {
        pending: 7,
        running: 2,
        failed: 3,
        dead: 4,
        done_in_window: 19,
      },
    });
    expect(where).toHaveBeenCalledOnce();
  });

  it("reports no oldest age when no pending job exists", async () => {
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([
            {
              oldestPendingAt: null,
              enrichmentPending: 0,
              enrichmentRunning: 0,
              enrichmentFailed: 0,
              enrichmentDead: 0,
              enrichmentDone: 0,
            },
          ]),
        })),
      })),
    } as unknown as Parameters<typeof getPlatformJobWindowStats>[0];

    const result = await getPlatformJobWindowStats(db, 24, new Date("2026-08-15T12:00:00.000Z"));
    expect(result.oldest_pending_age_seconds).toBeNull();
  });
});
