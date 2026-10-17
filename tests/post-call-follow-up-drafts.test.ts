import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { shouldEnrichPostCall } from "../src/lib/post-call-digest";
import { postCallFollowUpAction } from "../src/lib/post-call-follow-up";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const SPOKE = "Agent: Thanks for calling.\nCaller: Can someone quote a water heater install?";

describe("post-call follow-up drafts", () => {
  it("enriches only real conversations with a Bot", () => {
    const call = {
      agentId: "bot-1",
      vapiCallId: "openai:call-1",
      transcript: SPOKE,
      sipCall: true,
      outcomeTag: "followup" as const,
    };
    expect(shouldEnrichPostCall(call)).toBe(true);
    expect(shouldEnrichPostCall({ ...call, demo: true })).toBe(false);
    expect(shouldEnrichPostCall({ ...call, agentId: null })).toBe(false);
    expect(shouldEnrichPostCall({ ...call, outcomeTag: "unreachable" })).toBe(false);
    expect(shouldEnrichPostCall({ ...call, outcomeTag: "dnc" })).toBe(false);
    // The Bot's greeting alone is not a conversation.
    expect(shouldEnrichPostCall({ ...call, transcript: "Agent: Thanks for calling." })).toBe(false);
  });

  it("turns a booking read from a transcript into a task for the owner", () => {
    const task = postCallFollowUpAction({
      type: "schedule_calendar",
      priority: "high",
      reasoning: "Caller asked for Saturday.",
      payload: {
        event_name: "Water heater quote",
        customer_name: "Dana",
        date: "2026-10-10",
        time: "09:00",
        timezone: "America/Chicago",
      },
    });
    expect(task.type).toBe("create_internal_task");
    expect(task.payload.description).toBe(
      "Dana asked to book Water heater quote on 2026-10-10 09:00 America/Chicago. " +
        "Check Calendar, and book it if your Bot did not on the call.",
    );
    const email = {
      type: "send_email" as const,
      priority: "medium" as const,
      reasoning: "Promised a quote.",
      payload: { to: "dana@example.com", subject: "Your quote", body: "Hi" },
    };
    expect(postCallFollowUpAction(email)).toBe(email);
  });

  it("queues enrichment from the digest and keeps every follow-up a draft", () => {
    const digest = read("src/lib/post-call-digest.ts");
    expect(digest).toContain('type: "post_call_enrichment",');
    expect(digest).toContain("queuePostCallEnrichment(job, ctx, coreBase.outcomeTag)");
    const worker = read("src/lib/job-worker-base.ts");
    expect(worker).toContain("actions.map(postCallFollowUpAction)");
    expect(worker).toContain('autonomy: "draft",');
    expect(worker).toContain('p.autonomy === "draft" ? "draft" : undefined');
    // The digest logs the call to the CRM; enrichment adds only the lead score.
    expect(worker).not.toContain("crm.logCall(");
    expect(worker).toContain("syncEnrichedLead(");
  });

  it("queues follow-up extraction once, before scoring, and retries a failed enqueue", () => {
    const worker = read("src/lib/job-worker-base.ts");
    const enrichment = worker.slice(worker.indexOf('if (job.type === "post_call_enrichment")'));
    // The independent draft survives an unavailable scoring provider, and a
    // retry finds the existing extraction instead of drafting twice.
    expect(enrichment.indexOf("await enqueueActionExtractionOnce(job, p);")).toBeGreaterThan(-1);
    expect(enrichment.indexOf("await enqueueActionExtractionOnce(job, p);")).toBeLessThan(
      enrichment.indexOf("analysisOptions.model && !process.env.OPENAI_API_KEY?.trim()"),
    );
    expect(enrichment.indexOf("await enqueueActionExtractionOnce(job, p);")).toBeLessThan(
      enrichment.indexOf("runInAuditContext(auditContext"),
    );
    const helper = worker.slice(
      worker.indexOf("async function enqueueActionExtractionOnce("),
      worker.indexOf("export async function handleJob("),
    );
    // A retry finds the extraction it already queued.
    expect(helper).toContain(
      "sql`${schema.jobs.payload}->>'enrichmentJobId' = ${enrichmentJob.id}`",
    );
    expect(helper).toContain("enrichmentJobId: enrichmentJob.id,");
    // `enqueue` reports failure instead of throwing; the worker must raise it.
    expect(helper).toContain(
      "if (!queued.ok) throw new Error(`Failed to enqueue V2A extraction: ${queued.error}`);",
    );
  });

  it("uses the managed low-cost OpenAI model for starter enrichment without fabricated fallback scores", () => {
    const worker = read("src/lib/job-worker-base.ts");
    const enrichment = worker.slice(
      worker.indexOf('if (job.type === "post_call_enrichment")'),
      worker.indexOf('if (job.type === "v2a_action_extraction")'),
    );
    expect(enrichment).toContain("postCallAnalysisOptions({");
    expect(enrichment).toContain("if (!transcript?.trim()) return;");
    expect(enrichment).toContain(
      'throw new Error("Structured AI runtime unavailable for post-call enrichment.")',
    );
    expect(enrichment).toContain("analysisOptions.model && !process.env.OPENAI_API_KEY?.trim()");
    expect(enrichment).toContain("claudeBrain.postCallAnalysis(");
    expect(enrichment).toContain("analysisOptions,");
    expect(enrichment).not.toContain("geminiBrain.postCallAnalysis");
    expect(enrichment).toContain("const auditContext = createAuditContext();");
    expect(enrichment).toContain("if (auditContext.records.length) {");
    expect(enrichment).toContain("await persistRuntimeAuditRecords({");
    const analysis = read("src/lib/ai-brains.ts");
    expect(analysis).toContain("maxTokens: options.maxTokens ?? 4096");
    expect(analysis).toContain("...(options.model ? { model: options.model } : {})");
  });
});
