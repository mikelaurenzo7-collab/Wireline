import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { jobOwnerId } from "../src/lib/job-owner";
import type { JobRow } from "../src/lib/job-queue-base";

const read = (path: string) => readFileSync(path, "utf8");

describe("job owner", () => {
  it("reads a claimed row, which is camelCase", () => {
    expect(jobOwnerId({ id: "j", userId: "tenant-a" } as unknown as JobRow)).toBe("tenant-a");
  });

  it("reads a snake_case row", () => {
    expect(jobOwnerId({ id: "j", user_id: "tenant-b" } as unknown as JobRow)).toBe("tenant-b");
  });

  it("returns empty when the row names no owner", () => {
    expect(jobOwnerId({ id: "j" } as unknown as JobRow)).toBe("");
  });

  it("is the only way the workers read a job's owner", () => {
    for (const file of ["src/lib/job-worker.ts", "src/lib/job-worker-base.ts"]) {
      const source = read(file);
      expect(source).toContain('import { jobOwnerId } from "./job-owner";');
      expect(source).not.toMatch(/\bjob\.user_id\b/);
      expect(source).not.toContain("function jobOwnerId(");
    }
  });

  it("scores enrichment with the Bot's own role", () => {
    const worker = read("src/lib/job-worker-base.ts");
    const enrichment = worker.slice(worker.indexOf('if (job.type === "post_call_enrichment")'));
    const lookup = enrichment.indexOf(
      "select({ role: schema.agents.role, archetype: schema.agents.archetype })",
    );
    expect(lookup).toBeGreaterThan(-1);
    expect(lookup).toBeLessThan(enrichment.indexOf("claudeBrain.postCallAnalysis({"));
    expect(enrichment).toContain("role: p.role || bot?.role || undefined,");
  });
});
