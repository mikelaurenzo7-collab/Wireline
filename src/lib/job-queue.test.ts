import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Source-text guardrails for the job queue retry loop. These prevent
// regressions of two bugs that silently broke every retryable failure:
//
//   1. claimJob only picked status='pending', while failJob writes
//      status='failed' for retries. Result: backoff schedule was dead
//      code — every retryable failure became terminal on the first
//      attempt. The fix included 'failed' in the claim WHERE clause.
//
//   2. The graceful-shutdown handler in server.ts captured but never
//      invoked stopWorker(). The worker's poll loop kept firing across
//      server.close(), risking jobs claimed but killed mid-handler.

const __dirname = dirname(fileURLToPath(import.meta.url));
const JOB_QUEUE = readFileSync(join(__dirname, "job-queue.ts"), "utf8");
const SERVER = readFileSync(join(__dirname, "..", "..", "server.ts"), "utf8");

describe("job-queue.ts — claimJob retry semantics", () => {
  it("claimJob includes 'failed' status in its WHERE clause", () => {
    // The retry loop only works if claimJob picks up rows whose status
    // is 'failed' AND whose run_at has elapsed. Without this, every
    // retryable failure dies on the first attempt regardless of the
    // backoff schedule.
    expect(JOB_QUEUE).toMatch(
      /inArray\(\s*schema\.jobs\.status\s*,\s*\[\s*"pending"\s*,\s*"failed"\s*\]\s*\)/,
    );
  });

  it("claimJob still filters by run_at <= now", () => {
    // Backoff retries set run_at into the future; the WHERE clause
    // must keep gating on run_at to honor the backoff schedule.
    expect(JOB_QUEUE).toMatch(/lte\(\s*schema\.jobs\.runAt\s*,\s*new Date\(\)\s*\)/);
  });

  it("failJob still writes 'failed' for retryable failures", () => {
    // 'failed' as the retry-waiting state lets getQueueStats /
    // operator-slos report retry queue depth separately from fresh
    // queue depth. Don't collapse the two.
    expect(JOB_QUEUE).toMatch(/exhausted\s*\?\s*"dead"\s*:\s*"failed"/);
  });
});

describe("server.ts — graceful shutdown", () => {
  it("shutdown handler invokes stopWorker before server.close", () => {
    // Match the actual callsite, not any reference in comments.
    const stopWorkerIdx = SERVER.search(/^\s*stopWorker\?\.\(\);?$/m);
    const serverCloseIdx = SERVER.search(/^\s*server\.close\(/m);
    expect(stopWorkerIdx).toBeGreaterThan(0);
    expect(serverCloseIdx).toBeGreaterThan(0);
    // stopWorker must be called BEFORE server.close so the worker stops
    // claiming new jobs while in-flight HTTP requests drain.
    expect(stopWorkerIdx).toBeLessThan(serverCloseIdx);
  });

  it("stopWorker is captured at module scope from initJobWorker", () => {
    // Module-scope binding so the shutdown closure can reach it.
    expect(SERVER).toMatch(
      /const\s+stopWorker\s*:\s*\(\(\)\s*=>\s*void\)\s*\|\s*undefined\s*=\s*initJobWorker\(\)/,
    );
  });
});
