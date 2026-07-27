import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("durable enqueue failure contract", () => {
  it("throws when durable work was not persisted", () => {
    const queue = read("src/lib/job-queue.ts");
    expect(queue).toContain("enforceDurableEnqueueResult");
    expect(queue).toContain("if (!result.ok && !CALLER_MANAGED_ENQUEUE_FAILURE_TYPES.has(opts.type))");
    expect(queue).toContain("throw new Error(result.error || `Failed to enqueue ${opts.type} job`)");
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
    expect(digest).toContain("post-call digest: artifact enqueue failed");
    expect(worker).toContain("Failed to enqueue V2A extraction");
    expect(jobs).toContain("cadence_tick enqueue failed");
    expect(jobs).toContain("callback_tick enqueue failed");
  });
});
