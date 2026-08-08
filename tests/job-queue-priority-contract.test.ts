import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("job queue claim priority", () => {
  it("keeps daily retention fan-out behind all other due work", () => {
    const queue = read("src/lib/job-queue.ts");

    expect(queue).toContain(
      "case when ${schema.jobs.type} = 'purge_old_data' then 1 else 0 end",
    );
    expect(queue).toContain(
      ".orderBy(claimPriority, claimOrder(claimTime), schema.jobs.id)",
    );
  });
});
