import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sweep = readFileSync(resolve(process.cwd(), "src/routes/job-routes.ts"), "utf8").replace(
  /\r\n/g,
  "\n",
);

/**
 * The jobs sweep only runs while the crons match the API's commit. A fixed
 * 15-minute window skipped a day's purge, number reclamation, cleanup, and
 * margin alert whenever the sweep was paused across it. Each task now runs at
 * or after its time, and its 23-hour guard keeps it to once a day.
 */
describe("daily sweep maintenance", () => {
  const tasks = [
    { at: "isAtOrAfterUtcTime(now, 2, 0)", job: '"purge_old_data"' },
    { at: "isAtOrAfterUtcTime(now, 3, 15)", job: '"sweep_orphan_supervisor_subs"' },
    { at: "isAtOrAfterUtcTime(now, 4, 30)", job: '"reclaim_canceled_numbers"' },
    { at: "isAtOrAfterUtcTime(now, 5, 0)", job: '"margin_at_risk_alert"' },
  ];

  it("catches up later in the day instead of skipping it", () => {
    expect(sweep).not.toContain("isWithinUtcWindow");
    for (const task of tasks) expect(sweep).toContain(task.at);
  });

  it("still runs each task once a day", () => {
    for (const task of tasks) {
      const start = sweep.indexOf(task.at);
      const block = sweep.slice(start, sweep.indexOf("\n    }\n", start));
      expect(block, task.job).toContain(`eq(schema.jobs.type, ${task.job})`);
      expect(block, task.job).toMatch(/gte\(schema\.jobs\.createdAt, since(23h)?\)/);
      expect(block, task.job).toContain("23 * 60 * 60 * 1000");
    }
  });

  it("prunes old system jobs once a day, alongside the orphan sweep", () => {
    const enqueue = sweep.indexOf('type: "sweep_orphan_supervisor_subs"');
    const prune = sweep.indexOf("DELETE FROM wireline_jobs");
    const guard = sweep.lastIndexOf("if (!recentOrphanSweep.length) {", enqueue);
    expect(guard).toBeGreaterThan(-1);
    expect(prune).toBeGreaterThan(enqueue);
    expect(sweep.slice(guard, prune)).not.toContain("\n    }\n");
  });
});
