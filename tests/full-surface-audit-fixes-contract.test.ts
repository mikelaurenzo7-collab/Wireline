import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

// Pins the 2026-08-15 full-surface audit fixes. Every block below closed a
// silent data-loss or dead-code defect: a feature that shipped, was paid for,
// and never actually ran. If one of these assertions starts failing, the
// regression is a product surface quietly reporting zero — not a style nit.

describe("live-voice knowledge retrieval", () => {
  const live = read("src/lib/voice/openai-live-agent-service.ts");

  it("scores full entries and excerpts only on output", () => {
    // Entries were truncated to 900 chars BEFORE scoring, so anything
    // documented past the first ~900 characters of a Training entry scored
    // zero and was dropped: the agent said it had no approved answer while
    // the answer sat in its own knowledge base. The PSTN path already uses
    // excerptAroundMatch, so the browser live-voice path must stay aligned.
    expect(live).toContain("function excerptAroundMatch(");
    expect(live).toContain("MAX_LIVE_KB_RESULT_CHARS");
    // The snippet set that feeds scoring must not be pre-truncated.
    const snippetsIdx = live.indexOf("const snippets: Snippet[] = [");
    const matchesIdx = live.indexOf("const matches = snippets", snippetsIdx);
    expect(snippetsIdx).toBeGreaterThan(0);
    expect(live.slice(snippetsIdx, matchesIdx)).not.toContain("trimLine(item.content, 900)");
    // …and the excerpt is applied to what is returned.
    expect(live).toContain("content: excerptAroundMatch(row.item.content, queryTokens)");
  });
});

describe("call-log reliability truth", () => {
  const handlers = read("src/lib/voice/openai-sip-session.ts");

  it("the claimed OpenAI call row receives the session's terminal reliability outcome", () => {
    const claimIdx = handlers.indexOf("let callLogId = preclaimedCallLogId ?? null");
    const sessionIdx = handlers.indexOf(
      "outcome = await runRealtimeSession(input, runtime, ownerFence.signal)",
    );
    const finalizerIdx = handlers.indexOf("async function persistFinishedCall");
    const enqueueIdx = handlers.indexOf("await enqueuePostCallDigest(", finalizerIdx);
    expect(claimIdx).toBeGreaterThan(0);
    expect(sessionIdx).toBeGreaterThan(claimIdx);
    expect(finalizerIdx).toBeGreaterThan(0);
    expect(enqueueIdx).toBeGreaterThan(finalizerIdx);
    const terminalWrite = handlers.slice(finalizerIdx, enqueueIdx);
    expect(terminalWrite).toContain("toolCallsTotal: input.toolCallsTotal");
    expect(terminalWrite).toContain("toolCallsFailed: input.toolCallsFailed");
    expect(terminalWrite).toContain(
      "COALESCE(${schema.callLogs.escalationAttempted}, false) OR ${input.escalationAttempted}",
    );
    expect(terminalWrite).toContain(
      "COALESCE(${schema.callLogs.escalationSucceeded}, false) OR ${input.escalationSucceeded}",
    );
    expect(terminalWrite).not.toContain("stagedReliability?.toolCallsTotal ?? 0");
  });

  it("call.escalated fires off the recorded escalation, not an impossible intent label", () => {
    // intent_label is a constrained enum ("high" | "medium" | "low" | "none"),
    // so `intent === "escalation"` could never be true: the documented
    // call.escalated webhook was unreachable for every tenant since it shipped.
    expect(read("src/lib/ai-brains.ts")).toContain('enum: ["high", "medium", "low", "none"]');
    const digest = read("src/lib/post-call-digest.ts");
    const legacyWorker = read("src/lib/job-worker-base.ts");
    expect(legacyWorker).not.toContain('intent === "escalation"');
    expect(digest).toContain("if (!input.escalationAttempted) return null");
    expect(digest).toContain("escalation_succeeded: Boolean(input.escalationSucceeded)");
    // The durable workflow rehydrates both values from the tenant-scoped call row.
    expect(digest).toContain("escalationAttempted: schema.callLogs.escalationAttempted");
    expect(digest).toContain("escalationSucceeded: schema.callLogs.escalationSucceeded");
    expect(digest).toContain('"escalationWebhook",');
    expect(digest).toContain("enqueueCallEscalatedWebhookOnce({");
  });
});

