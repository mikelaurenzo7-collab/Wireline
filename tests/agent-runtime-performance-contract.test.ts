import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { detectOptOut } from "../src/lib/tcpa-consent";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("agent runtime performance and action integrity", () => {
  const factory = read("src/lib/voice/openai-phone-agent-runtime.ts");
  const route = read("src/routes/openai-sip-routes.ts");
  const session = read("src/lib/voice/openai-sip-session.ts");
  const helpers = read("src/lib/agent-runtime-helpers.ts");
  const workflow = read("src/lib/bot-tools/workflow.ts");
  const dispatch = read("src/lib/agent-tool-dispatch.ts");
  const idempotency = read("src/lib/agent-tool-idempotency.ts");
  const truth = read("src/lib/agent-tool-result-truth.ts");
  const capabilities = read("src/lib/agent-capabilities.ts");
  const createDefaults = read("src/lib/agent-create-defaults.ts");
  const dncMigration = read("drizzle/migrations/0109_dnc_user_phone_uniqueness.sql");

  it("keeps the live prompt bounded and interruption-aware", () => {
    expect(helpers).toContain("MAX_RUNTIME_DIRECTIVES = 24");
    expect(helpers).toContain("MAX_RUNTIME_KNOWLEDGE = 18");
    expect(helpers).toContain("truncateRuntimeSnippet");
    expect(factory).toContain("clampRuntimePromptPreservingTail");
    expect(factory).toContain('type: "semantic_vad"');
    expect(factory).toContain("interrupt_response: true");
    expect(factory).toContain("RUNTIME_ACTION_SAFETY_BLOCK");
    expect(factory).toContain("RUNTIME_VOICE_DELIVERY_CONSISTENCY_BLOCK");
  });

  it("makes external actions retry-safe and result-truthful", () => {
    expect(dispatch).toContain("runIdempotentAgentToolCall");
    expect(dispatch).toContain("enforceAgentToolResultTruth");
    expect(idempotency).toContain("pg_advisory_xact_lock");
    expect(idempotency).toContain("transaction(async (tx: typeof context.drizzle)");
    expect(idempotency).not.toContain("tx: any");
    expect(idempotency).toContain("exact same ID is never executed again");
    expect(idempotency).toContain('"escalate_to_human"');
    expect(idempotency).toContain("output.destination");
    expect(truth).toContain("create a real follow-up task");
    expect(truth).toContain("was not confirmed");
  });

  it("keeps tool execution ordered, bounded, and caller-truthful", () => {
    expect(session).toContain("for (const call of calls)");
    expect(session).toContain("const outcome = await Promise.race([");
    expect(session).toContain("delay(TOOL_CONFIRM_TIMEOUT_MS)");
    expect(session).toContain("OpenAI Realtime tool completed after caller-facing timeout");
    expect(session).toContain("Action confirmation timed out and the outcome is unknown");
    expect(session).toContain("Do not claim success or retry automatically");
    expect(session).toContain('type: "function_call_output"');
  });

  it("makes degraded message-taking durable and refuses unverified automatic callbacks", () => {
    expect(route).toContain("applyInboundAdmission");
    expect(session).toContain('tool.name === "create_followup_task"');
    expect(session).toContain("promise follow-up only if the tool explicitly confirms creation");
    expect(session).toContain("message persistence is unavailable");
    expect(workflow).toContain('if (fn === "schedule_callback")');
    expect(workflow).toContain("result: CALLER_LINKED_LIVE_WRITE_DENIAL");
    expect(workflow).not.toContain("Date.now() + 24 * 60 * 60 * 1000");
    expect(workflow).toContain("do not promise a response time");
  });

  it("starts new agents focused and preserves explicit selections at runtime", () => {
    expect(createDefaults).toContain("getRoleToolSet(runtimeRole(role, isBusinessAgent))");
    expect(createDefaults).not.toContain("getDefaultAgentTools()");
    expect(createDefaults).toContain("BUSINESS_TOOL_NAMES.has(tool)");
    expect(capabilities).toContain("return [...tools]");
    expect(capabilities).toContain("explicit enabled_tools array is the");
    expect(capabilities).not.toContain("UNIVERSAL_BONUS_TOOLS");
  });

  it("makes DNC writes conflict-safe without depending on the auxiliary ledger", () => {
    expect(idempotency).toContain("add_to_dnc is deliberately excluded");
    expect(dncMigration).toContain("wireline_dnc_list_user_phone_unique");
    expect(dncMigration).toContain("PARTITION BY user_id, phone");
  });

  it("recognizes common explicit future-contact revocations", () => {
    for (const transcript of [
      "Don't call me again.",
      "Stop calling me.",
      "Stop calling.",
      "Do not contact this number.",
      "Take me off your list.",
      "Remove me from the call list.",
      "Put me on the do-not-call list.",
      "No more calls.",
    ]) {
      expect(detectOptOut(transcript)).toMatchObject({ found: true, kind: "dnc" });
    }
  });

  it("gives future-contact revocation precedence over recording-only language", () => {
    expect(detectOptOut("Stop recording this call. Also, don't call me again.")).toMatchObject({
      found: true,
      kind: "dnc",
    });
    expect(detectOptOut("Please stop recording, but email me tomorrow.")).toMatchObject({
      found: true,
      kind: "recording",
    });
  });

  it("does not convert ordinary sales rejection into a legal DNC request", () => {
    expect(detectOptOut("I'm not interested right now.")).toEqual({ found: false });
    expect(detectOptOut("Maybe call me next quarter.")).toEqual({ found: false });
    expect(detectOptOut("Don't stop calling.")).toEqual({ found: false });
  });

  it("creates durable finalization recovery before duplicate suppression and replays DNC", () => {
    const claim = session.slice(
      session.indexOf("async function claimCall"),
      session.indexOf("async function updatePresence"),
    );
    expect(claim).toContain('return existing.phase === "claimed" ? ("retry" as const) : null');
    expect(claim).toContain('.for("update")');
    expect(claim).toContain("await enqueuePostCallDigest(");
    expect(claim.indexOf("await enqueuePostCallDigest(")).toBeLessThan(
      claim.lastIndexOf("return {"),
    );

    const replay = session.slice(
      session.indexOf("export async function replayOpenAISipPostCallFinalization"),
      session.indexOf("async function runRealtimeSession"),
    );
    expect(replay).toContain("await persistAiDisclosureEvidence({");
    expect(replay).toContain("await persistTranscriptDncSuppression({");
    expect(replay).toContain("await trackVoiceMinutes({");
  });
});
