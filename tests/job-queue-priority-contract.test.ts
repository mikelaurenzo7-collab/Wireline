import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("job queue claim priority", () => {
  it("keeps due Realtime hangups first and daily retention fan-out last", () => {
    const queue = read("src/lib/job-queue.ts");

    expect(queue).toContain("when ${schema.jobs.type} = 'openai_realtime_hangup' then 0");
    expect(queue).toContain("when ${schema.jobs.type} = 'purge_old_data' then 2");
    expect(queue).toContain("else 1");
    expect(queue).toContain(".orderBy(claimPriority, claimOrder(claimTime), schema.jobs.id)");
  });
});
