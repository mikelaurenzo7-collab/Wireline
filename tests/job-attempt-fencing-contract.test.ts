import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { basePlanInvoiceShare } from "../src/lib/stripe-helpers";
import { STRIPE_PLANS, planPriceId } from "../src/lib/plan-catalog";

const routes = readFileSync(new URL("../src/routes/job-routes.ts", import.meta.url), "utf8");
const queue = readFileSync(new URL("../src/lib/job-queue.ts", import.meta.url), "utf8");
const srcRoot = fileURLToPath(new URL("../src/", import.meta.url));
const queueFacadePath = join(srcRoot, "lib", "job-queue.ts");
const queueBasePath = join(srcRoot, "lib", "job-queue-base.ts");
const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts"]);

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(absolute);
    return sourceExtensions.has(extname(entry.name)) ? [absolute] : [];
  });
}

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

  it("claims pending and retryable failed work fairly with a narrowed nullable status", () => {
    expect(queue).toContain("async function claimEligibleJob");
    expect(queue).toContain('const CLAIMABLE_STATUSES = ["pending", "failed"] as const');
    expect(queue).toContain("inArray(schema.jobs.status, [...CLAIMABLE_STATUSES])");
    expect(queue).toContain(
      "coalesce(${schema.jobs.attempts}, 0) < coalesce(${schema.jobs.maxAttempts}",
    );
    expect(queue).toContain("coalesce(${schema.jobs.runAt}, ${claimTime}) <= ${claimTime}");
    expect(queue).toContain(
      "coalesce(${schema.jobs.runAt}, ${schema.jobs.createdAt}, ${claimTime})",
    );
    expect(queue).toContain("coalesce(${schema.jobs.attempts}, 0) = ${expectedAttempts}");
    expect(queue).not.toContain("base.claimJob(");
    expect(queue).not.toContain("base.claimJobById(");

    const helperStart = queue.indexOf("async function claimEligibleJob");
    const helperEnd = queue.indexOf(
      "export async function claimJob(db: QueueDb",
      helperStart,
    );
    const claimHelper = queue.slice(helperStart, helperEnd);
    expect(claimHelper).toContain("retryBudgetRemaining");
    expect(claimHelper).toContain("runAtDue(claimTime)");
    expect(claimHelper).toContain("claimOrder(claimTime)");
    expect(claimHelper).toContain("const expectedStatus = job.status");
    expect(claimHelper).toContain("if (!expectedStatus) return null");
    expect(claimHelper).toContain("attemptCountEquals(expectedAttempts)");
    expect(claimHelper).toContain("eq(schema.jobs.status, expectedStatus)");
    expect(claimHelper).not.toContain("eq(schema.jobs.status, job.status)");
    expect(claimHelper).toContain("attempts: expectedAttempts + 1");

    const claimStart = queue.indexOf("export async function claimJob(");
    const claimEnd = queue.indexOf("export async function claimJobById", claimStart);
    const claim = queue.slice(claimStart, claimEnd);
    expect(claim).toContain("return claimEligibleJob(db, { typeFilter })");
    expect(claim).not.toContain("pending ??");
    expect(claim).not.toContain('status: "pending"');
    expect(claim).not.toContain('status: "failed"');

    const byIdStart = queue.indexOf("export async function claimJobById");
    const byIdEnd = queue.indexOf("/**\n * Commit completion", byIdStart);
    const byIdClaim = queue.slice(byIdStart, byIdEnd);
    expect(byIdClaim).toContain("return claimEligibleJob(db, { jobId, userId })");
    expect(byIdClaim).not.toContain("pending ??");
  });

  it("fences stale recovery to the selected nullable attempt before resetting it", () => {
    const recovery = queue.slice(queue.indexOf("export async function recoverStaleJobs"));
    expect(recovery).toContain("const expectedAttempts = Number(job.attempts ?? 0)");
    expect(recovery).toContain("attemptCountEquals(expectedAttempts)");
    expect(recovery).toContain("startedAt: null");
    expect(recovery).toContain("finishedAt: exhausted ? new Date() : null");
  });

  it("uses the documented zero-based retry schedule for one-based claimed attempts", () => {
    expect(queue).toContain("base.backoffSeconds(Math.max(attempts - 1, 0))");
  });

  it("uses fenced semantics in both serverless and persistent workers", () => {
    expect(routes).toContain("completeClaimedJob");
    expect(queue).toContain("await completeClaimedJob(db, job)");
    expect(queue).not.toContain("return base.startWorker(");
  });

  it("does not wildcard-export unsafe base consumer helpers", () => {
    expect(queue).not.toContain('export * from "./job-queue-base"');
    const publicExportSection = queue.slice(0, queue.indexOf("export type JobType"));
    expect(publicExportSection).not.toMatch(/\bcompleteJob\b/);
    expect(publicExportSection).not.toMatch(/\bclaimJobById\b/);
    expect(publicExportSection).not.toMatch(/\brecoverStaleJobs\b/);
    expect(publicExportSection).not.toMatch(/\bstartWorker\b/);
  });

  it("keeps every production import on the attempt-fenced facade", () => {
    const offenders = collectSourceFiles(srcRoot)
      .filter((path) => path !== queueFacadePath && path !== queueBasePath)
      .filter((path) => readFileSync(path, "utf8").includes("job-queue-base"))
      .map((path) => relative(srcRoot, path));

    expect(offenders).toEqual([]);
  });
});

const starter = STRIPE_PLANS.find((plan) => plan.id === "starter");
if (!starter) throw new Error("Starter plan is missing from the Stripe catalog");
const starterPriceId = planPriceId(starter, "month");

function invoiceWithLines(lines: Array<Record<string, unknown>>) {
  return {
    lines: { data: lines },
  } as unknown as Parameters<typeof basePlanInvoiceShare>[0];
}

describe("Stripe invoice-line runtime shape", () => {
  it("recognizes the current Basil/Dahlia pricing.price_details shape", () => {
    expect(starterPriceId).toBeTruthy();
    const invoice = invoiceWithLines([
      {
        amount: 1500,
        pricing: {
          type: "price_details",
          price_details: { price: starterPriceId },
        },
      },
      {
        amount: 500,
        pricing: {
          type: "price_details",
          price_details: { price: "price_unmapped_addon" },
        },
      },
    ]);

    expect(basePlanInvoiceShare(invoice)).toBe(0.75);
  });

  it("keeps compatibility with legacy expanded invoice-line prices", () => {
    const invoice = invoiceWithLines([
      {
        amount: 1900,
        price: {
          id: "price_legacy_expanded",
          metadata: { wireline_plan_id: "starter" },
        },
      },
    ]);

    expect(basePlanInvoiceShare(invoice)).toBe(1);
  });

  it("does not reverse subscription allowance for an add-on-only invoice", () => {
    const invoice = invoiceWithLines([
      {
        amount: 1500,
        pricing: {
          type: "price_details",
          price_details: { price: "price_unmapped_addon" },
        },
      },
    ]);

    expect(basePlanInvoiceShare(invoice)).toBeNull();
  });
});
