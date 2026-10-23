import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { shouldEnrichPostCall } from "../src/lib/post-call-digest";
import {
  emailResultAcceptedForRecipient,
  postCallFollowUpAction,
  sendEmailDraftAlreadyDelivered,
} from "../src/lib/post-call-follow-up";

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

  it("skips a draft email when the live tool already accepted that recipient", () => {
    const accepted =
      "SUBMISSION_OK: Email accepted by the sending service for Dana@Example.com. Confirm briefly.";
    const email = {
      type: "send_email" as const,
      priority: "medium" as const,
      reasoning: "Promised the overview.",
      payload: { to: "dana@example.com", subject: "Overview", body: "Hi" },
    };
    expect(emailResultAcceptedForRecipient(accepted, "dana@example.com")).toBe(true);
    expect(emailResultAcceptedForRecipient(accepted, "other@example.com")).toBe(false);
    expect(
      emailResultAcceptedForRecipient("The email send was not confirmed.", email.payload.to),
    ).toBe(false);
    expect(sendEmailDraftAlreadyDelivered(email, [accepted])).toBe(true);
    expect(
      sendEmailDraftAlreadyDelivered(
        { ...email, payload: { ...email.payload, to: "other@example.com" } },
        [accepted],
      ),
    ).toBe(false);
    expect(
      sendEmailDraftAlreadyDelivered(
        {
          type: "create_internal_task",
          priority: "medium",
          reasoning: "Take a message.",
          payload: { description: "Message for Michael" },
        },
        [accepted],
      ),
    ).toBe(false);
    const worker = read("src/lib/job-worker-base.ts");
    const extraction = worker.slice(worker.indexOf('if (job.type === "v2a_action_extraction")'));
    expect(extraction).toContain("completedSendEmailResults(p.userId, p.callId)");
    expect(extraction).toContain("sendEmailDraftAlreadyDelivered(action, completedEmailSends)");
    expect(
      extraction.indexOf("sendEmailDraftAlreadyDelivered(action, completedEmailSends)"),
    ).toBeLessThan(extraction.indexOf('type: "execute_action"'));
  });

  it("queues enrichment from the digest and keeps every follow-up a draft", () => {
    const digest = read("src/lib/post-call-digest.ts");
    expect(digest).toContain('type: "post_call_enrichment",');
    expect(digest).toContain("queuePostCallEnrichment(job, ctx, coreBase.outcomeTag)");
    const worker = read("src/lib/job-worker-base.ts");
    expect(worker).toContain("actions.map(postCallFollowUpAction)");
    expect(worker).toContain('autonomy: "draft",');
    expect(worker).toContain('p.autonomy === "draft" ? "draft" : undefined');
    // The digest logs the call to the CRM. Enrichment does not score it again.
    expect(worker).not.toContain("crm.logCall(");
    expect(worker).not.toContain("claudeBrain.postCallAnalysis(");
  });

  it("queues follow-up extraction once, before scoring, and retries a failed enqueue", () => {
    const worker = read("src/lib/job-worker-base.ts");
    const enrichment = worker.slice(worker.indexOf('if (job.type === "post_call_enrichment")'));
    // The independent draft survives an unavailable scoring provider, and a
    // retry finds the existing extraction instead of drafting twice.
    expect(enrichment.indexOf("await enqueueActionExtractionOnce(job, p);")).toBeGreaterThan(-1);
    expect(enrichment.indexOf("await enqueueActionExtractionOnce(job, p);")).toBeLessThan(
      enrichment.indexOf('event: "call.completed"'),
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

  it("keeps follow-up extraction and does not spend a sales-analysis model call", () => {
    const worker = read("src/lib/job-worker-base.ts");
    const enrichment = worker.slice(
      worker.indexOf('if (job.type === "post_call_enrichment")'),
      worker.indexOf('if (job.type === "v2a_action_extraction")'),
    );
    expect(enrichment).toContain("if (!transcript?.trim()) return;");
    expect(enrichment).toContain("await enqueueActionExtractionOnce(job, p);");
    expect(enrichment).not.toContain("claudeBrain.postCallAnalysis(");
    expect(enrichment).toContain('event: "call.completed"');
    expect(enrichment).toContain("enrichment: null");
    const qa = worker.slice(worker.indexOf('if (job.type === "auto_qa_score")'));
    expect(qa).toContain("sales rubric is not part of the call report");
    expect(qa).not.toContain("claudeBrain.qaScore");
  });
});
