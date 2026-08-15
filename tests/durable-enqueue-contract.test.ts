import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { enforceDurableEnqueueResult } from "../src/lib/job-queue";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("durable enqueue failure contract", () => {
  it("throws when durable work was not persisted", () => {
    const queue = read("src/lib/job-queue.ts");
    expect(queue).toContain("enforceDurableEnqueueResult");
    expect(queue).toContain(
      "if (!result.ok && !CALLER_MANAGED_ENQUEUE_FAILURE_TYPES.has(opts.type))",
    );
    expect(queue).toContain(
      "throw new Error(result.error || `Failed to enqueue ${opts.type} job`)",
    );
  });

  it("treats only the named scheduler-singleton conflict as a durable no-op", () => {
    const duplicate = {
      ok: false,
      error: 'duplicate key value violates unique constraint "uq_jobs_queued_scheduler_tick"',
    };

    expect(enforceDurableEnqueueResult({ type: "cadence_tick" }, duplicate)).toEqual({ ok: true });
    expect(enforceDurableEnqueueResult({ type: "callback_tick" }, duplicate)).toEqual({ ok: true });
    expect(() =>
      enforceDurableEnqueueResult(
        { type: "cadence_tick" },
        {
          ok: false,
          error: "database unavailable",
        },
      ),
    ).toThrow("database unavailable");
    expect(() => enforceDurableEnqueueResult({ type: "purge_old_data" }, duplicate)).toThrow(
      "uq_jobs_queued_scheduler_tick",
    );
  });

  it("enforces one active scheduler tick without rewriting running work", () => {
    const migration = read("drizzle/migrations/0141_scheduler_tick_singletons.sql");
    const journal = read("drizzle/migrations/meta/_journal.json");

    expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS uq_jobs_queued_scheduler_tick");
    expect(migration).toContain("ON public.wireline_jobs USING btree (user_id, type)");
    expect(migration).toContain("type IN ('cadence_tick', 'callback_tick')");
    expect(migration).toContain("status IN ('pending', 'running', 'failed')");
    expect(migration).toContain("PARTITION BY user_id, type");
    expect(migration).toContain("CASE WHEN status = 'running' THEN 0 ELSE 1 END");
    expect(migration).toContain("ranked.active_rank > 1");
    expect(migration).toContain("jobs.status IN ('pending', 'failed')");
    expect(migration).toContain("HAVING count(*) > 1");
    expect(migration).toContain("Cannot enforce scheduler singleton");

    const previous = journal.indexOf('"tag": "0140_daily_brief_dispatch_lease"');
    const singleton = journal.indexOf('"tag": "0141_scheduler_tick_singletons"');
    expect(previous).toBeGreaterThanOrEqual(0);
    expect(singleton).toBeGreaterThan(previous);
  });

  it("preserves the campaign launch rollback result contract", () => {
    const queue = read("src/lib/job-queue.ts");
    const campaigns = read("src/routes/campaign-routes.ts");
    expect(queue).toContain('new Set<JobType>(["campaign_dial"])');
    expect(campaigns).toContain("if (!enq.ok)");
    expect(campaigns).toContain("status: previousStatus");
  });

  it("routes failed Vapi completion enqueue through the synchronous fallback", () => {
    const vapi = read("src/routes/vapi-v2.ts");
    expect(vapi).toContain('type: "vapi_webhook"');
    expect(vapi).toContain("await handleEndOfCallReport({ message, agent })");
    expect(vapi).toContain("res.status(500).json({ success: false })");
  });

  it("makes existing catch-based producers observe enqueue failures", () => {
    const digest = read("src/lib/post-call-digest.ts");
    const worker = read("src/lib/job-worker-base.ts");
    const jobs = read("src/routes/job-routes.ts");
    expect(digest).toContain("await enqueuePostCallChildJob({");
    expect(digest).toContain("enqueue conflicted without an adoptable child job");
    expect(digest).toContain("{ retrySafe: true }");
    expect(worker).toContain("Failed to enqueue V2A extraction");
    expect(jobs).toContain("cadence_tick enqueue failed");
    expect(jobs).toContain("callback_tick enqueue failed");
  });

  it("reclaims retryable failed jobs when their backoff expires", () => {
    const queue = read("src/lib/job-queue-base.ts");
    const claimJob = queue.slice(
      queue.indexOf("export async function claimJob("),
      queue.indexOf("/** Atomically claim one due pending or retryable-failed job"),
    );
    const claimJobById = queue.slice(
      queue.indexOf("export async function claimJobById("),
      queue.indexOf(
        "// ─────────────────────────────────────────────────────────────────\n// Completion helpers",
      ),
    );

    expect(queue).toContain('status: (exhausted ? "dead" : "failed") as JobStatus');
    expect(claimJob).toContain('inArray(schema.jobs.status, ["pending", "failed"])');
    expect(claimJobById).toContain('inArray(schema.jobs.status, ["pending", "failed"])');
    expect(claimJob).toContain("lte(schema.jobs.runAt, new Date())");
    expect(claimJobById).toContain("lte(schema.jobs.runAt, new Date())");
  });

  it("remains part of the production-equivalent Vercel contract gate", () => {
    const build = read("scripts/vercel-build.mjs");
    expect(build).toContain('"tests/durable-enqueue-contract.test.ts"');
  });
});
