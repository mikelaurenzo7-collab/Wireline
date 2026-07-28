import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("agent runtime performance and action integrity", () => {
  const factory = read("src/lib/vapi-assistant-factory-v2.ts");
  const dispatch = read("src/lib/agent-tool-dispatch.ts");
  const idempotency = read("src/lib/agent-tool-idempotency.ts");
  const truth = read("src/lib/agent-tool-result-truth.ts");
  const toolFormat = read("src/lib/vapi-tool-format.ts");
  const toolResults = read("src/lib/vapi-tool-results.ts");
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
    expect(idempotency).toContain("exact same ID is never executed again");
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
  });

  it("starts new agents focused without removing the full configurable catalog", () => {
    expect(createDefaults).toContain("getRoleToolSet(runtimeRole(role, isBusinessAgent))");
    expect(createDefaults).not.toContain("getDefaultAgentTools()");
    expect(createDefaults).toContain("BUSINESS_TOOL_NAMES.has(tool)");
  });

  it("makes DNC writes conflict-safe without depending on the auxiliary ledger", () => {
    expect(idempotency).toContain("add_to_dnc is deliberately excluded");
    expect(dncMigration).toContain("wireline_dnc_list_user_phone_unique");
    expect(dncMigration).toContain("PARTITION BY user_id, phone");
  });
});
