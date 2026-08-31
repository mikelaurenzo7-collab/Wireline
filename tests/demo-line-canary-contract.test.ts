import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("demo-line canary keeps showcase numbers on OpenAI inbound", () => {
  const canary = read("src/lib/demo-line-canary.ts");
  const carrier = read("src/lib/voice/native-phone-carrier.ts");

  it("publishes voice truth independently while retaining full routing repair", () => {
    expect(canary).toContain("isNativeNumberOpenAIVoiceRouted(number)");
    expect(canary).not.toContain("isNativeNumberOpenAIRouted(number)");
    expect(carrier).toContain("export function isNativeNumberOpenAIVoiceRouted");
    expect(canary).toContain("smsUrl: row.smsUrl");
    expect(canary).toContain("smsMethod: row.smsMethod");
    expect(canary).toContain("voiceMethod: row.voiceMethod");
    expect(canary).toContain("voiceFallbackMethod: row.voiceFallbackMethod");
    expect(canary).not.toContain("webhookPath");
    expect(canary).not.toContain("vapiFetch");
    expect(canary).not.toContain("api.vapi.ai");
  });

  it("monitors the deterministic Bot IDs used by showcase routing", () => {
    expect(canary).toContain('import { founderShowcaseAgentId } from "./founder-showcase-seed"');
    expect(canary).toContain(
      "agents.map(({ agent }) => founderShowcaseAgentId(founderUserId, agent.name))",
    );
    expect(canary).toContain("agentIds: showcaseAgentIds");
    expect(canary).toContain('direction: "inbound"');
    expect(canary).toContain("const SHOWCASE_VOICE_WINDOW_MINUTES = 26 * 60");
    expect(canary).toContain("windowMinutes: SHOWCASE_VOICE_WINDOW_MINUTES");
    expect(canary).not.toContain("showcaseAgentIds.add(row.agentId)");
    expect(canary).toContain('result.error ||= "Founder showcase workspace is unavailable"');
    expect(canary).toContain(".select({ id: schema.agents.id })");
    expect(canary).toContain("eq(schema.agents.userId, founderUserId)");
    expect(canary).toContain("inArray(schema.agents.id, showcaseAgentIds)");
    expect(canary).not.toContain("assignments.has(agent.tel)");
  });

  it("repairs drifted showcase webhooks before alerting", () => {
    expect(canary).toContain("async function repairShowcaseOpenAIInboundRouting");
    expect(canary.indexOf("await repairShowcaseOpenAIInboundRouting(")).toBeLessThan(
      canary.indexOf(
        "probeLine(agent, kind, carrierNumbers, showcaseBotIds, founderUserId, runtimeReady)",
      ),
    );
    expect(canary).toContain("configureNativeNumberRouting");
    expect(canary).toContain("isNativeNumberOpenAIRouted(row)");
    expect(canary).toContain("showcaseTels.has(String(row.phoneNumber || \"\"))");
  });

  it("records showcase failures when the environment lookup throws", () => {
    const sip = read("src/routes/openai-sip-routes.ts");
    expect(sip).toContain(
      "let environment: Awaited<ReturnType<typeof liveExternalActionPolicyForUser>>",
    );
    expect(sip).toContain('"environment_lookup_failed"');
    expect(sip.indexOf("try {\n      environment = await liveExternalActionPolicyForUser")).toBeLessThan(
      sip.indexOf("if (!environment.allowed)"),
    );
  });

  it("persists production showcase admission failures inside the tenant context", () => {
    const sip = read("src/routes/openai-sip-routes.ts");
    const recorder = sip.slice(
      sip.indexOf("async function recordShowcasePreSessionFailure"),
      sip.indexOf("async function rejectShowcaseCallBeforeSession"),
    );
    expect(recorder).toContain("await tenantStore.run(input.userId, async () => {");
    expect(recorder.indexOf("tenantStore.run(input.userId")).toBeLessThan(
      recorder.indexOf(".insert(schema.callLogs)"),
    );
  });
});
