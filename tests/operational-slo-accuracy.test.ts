import { afterEach, describe, expect, it, vi } from "vitest";

import {
  evaluateAccountHolderSloHealth,
  getPlatformJobWindowStats,
  getSloWebhookEvents,
} from "../src/lib/operator-slos";
import { evaluatePlatformOperationalSlos } from "../src/lib/platform-operational-slos";
import { getQueueStats } from "../src/lib/job-queue";

afterEach(() => {
  vi.unstubAllEnvs();
});

function setIncidentEnvironment(input: { token?: string; cron?: string; owner?: string }) {
  vi.stubEnv("HEALTH_MONITOR_TOKEN", input.token ?? "");
  vi.stubEnv("CRON_SECRET", input.cron ?? "");
  vi.stubEnv("OWNER_EMAIL", input.owner ?? "");
}

describe("platform operational SLO accuracy", () => {
  it("reports an overdue queue when PostgreSQL returns bigint counts as strings", async () => {
    const counts = ["3", "0", "0", "5", "2"];
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([{ count: counts.shift() }]),
        })),
      })),
    } as unknown as Parameters<typeof getQueueStats>[0];

    const queue = await getQueueStats(db);
    expect(queue).toEqual({ pending: 3, running: 0, failed: 0, dead: 5, done_last_hour: 2 });
    const platform = evaluatePlatformOperationalSlos({
      dbOk: true,
      dbLatencyMs: 12,
      pendingJobs: queue.pending,
      oldestPendingAgeSeconds: 64_272,
    });
    expect(platform.dimensions.jobs_queue).toBe("critical");
    expect(platform.banner_status).toBe("critical");
    expect(platform.targets.job_queue.status).toBe("degraded");
  });

  it.each([
    { pending: 3, age: 600, health: "ok" },
    { pending: 3, age: 601, health: "warn" },
    { pending: 3, age: 3600, health: "warn" },
    { pending: 3, age: 3601, health: "critical" },
    { pending: 3, age: 39_600, health: "critical" },
    { pending: 0, age: 39_600, health: "ok" },
    { pending: 3, age: -60, health: "ok" },
    { pending: 51, age: null, health: "warn" },
    { pending: 201, age: 0, health: "critical" },
  ])(
    "agrees across tenant and platform health for $pending jobs, age $age",
    ({ pending, age, health }) => {
      const tenant = evaluateAccountHolderSloHealth({
        pendingJobs: pending,
        oldestPendingAgeSeconds: age,
        deadEnrichmentWindow: 0,
        webhookCompletedWindow: 0,
        webhookSuccessRate: null,
        auditErrorsWindow: 0,
      });
      const platform = evaluatePlatformOperationalSlos({
        dbOk: true,
        dbLatencyMs: 12,
        pendingJobs: pending,
        oldestPendingAgeSeconds: age,
      });
      expect(tenant.jobs_queue).toBe(health);
      expect(platform.dimensions.jobs_queue).toBe(health);
      expect(platform.targets.job_queue.status).toBe(health === "ok" ? "ok" : "degraded");
      expect(platform.targets.job_queue.evidence).toMatchObject({
        pending_jobs: pending,
        oldest_pending_age_seconds: age,
      });
      expect(platform.banner_status).toBe(
        health === "critical" ? "critical" : health === "warn" ? "degraded" : "healthy",
      );
      if (pending > 0 && age !== null && age > 600) {
        expect(tenant.notes.join(" ")).toContain("minutes overdue");
        expect(platform.notes.join(" ")).toContain("minutes overdue");
      }
    },
  );

  it("describes an age-triggered critical queue without claiming a large backlog", () => {
    const [event] = getSloWebhookEvents({ jobs_queue: "critical" }, 24, "2026-09-26T09:00:00Z");
    expect(event.event).toBe("slo.jobs.critical");
    expect(event.summary).toContain("or a pending job overdue by more than one hour");
  });

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
  it("does not treat intentionally scheduled future jobs as overdue", async () => {
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([{ oldestPendingAt: "2026-08-16T12:00:00.000Z" }]),
        })),
      })),
    } as unknown as Parameters<typeof getPlatformJobWindowStats>[0];
    const result = await getPlatformJobWindowStats(db, 24, new Date("2026-08-15T12:00:00.000Z"));
    expect(result.oldest_pending_age_seconds).toBe(0);
  });

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
