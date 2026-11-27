import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { shouldEnrichPostCall } from "../src/lib/post-call-digest";
import {
  addressedToCaller,
  completedOnCall,
  emailResultAcceptedForRecipient,
  liveEmailAlreadyHandled,
  liveTextOutcome,
  planPostCallFollowUp,
  postCallFollowUpAction,
  postCallFollowUpHandBack,
  samePhoneNumber,
  withReasonForOwner,
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
      '...(plan.finisher === "owner" ? { autonomy: "draft" as const } : {}),',
    );
    expect(worker).not.toContain("the owner approves every one");
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
  const email = {
    type: "send_email" as const,
    priority: "medium" as const,
    reasoning: "Promised a quote.",
    payload: { to: "dana@example.com", subject: "Your quote", body: "Hi" },
  };
  const untouched = { callerNumber: "+17735550100", liveText: "none" as const };

  it("lets the Bot finish a text back to the number that was on the call", () => {
    expect(planPostCallFollowUp(text("+17735550100"), untouched)).toEqual({ finisher: "bot" });
    // The same number written two ways is still the caller.
    expect(planPostCallFollowUp(text("+1 (773) 555-0100"), untouched)).toEqual({
      finisher: "bot",
    });
    // A note for the owner is the Bot's to write.
    expect(
      planPostCallFollowUp(
        {
          type: "create_internal_task",
          priority: "medium",
          reasoning: "Take a message.",
          payload: { description: "Call Dana back about the quote." },
        },
        untouched,
      ),
    ).toEqual({ finisher: "bot" });
  });

  it("texts the caller at the number the carrier supplied, not the transcript's spelling", () => {
    // The model read the number back the way it was spoken.
    const spoken = text("773-555-0100");
    expect(planPostCallFollowUp(spoken, untouched)).toEqual({ finisher: "bot" });
    expect(addressedToCaller(spoken, "+17735550100").payload.to).toBe("+17735550100");
    expect(addressedToCaller(text("1 (773) 555-0100"), "+17735550100").payload.to).toBe(
      "+17735550100",
    );
    // A different number is left exactly as written, for the owner to see.
    expect(addressedToCaller(text("773-555-0199"), "+17735550100").payload.to).toBe("773-555-0199");
    expect(addressedToCaller(spoken, null)).toBe(spoken);
    expect(addressedToCaller(email, "+17735550100")).toBe(email);
  });

  it("never takes two different people for the same number", () => {
    // A number written with a country code is taken at its word. Norway's
    // +47 912 34 567 has the same ten digits as a US number and is not it.
    expect(samePhoneNumber("+4791234567", "+14791234567")).toBe(false);
    expect(samePhoneNumber("+3612345678", "+13612345678")).toBe(false);
    expect(samePhoneNumber("+447735550100", "+17735550100")).toBe(false);
    // Only a form with no country code is read as a US number.
    expect(samePhoneNumber("479-123-4567", "+14791234567")).toBe(true);
    expect(samePhoneNumber("479-123-4567", "+4791234567")).toBe(false);
    expect(samePhoneNumber("+44 7735 550100", "+447735550100")).toBe(true);
    // Too short, or missing, is nobody.
    expect(samePhoneNumber("0100", "0100")).toBe(false);
    expect(samePhoneNumber("", "")).toBe(false);
    expect(samePhoneNumber(null, "+17735550100")).toBe(false);
    expect(samePhoneNumber(undefined, undefined)).toBe(false);
  });

  it("leaves the owner an email and a text to a different number, and says why", () => {
    const other = planPostCallFollowUp(text("+17735550199"), untouched);
    expect(other).toEqual({
      finisher: "owner",
      why: "This is not the number that called. Send it only if you have permission to text it.",
    });
    // No caller number on record means no number the carrier vouched for.
    expect(
      planPostCallFollowUp(text("+17735550100"), { callerNumber: null, liveText: "none" }).finisher,
    ).toBe("owner");
    expect(
      planPostCallFollowUp(text("+17735550100"), { callerNumber: "", liveText: "none" }).finisher,
    ).toBe("owner");
    expect(planPostCallFollowUp(text(""), untouched).finisher).toBe("owner");
    // The address was heard on the call, never confirmed with the caller.
    expect(planPostCallFollowUp(email, untouched)).toEqual({
      finisher: "owner",
      why: "The address was heard on the call and not read back to the caller. Check it before you send.",
    });
    // The reason travels with the message to the owner's list.
    expect(withReasonForOwner(email, "Check the address.").payload).toEqual({
      ...email.payload,
      reasoning: "Check the address.",
    });
  });

  it("reads what the live text tool did on the call", () => {
    const caller = "+17735550100";
    expect(liveTextOutcome(caller, [])).toBe("none");
    expect(
      liveTextOutcome(caller, [{ status: "completed", result: "SMS sent to +17735550100." }]),
    ).toBe("sent");
    expect(
      liveTextOutcome(caller, [{ status: "completed", result: "WhatsApp sent to +17735550100." }]),
    ).toBe("sent");
    expect(
      liveTextOutcome(caller, [
        { status: "completed", result: "DRAFT_SAVED: +17735550100\nThe text is written." },
      ]),
    ).toBe("held");
    // A clean text to someone else says nothing about this caller.
    expect(
      liveTextOutcome(caller, [{ status: "completed", result: "SMS sent to +17735550199." }]),
    ).toBe("none");
    // The carrier never answered: a text may or may not have arrived.
    expect(
      liveTextOutcome(caller, [
        {
          status: "completed",
          result:
            "The message was not confirmed. Delivery status is unknown. The message may have been accepted. Do not resend it.",
        },
      ]),
    ).toBe("unsettled");
    // A record that never finished is no receipt either.
    expect(liveTextOutcome(caller, [{ status: "processing", result: "" }])).toBe("unsettled");
    expect(liveTextOutcome(caller, [{ status: "failed", result: "" }])).toBe("unsettled");
    expect(liveTextOutcome(caller, [{ status: null, result: "SMS sent to +17735550100." }])).toBe(
      "unsettled",
    );
    // One unsettled attempt outweighs a clean one.
    expect(
      liveTextOutcome(caller, [
        { status: "completed", result: "SMS sent to +17735550100." },
        { status: "processing", result: "" },
      ]),
    ).toBe("unsettled");
  });

  it("does not let the Bot text again when it texted, or tried to, during the call", () => {
    const followUp = text("+17735550100");
    const during = (liveText: "sent" | "held" | "unsettled") =>
      planPostCallFollowUp(followUp, { callerNumber: "+17735550100", liveText });
    expect(during("sent")).toEqual({
      finisher: "owner",
      why: "Your Bot already texted this number during the call. Send this only if it says something new.",
    });
    expect(during("held")).toEqual({
      finisher: "owner",
      why: "A text to this number is already waiting from the call. Send this only if it says something new.",
    });
    expect(during("unsettled")).toEqual({
      finisher: "owner",
      why: "Your Bot tried to text during the call and the result is not known. Check Texts before you send, so the caller is not texted twice.",
    });
  });

  it("tells the extraction what the Bot already did, so it is not read out again", () => {
    expect(
      completedOnCall({
        emailResults: [
          "SUBMISSION_OK: Email accepted by the sending service for dana@example.com. Confirm briefly.",
          "DRAFT_SAVED: sam@example.com\nPending review.",
          "The email send was not confirmed.",
          7,
        ],
        textAttempts: [
          { status: "completed", result: "SMS sent to +17735550100." },
          { status: "completed", result: "DRAFT_SAVED: +17735550199\nThe text is written." },
          { status: "processing", result: "" },
          { status: "completed", result: "The message was not confirmed." },
        ],
      }),
    ).toEqual([
      "Sent an email to dana@example.com.",
      "Wrote an email to sam@example.com for the owner to send.",
      "Sent a text to +17735550100.",
      "Wrote a text to +17735550199 for the owner to send.",
    ]);
    expect(completedOnCall({ emailResults: [], textAttempts: [] })).toEqual([]);
    const brains = read("src/lib/ai-brains.ts");
    expect(brains).toContain("Already done during the call:");
    expect(brains).toContain(
      "Emit send_text_message only when the caller asked for a text or agreed to receive one",
    );
    const worker = read("src/lib/job-worker-base.ts");
    expect(worker).toContain(
      "completedOnCall: completedOnCall({ emailResults: completedEmailSends, textAttempts }),",
    );
  });

  it("hands the owner a follow-up that could not be finished, whoever was to finish it", () => {
    const followUp = { ...text("+17735550100"), agentId: "bot-1" };
    // Done, or already waiting for the owner: nothing more to do.
    expect(postCallFollowUpHandBack(followUp, { success: true }, "auto")).toBeNull();
    expect(postCallFollowUpHandBack(followUp, { success: true, queued: true }, "auto")).toBeNull();
    expect(
      postCallFollowUpHandBack(followUp, { success: false, queued: true }, "draft"),
    ).toBeNull();

    // The Bot tried, nothing left the building and the owner can clear the
    // cause: the same message waits for the owner, with the reason beside it.
    expect(
      postCallFollowUpHandBack(
        followUp,
        {
          success: false,
          retryable: true,
          error: "Outside the hours this person can be contacted.",
        },
        "auto",
      ),
    ).toEqual({
      kind: "draft",
      action: {
        ...followUp,
        payload: {
          ...followUp.payload,
          reasoning: "Not sent by your Bot: Outside the hours this person can be contacted.",
        },
      },
    });

    // The outcome is unknown: a note, never a second copy to send.
    expect(
      postCallFollowUpHandBack(
        followUp,
        { success: false, error: "The carrier did not confirm the text." },
        "auto",
      ),
    ).toEqual({
      kind: "note",
      priority: "medium",
      agentId: "bot-1",
      description:
        "Your Bot could not confirm a text to +17735550100 was sent. " +
        "The carrier did not confirm the text. Check before sending it again. " +
        "The message was: We are at 12 Main St.",
    });

    // It could not even be saved for the owner. That is a note too, never a
    // second attempt to save the same thing, whether or not it could be retried.
    for (const result of [
      { success: false, error: "No mailbox is connected." },
      { success: false, retryable: true, error: "No mailbox is connected." },
    ]) {
      expect(postCallFollowUpHandBack({ ...email, agentId: "bot-1" }, result, "draft")).toEqual({
        kind: "note",
        priority: "medium",
        agentId: "bot-1",
        description:
          "A caller asked for an email to dana@example.com and your Bot could not prepare it for you. " +
          "No mailbox is connected. The message was: Hi",
      });
    }

    // A note the Bot could not write is written again, as it was.
    expect(
      postCallFollowUpHandBack(
        {
          type: "create_internal_task",
          priority: "high",
          payload: { description: "Call Dana back." },
        },
        { success: false, error: "Database unavailable." },
        "auto",
      ),
    ).toEqual({ kind: "note", priority: "high", description: "Call Dana back." });
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
