import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { shouldEnrichPostCall } from "../src/lib/post-call-digest";
import {
  addressedToCaller,
  emailResultAcceptedForRecipient,
  postCallFollowUpAction,
  postCallFollowUpFinisher,
  postCallFollowUpHandBack,
  liveEmailAlreadyHandled,
  liveTextAlreadyHandled,
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
    expect(liveEmailAlreadyHandled(email, [accepted])).toBe(true);
    expect(liveEmailAlreadyHandled(email, ["DRAFT_SAVED: Dana@example.com\nPending review."])).toBe(
      true,
    );
    expect(
      liveEmailAlreadyHandled(email, ["DRAFT_SAVED: other@example.com\nPending review."]),
    ).toBe(false);
    expect(emailResultAcceptedForRecipient("DRAFT_SAVED: Dana@example.com", email.payload.to)).toBe(
      false,
    );
    expect(
      liveEmailAlreadyHandled(
        { ...email, payload: { ...email.payload, to: "other@example.com" } },
        [accepted],
      ),
    ).toBe(false);
    expect(
      liveEmailAlreadyHandled(
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
    expect(extraction).toContain("liveEmailAlreadyHandled(action, completedEmailSends)");
    expect(extraction.indexOf("liveEmailAlreadyHandled(action, completedEmailSends)")).toBeLessThan(
      extraction.indexOf('type: "execute_action"'),
    );
  });

  it("keeps the follow-up when the receipt names a different mailbox", () => {
    const receipt =
      "SUBMISSION_OK: Email accepted by the sending service for Dana+jobs@Example.com.au. Confirm briefly.";
    const action = {
      type: "send_email" as const,
      priority: "medium" as const,
      reasoning: "Caller corrected the address.",
      payload: { to: "dana+jobs@example.com", subject: "Appointment", body: "Details" },
    };
    expect(liveEmailAlreadyHandled(action, [receipt])).toBe(false);
    expect(emailResultAcceptedForRecipient(receipt, "jobs@example.com.au")).toBe(false);
    expect(emailResultAcceptedForRecipient(receipt, " DANA+jobs@example.com.au ")).toBe(true);
    const historicalReceipt =
      'SUBMISSION_OK: Email accepted by the sending service for Dana@Example.com. Tell the caller: "I sent it."';
    expect(emailResultAcceptedForRecipient(historicalReceipt, "dana@example.com")).toBe(true);
    expect(
      emailResultAcceptedForRecipient(
        receipt + " Contact support@example.com.",
        "support@example.com",
      ),
    ).toBe(false);
  });

  it("queues enrichment from the digest and lets the Bot finish what is not a guess", () => {
    const digest = read("src/lib/post-call-digest.ts");
    expect(digest).toContain('type: "post_call_enrichment",');
    expect(digest).toContain("queuePostCallEnrichment(job, ctx, coreBase.outcomeTag)");
    const worker = read("src/lib/job-worker-base.ts");
    expect(worker).toContain("actions.map(postCallFollowUpAction)");
    expect(worker).toContain("const action = addressedToCaller(extracted, p.customerNumber);");
    // Only a follow-up the owner has to finish is forced to wait. Everything
    // else runs at the Bot's own permission.
    expect(worker).toContain(
      `...(postCallFollowUpFinisher(action, p.customerNumber) === "owner"
            ? { autonomy: "draft" as const }
            : {}),`,
    );
    expect(worker).not.toContain("the owner approves every one");
    expect(worker).toContain('p.autonomy === "draft" ? "draft" : undefined');
    // The digest logs the call to the CRM. Enrichment does not score it again.
    expect(worker).not.toContain("crm.logCall(");
    expect(worker).not.toContain("claudeBrain.postCallAnalysis(");
  });

  const text = (to: string) => ({
    type: "send_text_message" as const,
    priority: "medium" as const,
    reasoning: "Caller asked for the address by text.",
    payload: { to, body: "We are at 12 Main St." },
  });

  it("lets the Bot finish a text back to the number that was on the call", () => {
    expect(postCallFollowUpFinisher(text("+17735550100"), "+17735550100")).toBe("bot");
    // The same number written two ways is still the caller.
    expect(postCallFollowUpFinisher(text("+1 (773) 555-0100"), "+17735550100")).toBe("bot");
    // A note for the owner is the Bot's to write.
    expect(
      postCallFollowUpFinisher(
        {
          type: "create_internal_task",
          priority: "medium",
          reasoning: "Take a message.",
          payload: { description: "Call Dana back about the quote." },
        },
        "+17735550100",
      ),
    ).toBe("bot");
  });

  it("texts the caller at the number the carrier supplied, not the transcript's spelling", () => {
    // The model read the number back the way it was spoken.
    const spoken = text("773-555-0100");
    expect(postCallFollowUpFinisher(spoken, "+17735550100")).toBe("bot");
    expect(addressedToCaller(spoken, "+17735550100").payload.to).toBe("+17735550100");
    expect(addressedToCaller(text("1 (773) 555-0100"), "+17735550100").payload.to).toBe(
      "+17735550100",
    );
    // A different number is left exactly as written, for the owner to see.
    expect(addressedToCaller(text("773-555-0199"), "+17735550100").payload.to).toBe("773-555-0199");
    expect(addressedToCaller(spoken, null)).toBe(spoken);
    // Outside the US the two must match digit for digit.
    expect(postCallFollowUpFinisher(text("7735550100"), "+447735550100")).toBe("owner");
    expect(postCallFollowUpFinisher(text("+44 7735 550100"), "+447735550100")).toBe("bot");
    // Too short to be a number is never the caller.
    expect(postCallFollowUpFinisher(text("0100"), "0100")).toBe("owner");
    // The same spelling difference does not text the caller twice.
    expect(liveTextAlreadyHandled(spoken, ["SMS sent to +17735550100."])).toBe(true);
    const email = {
      type: "send_email" as const,
      priority: "medium" as const,
      reasoning: "Promised a quote.",
      payload: { to: "dana@example.com", subject: "Your quote", body: "Hi" },
    };
    expect(addressedToCaller(email, "+17735550100")).toBe(email);
  });

  it("leaves the owner an email nobody read back and a text to a different number", () => {
    // New outreach: the owner has to confirm they have permission to make it.
    expect(postCallFollowUpFinisher(text("+17735550199"), "+17735550100")).toBe("owner");
    // No caller number on record means no number the carrier vouched for.
    expect(postCallFollowUpFinisher(text("+17735550100"), null)).toBe("owner");
    expect(postCallFollowUpFinisher(text("+17735550100"), "")).toBe("owner");
    expect(postCallFollowUpFinisher(text(""), "+17735550100")).toBe("owner");
    // The address was heard on the call, never confirmed with the caller.
    expect(
      postCallFollowUpFinisher(
        {
          type: "send_email",
          priority: "medium",
          reasoning: "Promised a quote.",
          payload: { to: "dana@example.com", subject: "Your quote", body: "Hi" },
        },
        "+17735550100",
      ),
    ).toBe("owner");
  });

  it("does not text the caller again when the Bot already texted during the call", () => {
    const followUp = text("+17735550100");
    expect(liveTextAlreadyHandled(followUp, ["SMS sent to +17735550100."])).toBe(true);
    expect(liveTextAlreadyHandled(followUp, ["WhatsApp sent to +17735550100."])).toBe(true);
    // An owner who asked to see texts first already has this one waiting.
    expect(
      liveTextAlreadyHandled(followUp, ["DRAFT_SAVED: +17735550100\nThe text is written."]),
    ).toBe(true);
    expect(liveTextAlreadyHandled(followUp, ["SMS sent to +17735550199."])).toBe(false);
    expect(liveTextAlreadyHandled(followUp, ["The message was not confirmed. Try later."])).toBe(
      false,
    );
    expect(liveTextAlreadyHandled(followUp, [])).toBe(false);
    expect(
      liveTextAlreadyHandled(followUp, [null, 7, { result: "SMS sent to +17735550100." }]),
    ).toBe(false);
    // An email is not covered by a text receipt.
    expect(
      liveTextAlreadyHandled(
        {
          type: "send_email",
          priority: "medium",
          reasoning: "Promised a quote.",
          payload: { to: "+17735550100", subject: "Quote", body: "Hi" },
        },
        ["SMS sent to +17735550100."],
      ),
    ).toBe(false);
    const worker = read("src/lib/job-worker-base.ts");
    const extraction = worker.slice(worker.indexOf('if (job.type === "v2a_action_extraction")'));
    expect(extraction).toContain("completedSendTextResults(p.userId, p.callId)");
    expect(extraction.indexOf("liveTextAlreadyHandled(action, completedTextSends)")).toBeLessThan(
      extraction.indexOf('type: "execute_action"'),
    );
  });

  it("hands the owner a follow-up the Bot could not finish, and never drops it", () => {
    const followUp = { ...text("+17735550100"), agentId: "bot-1" };
    // Done, or already waiting for the owner: nothing more to do.
    expect(postCallFollowUpHandBack(followUp, { success: true })).toBeNull();
    expect(postCallFollowUpHandBack(followUp, { success: true, queued: true })).toBeNull();
    expect(postCallFollowUpHandBack(followUp, { success: false, queued: true })).toBeNull();

    // Nothing left the building and the owner can clear the cause: the same
    // message waits for the owner, with the reason beside it.
    const waiting = postCallFollowUpHandBack(followUp, {
      success: false,
      retryable: true,
      error: "Outside the hours this person can be contacted.",
    });
    expect(waiting).toEqual({
      autonomy: "draft",
      action: {
        ...followUp,
        payload: {
          ...followUp.payload,
          reasoning: "Not sent by your Bot: Outside the hours this person can be contacted.",
        },
      },
    });

    // The outcome is unknown: a note, never a second copy to send.
    const note = postCallFollowUpHandBack(followUp, {
      success: false,
      error: "The carrier did not confirm the text.",
    });
    expect(note?.autonomy).toBeUndefined();
    expect(note?.action.type).toBe("create_internal_task");
    expect(note?.action.agentId).toBe("bot-1");
    expect(note?.action.payload.description).toBe(
      "Your Bot could not confirm a text to +17735550100 was sent. " +
        "The carrier did not confirm the text. Check before sending it again. " +
        "The message was: We are at 12 Main St.",
    );
    expect(note?.action.payload).not.toHaveProperty("to");

    // A note the Bot failed to write is not turned into another note.
    expect(
      postCallFollowUpHandBack(
        {
          type: "create_internal_task",
          priority: "medium",
          payload: { description: "Call Dana back." },
        },
        { success: false, error: "Database unavailable." },
      ),
    ).toBeNull();

    const worker = read("src/lib/job-worker-base.ts");
    const execute = worker.slice(worker.indexOf('if (job.type === "execute_action")'));
    expect(execute).toContain(
      'p.autonomy === "draft" ? null : postCallFollowUpHandBack(parsed.data, result);',
    );
    // A hand-back that cannot be saved fails the job so the queue retries it.
    expect(execute).toContain("A follow-up the Bot could not finish was not saved for the owner:");
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