describe("suspended-line compliance evidence", () => {
  const admission = read("src/lib/voice/native-inbound-admission.ts");
  const session = read("src/lib/voice/openai-sip-session.ts");

  it("a suspended line still logs its calls and captures opt-outs", () => {
    expect(admission).toContain('mode: "suspended"');
    expect(session).toContain('hangupAfterOpening = inboundAdmissionMode(input) === "suspended"');
    expect(session).toContain("persistFinishedCall({");
    expect(session).toContain("persistTranscriptDncSuppression({");
    expect(session).toContain('endedReason = "line-suspended"');
  });
});

describe("voice bookings are real records", () => {
  const calendar = read("src/lib/bot-tools/calendar.ts");

  it("a booked appointment is persisted, not only pushed to the tenant's calendar", () => {
    // bookAppointment only reached Google/Microsoft. Nothing wrote
    // wireline_appointments, so the dashboard count, goals tracker, daily
    // brief, and scheduled report all read zero bookings no matter how many
    // the agent made.
    expect(calendar).toContain("context.drizzle.insert(schema.appointments).values({");
    expect(calendar).toContain('status: "Scheduled"');
    expect(calendar).toContain("callId:");
    // Best-effort: the caller was already told the booking is confirmed.
    expect(calendar).toContain("Voice booking calendar write succeeded but appointment row failed");
  });
});

describe("inbox refresh honesty", () => {
  const integrations = read("src/lib/integrations.ts");
  const sync = read("src/routes/email-sync-routes.ts");

  it("an unreachable mailbox is reported, not rendered as an empty one", () => {
    // Per-account fetch failures were swallowed and [] returned, so a revoked
    // OAuth grant or expired refresh token produced a cheerful "No new inbox
    // messages found." forever while mail piled up unreachable.
    expect(integrations).toContain("export type InboxFetchResult");
    expect(integrations).toContain("failures: InboxFetchFailure[]");
    expect(integrations).toContain("failures.push({ provider:");
    expect(sync).toContain("const { messages, failures } = await service.fetchInboxMessages(");
    expect(sync).toContain('code: "EMAIL_MAILBOX_UNREACHABLE"');
    expect(sync).toContain("failed_providers");
    // Partial reach is named too — a silent partial sync reads as a full one.
    expect(sync).toContain("Inbox partially refreshed.");
  });
});

describe("SMS reply failure reasons", () => {
  const threads = read("src/components/SmsThreads.tsx");

  it("a compliance block explains itself instead of collapsing to Send failed", () => {
    // Carrier rejections ride `reason` on a 200; compliance stops (DNC,
    // federal DNC unconfigured) throw an AppError and ride `error`. Reading
    // only `reason` turned every compliance block into a bare "Send failed".
    expect(threads).toContain(
      'const message = result?.reason || result?.error || "Text could not be sent.";',
    );
    expect(threads).toContain("setThreadErr(message)");
    expect(threads).toContain(
      'toastError(definitiveRejection ? "SMS send rejected" : "SMS send interrupted", message)',
    );
  });
});

describe("realtime session mint bounds", () => {
  const realtime = read("src/lib/voice/openai-realtime-service.ts");
  const callControl = read("src/lib/voice/openai-realtime-call-control.ts");

  it("the ephemeral client secret has an explicit, short lifetime", () => {
    // Every mint durably debits five simulation minutes and books a platform
    // cost reserve BEFORE the secret is handed out. An unbounded secret let a
    // client stockpile paid-for tokens and redeem them long after the debit.
    expect(callControl).toContain("OPENAI_REALTIME_SECRET_TTL_SECONDS");
    expect(callControl).toMatch(
      /expires_after:\s*\{[\s\S]*anchor:\s*"created_at",[\s\S]*seconds:\s*OPENAI_REALTIME_SECRET_TTL_SECONDS/,
    );
    // The model pin the earlier audit installed must survive this change.
    expect(realtime).toContain("model: OPENAI_REALTIME_DEFAULT_MODEL");
  });
});
