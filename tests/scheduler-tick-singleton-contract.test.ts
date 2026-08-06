import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "drizzle/migrations/0135_scheduler_tick_singletons.sql"),
  "utf8",
).replace(/\r\n/g, "\n");
const journal = readFileSync(
  resolve(process.cwd(), "drizzle/migrations/meta/_journal.json"),
  "utf8",
).replace(/\r\n/g, "\n");
const jobRoutes = readFileSync(resolve(process.cwd(), "src/routes/job-routes.ts"), "utf8").replace(
  /\r\n/g,
  "\n",
);

describe("singleton scheduler ticks", () => {
  it("enforces one active cadence or callback tick per owner and type", () => {
    expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS uq_jobs_active_scheduler_tick");
    expect(migration).toContain("ON public.wireline_jobs USING btree (user_id, type)");
    expect(migration).toContain("type IN ('cadence_tick', 'callback_tick')");
    expect(migration).toContain("status IN ('pending', 'running', 'failed')");
  });

  it("collapses historical duplicates without discarding the preferred active job", () => {
    expect(migration).toContain("PARTITION BY user_id, type");
    expect(migration).toContain("CASE WHEN status = 'running' THEN 0 ELSE 1 END");
    expect(migration).toContain("ranked.active_rank > 1");
    expect(migration).toContain("jobs.status IN ('pending', 'failed')");
  });

  it("registers the migration after the existing 0134 entry", () => {
    const previous = journal.indexOf('"tag": "0134_free_builder_simulation_allowance"');
    const singleton = journal.indexOf('"tag": "0135_scheduler_tick_singletons"');
    expect(previous).toBeGreaterThanOrEqual(0);
    expect(singleton).toBeGreaterThan(previous);
  });

  it("keeps both global scheduler producers routed through the durable queue", () => {
    expect(jobRoutes).toContain('type: "cadence_tick"');
    expect(jobRoutes).toContain('type: "callback_tick"');
    expect(jobRoutes).toContain("await enqueueJob(drizzle");
  });
});
