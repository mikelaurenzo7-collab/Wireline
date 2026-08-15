import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
/** Collapse whitespace so an assertion survives a Prettier reflow. */
const flat = (path: string) => read(path).replace(/\s+/g, " ");

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
    // the answer sat in its own knowledge base. Same defect the Vapi phone
    // path already fixed in excerptAroundMatch.
    expect(live).toContain("function excerptAroundMatch(");
    expect(live).toContain("MAX_LIVE_KB_RESULT_CHARS");
    expect(flat("src/lib/voice/openai-live-agent-service.ts")).toContain(
      "// Full content — the excerpt window is applied on OUTPUT, never before // scoring.",
    );
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
  const handlers = read("src/lib/vapi-handlers.ts");

  it("the outbound placeholder finalize merges reliability instead of zeroing it", () => {
    // Outbound calls own a placeholder row from dial time, so
    // recordToolCallBatch/recordEscalationOutcome write live counters straight
    // onto that row and the staging table stays empty. Writing `staged ?? 0`
    // over it erased every tool call and escalation captured during the call.
    expect(handlers).toContain("const reliabilityPatch = stagedReliability");
    expect(handlers).toContain("...reliabilityPatch,");
    expect(handlers).toContain("COALESCE(${schema.callLogs.toolCallsTotal}, 0) +");
    expect(handlers).toContain("COALESCE(${schema.callLogs.escalationAttempted}, false) OR");
    // The finalize UPDATE must no longer set these columns unconditionally.
    const finalizeIdx = handlers.indexOf("const finalized = await drizzle");
    const whereIdx = handlers.indexOf(".where(", finalizeIdx);
    expect(finalizeIdx).toBeGreaterThan(0);
    expect(handlers.slice(finalizeIdx, whereIdx)).not.toContain(
      "toolCallsTotal: stagedReliability?.toolCallsTotal ?? 0",
    );
  });

  it("call.escalated fires off the recorded escalation, not an impossible intent label", () => {
    // intent_label is a constrained enum ("high" | "medium" | "low" | "none"),
    // so `intent === "escalation"` could never be true: the documented
    // call.escalated webhook and the Slack escalation alert were unreachable
    // for every tenant since they shipped.
    expect(read("src/lib/ai-brains.ts")).toContain('enum: ["high", "medium", "low", "none"]');
    expect(handlers).not.toContain('intent === "escalation"');
    expect(handlers).toContain("if (escalationOutcome.attempted) {");
    expect(handlers).toContain("escalation_succeeded: escalationOutcome.succeeded");
    // The outcome is read back from the same write that persisted it.
    expect(handlers).toContain("escalationAttempted: schema.callLogs.escalationAttempted");
  });
});

describe("suspended tenant compliance evidence", () => {
  const webhook = read("src/routes/vapi-v2.ts");

  it("a suspended line still logs its calls and captures opt-outs", () => {
    // A suspended line still answers (with the suspension assistant), so a
    // real call happens. 403-ing its end-of-call-report threw away the call
    // log, the transcript DNC/opt-out capture, and the TCPA evidence. A legal
    // opt-out is not conditional on billing state.
    expect(webhook).toContain('if (message?.type !== "end-of-call-report") {');
    expect(flat("src/routes/vapi-v2.ts")).toContain(
      "// end-of-call-report is deliberately NOT denied.",
    );
    // Everything else on a suspended line stays denied.
    expect(webhook).toContain(
      'return res.status(403).json({ code: "ERROR", error: "Access Denied" });',
    );
  });
});

describe("voice bookings are real records", () => {
  const calendar = read("src/routes/vapi/tool-handlers-calendar.ts");

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
    expect(threads).toContain("if (!response.ok || !result.ok) {");
    expect(threads).toContain('throw new Error(result.reason || result.error || "Send failed");');
  });
});

describe("realtime session mint bounds", () => {
  const realtime = read("src/lib/voice/openai-realtime-service.ts");

  it("the ephemeral client secret has an explicit, short lifetime", () => {
    // Every mint durably debits five simulation minutes and books a platform
    // cost reserve BEFORE the secret is handed out. An unbounded secret let a
    // client stockpile paid-for tokens and redeem them long after the debit.
    expect(realtime).toContain("OPENAI_REALTIME_SECRET_TTL_SECONDS");
    expect(realtime).toContain(
      'expires_after: { anchor: "created_at", seconds: OPENAI_REALTIME_SECRET_TTL_SECONDS }',
    );
    // The model pin the earlier audit installed must survive this change.
    expect(realtime).toContain("model: OPENAI_REALTIME_DEFAULT_MODEL");
  });
});
