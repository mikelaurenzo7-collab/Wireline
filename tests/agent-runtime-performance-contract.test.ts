import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { detectOptOut } from "../src/lib/tcpa-consent";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("agent runtime performance and action integrity", () => {
  const factory = read("src/lib/vapi-assistant-factory-v2.ts");
  const route = read("src/routes/vapi-v2.ts");
  const vapiHandlers = read("src/lib/vapi-handlers.ts");
  const workflow = read("src/routes/vapi/tool-handlers-workflow.ts");
  const dispatch = read("src/lib/agent-tool-dispatch.ts");
  const idempotency = read("src/lib/agent-tool-idempotency.ts");
  const truth = read("src/lib/agent-tool-result-truth.ts");
  const toolFormat = read("src/lib/vapi-tool-format.ts");
  const toolResults = read("src/lib/vapi-tool-results.ts");
  const capabilities = read("src/lib/agent-capabilities.ts");
  const createDefaults = read("src/lib/agent-create-defaults.ts");
  const dncMigration = read("drizzle/migrations/0109_dnc_user_phone_uniqueness.sql");

  it("keeps the live prompt bounded and interruption-aware", () => {
    expect(factory).toContain("MAX_RUNTIME_DIRECTIVES");
    expect(factory).toContain("MAX_RUNTIME_KNOWLEDGE");
    expect(factory).toContain("truncateRuntimeSnippet");
    expect(factory).toContain("clampRuntimePromptPreservingTail");
    expect(factory).toContain("stopSpeakingPlan: VAPI_STOP_SPEAKING_PLAN");
    expect(factory).toContain("LIVE CALL DECISION STANDARD");
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

  it("keeps callers informed during bounded tool execution", () => {
    expect(toolFormat).toContain('type: "request-start"');
    expect(toolFormat).toContain('type: "request-response-delayed"');
    expect(toolFormat).toContain('type: "request-failed"');
    expect(toolFormat).toContain("result explicitly confirms success");
    expect(toolResults).toContain("VAPI_TOOL_TIMEOUT_MS = 8_000");
    expect(toolResults).toContain("MAX_VAPI_PARALLEL_TOOL_CALLS = 3");
    expect(route).toContain("may still be processing");
    expect(route).toContain("Do not repeat it or claim success or failure");
  });

  it("makes degraded message-taking durable and callbacks exact", () => {
    expect(route).toContain("buildDurableTakeMessageAssistant");
    expect(route).toContain('name: "create_followup_task"');
    expect(route).not.toContain("make sure the team gets back to you");
    expect(workflow).toContain("if (!dueAt)");
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
  });

  it("persists transcript DNC before duplicate short-circuit and best-effort evidence", () => {
    const suppression = vapiHandlers.indexOf("await persistTranscriptDncSuppression({");
    // TCPA evidence is idempotent per call and deliberately sits between the
    // legal DNC boundary and the duplicate return: a redelivery restores the
    // consent-ledger rows a failed first delivery never wrote, instead of the
    // call-log insert consuming the only chance to write them.
    const complianceEvidence = vapiHandlers.indexOf(
      "await persistComplianceEvidence({",
      suppression,
    );
    const duplicateReturn = vapiHandlers.indexOf("if (!insertedFresh) {", complianceEvidence);

    expect(suppression).toBeGreaterThan(-1);
    expect(complianceEvidence).toBeGreaterThan(suppression);
    expect(duplicateReturn).toBeGreaterThan(complianceEvidence);
    expect(vapiHandlers).toContain("throw dncErr");
    expect(vapiHandlers).toContain("Compliance ledger writer failed");
    expect(vapiHandlers).toContain("consent-ledger outage therefore cannot strand a legal opt-out");
  });
});
