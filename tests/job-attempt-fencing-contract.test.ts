import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routes = readFileSync(new URL("../src/routes/job-routes.ts", import.meta.url), "utf8");
const queue = readFileSync(new URL("../src/lib/job-queue.ts", import.meta.url), "utf8");

describe("durable job attempt fencing", () => {
  it("does not pretend Promise.race cancels a still-running handler", () => {
    expect(routes).not.toContain("PER_JOB_TIMEOUT_MS");
    expect(routes).not.toContain("await Promise.race([");
    expect(routes).toContain("await handleJob(job)");
    expect(routes).toContain("await complete(drizzle, job)");
  });

  it("fences completion to the exact running attempt", () => {
    expect(queue).toContain("export async function completeClaimedJob");
    expect(queue).toContain('eq(schema.jobs.status, "running")');
    expect(queue).toContain("eq(schema.jobs.attempts, expectedAttempts)");
  });

  it("fences retry and dead-letter transitions to the exact running attempt", () => {
    expect(queue).toContain("eq(schema.jobs.attempts, attempts)");
    expect(queue).toContain('status: exhausted ? "dead" : "pending"');
  });

  it("uses fenced semantics in both serverless and persistent workers", () => {
    expect(routes).toContain("completeClaimedJob");
    expect(queue).toContain("await completeClaimedJob(db, job)");
    expect(queue).not.toContain("return base.startWorker(");
  });
});
