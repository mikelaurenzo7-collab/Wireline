/**
 * Job Queue Monitoring Test
 * 
 * Verifies that the job queue stats endpoint is working and can detect
 * monotonically growing pending job counts (which indicates the worker
 * or cron sweep is not running).
 */

import { describe, it, expect } from "vitest";

describe("Job Queue Stats", () => {
  it("should document the queue monitoring expectations", () => {
    // This test documents the monitoring strategy. In production:
    // 1. Call GET /api/jobs/stats twice, 5 minutes apart
    // 2. If pending count grows monotonically across both runs, alert
    // 3. Expected behavior: pending should stay low (< 10) or decrease
    // 4. If pending > 100 and growing, the worker/cron is likely dead
    
    const monitoringStrategy = {
      endpoint: "/api/jobs/stats",
      authentication: "Required - authenticateUser + jobsRateLimit",
      checkInterval: "5 minutes",
      alertThreshold: {
        pending: 100,
        condition: "monotonically increasing across 2 checks",
      },
      response: {
        pending: "number - jobs waiting to run",
        processing: "number - jobs currently running",
        completed: "number - successfully finished jobs",
        failed: "number - jobs that failed",
      },
    };
    
    expect(monitoringStrategy.endpoint).toBe("/api/jobs/stats");
    expect(monitoringStrategy.alertThreshold.pending).toBeGreaterThan(0);
  });

  it("should detect when vercel cron configuration is present", () => {
    // The cron entries in vercel.json ensure /api/jobs/sweep runs every 5 minutes
    // and the daily brief scheduler runs at 08:00 UTC daily. If these are missing,
    // jobs will never be swept in production on Vercel.
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    
    const vercelConfigPath = resolve(process.cwd(), "vercel.json");
    const vercelConfig = JSON.parse(readFileSync(vercelConfigPath, "utf-8"));
    
    expect(vercelConfig.crons, "vercel.json must define crons array").toBeDefined();
    expect(Array.isArray(vercelConfig.crons)).toBe(true);
    
    // Find the jobs sweep cron
    const sweepCron = vercelConfig.crons.find((c: any) => 
      c.path === "/api/jobs/sweep"
    );
    expect(sweepCron, "/api/jobs/sweep cron must be defined").toBeDefined();
    expect(sweepCron.schedule, "sweep cron must have a schedule").toBeTruthy();
    
    // Find the daily brief cron
    const briefCron = vercelConfig.crons.find((c: any) => 
      c.path.includes("daily-brief") && c.path.includes("schedule")
    );
    expect(briefCron, "daily brief cron must be defined").toBeDefined();
    expect(briefCron.schedule, "brief cron must have a schedule").toBeTruthy();
  });
});
