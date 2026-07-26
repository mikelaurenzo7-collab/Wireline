import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("proactive lead enrichment remains tenant isolated", () => {
  const dispatcher = read("src/lib/job-worker.ts");
  const handler = read("src/lib/proactive-lead-enrichment-job.ts");

  it("intercepts the job before the legacy dispatcher", () => {
    const intercept = dispatcher.indexOf('if (job.type === "proactive_lead_enrichment")');
    const legacy = dispatcher.indexOf("await handleBaseJob(job as never)");
    expect(intercept).toBeGreaterThan(-1);
    expect(legacy).toBeGreaterThan(intercept);
    expect(dispatcher.slice(intercept, legacy)).toContain(
      "await handleProactiveLeadEnrichmentJob(job)",
    );
  });

  it("rejects a payload owner that differs from the durable job owner", () => {
    expect(handler).toContain("ownerId !== userId");
    expect(handler).toContain("job tenant does not match its payload owner");
  });

  it("enters tenant RLS and keeps explicit tenant predicates on call history", () => {
    expect(handler).toContain("await tenantStore.run(userId");
    const calls = handler.slice(
      handler.indexOf("schema.callLogs.summary"),
      handler.indexOf("emailHistoryPromise,", handler.indexOf("schema.callLogs.summary")),
    );
    expect(calls).toContain("eq(schema.callLogs.userId, userId)");
    expect(calls).toContain("eq(schema.callLogs.customerNumber, customerNumber)");
  });

  it("never treats a phone number as an email address", () => {
    const emailQuery = handler.slice(
      handler.indexOf("const emailHistoryPromise"),
      handler.indexOf("const [enrichment, calls, emails]"),
    );
    expect(emailQuery).toContain("eq(schema.emailThreads.userId, userId)");
    expect(emailQuery).toContain("eq(schema.emailThreads.customerEmail, customerEmail)");
    expect(emailQuery).not.toContain("customerNumber");
    expect(handler).toContain("customerEmail?: string");
  });

  it("persists job results with both job and tenant ownership", () => {
    expect(handler).toContain(
      ".where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.userId, userId)))",
    );
  });
});
