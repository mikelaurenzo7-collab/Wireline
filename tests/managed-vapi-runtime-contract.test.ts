import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("managed Vapi runtime policy", () => {
  const roster = read("src/data/voice-roster.ts");
  const factory = read("src/lib/vapi-assistant-factory-v2.ts");
  const outboundClient = read("src/lib/vapi-client.ts");
  const draftService = read("src/lib/agent-draft-service.ts");
  const studio = read("src/components/StudioAgentWorkspacePanel.tsx");
  const knowledge = read("src/pages/KnowledgePage.tsx");
  const liveFloor = read("src/components/LiveFloorPresence.tsx");
  const carrier = read("src/components/admin/CarrierPanel.tsx");
  const csp = read("src/lib/csp.ts");
  const vercel = read("vercel.json");
  const migration = read("drizzle/migrations/0100_managed_vapi_runtime.sql");

  it("uses only curated Vapi voices for active phone runtime", () => {
    expect(roster).toMatch(/DEFAULT_MANAGED_VOICE_ID/);
    expect(roster).toMatch(/Savannah/);
    expect(roster).toMatch(/Elliot/);
    expect(roster).toMatch(/provider `vapi`/);
    expect(roster).not.toMatch(/ElevenLabs|pNInz6obpgDQGcFmaJgB|21m00Tcm4TlvDq8ikWAM/);
    expect(factory).toMatch(/provider: "vapi" as const/);
    expect(factory).toMatch(/isManagedVapiVoiceId/);
    expect(factory).not.toMatch(
      /resolveElevenLabsSpeed|pronunciationDictionaryLocators|eleven_flash/,
    );
    expect(outboundClient).toMatch(/provider: "vapi" as const/);
    expect(outboundClient).toMatch(/DEFAULT_MANAGED_VOICE_ID/);
    expect(outboundClient).not.toMatch(/provider === "11labs"|eleven_flash/);
    expect(draftService).toMatch(/voiceProvider: "vapi"/);
  });

  it("bounds inbound context and preserves runtime guardrails", () => {
    expect(factory).toContain("MAX_RUNTIME_DIRECTIVES");
    expect(factory).toContain("MAX_RUNTIME_KNOWLEDGE");
    expect(factory).toContain("truncateRuntimeSnippet");
    expect(factory).toContain("clampRuntimePromptPreservingTail");
    expect(factory).toMatch(/\.slice\(0, 12\)/);
    expect(factory).not.toMatch(/\.limit\(40\)|\.limit\(80\)/);
  });

  it("makes after-hours follow-up durable and truthful", () => {
    expect(factory).toContain("Use create_followup_task before closing");
    expect(factory).toContain("Promise follow-up only if that tool explicitly confirms");
    expect(factory).toContain("Promise a relay only if that tool explicitly confirms");
    expect(factory).toContain("I can take a message for the team");
    expect(factory).not.toContain("make sure the right person follows up");
  });

  it("keeps external voice and avatar experiments out of active authenticated pages", () => {
    expect(studio).toMatch(/Phone voice/);
    expect(studio).toMatch(/SimpleVoicePicker/);
    expect(studio).not.toMatch(
      /AgentPresenceLivePreview|VoiceGallery|video presenter|External voice/,
    );
    expect(knowledge).toMatch(/Business knowledge/);
    expect(knowledge).toMatch(/Test in Studio/);
    expect(knowledge).not.toMatch(
      /VoiceGallery|AgentPresenceVoiceBridge|WirelineLiveVoiceProfile|SimulatorTab/,
    );
    expect(liveFloor).toMatch(/Live customer calls/);
    expect(liveFloor).not.toMatch(/AgentPresencePstnBridge|Live presenter/);
  });

  it("keeps model and carrier complexity managed instead of user-tuned", () => {
    expect(carrier).toMatch(/Vapi handles the phone conversation runtime/);
    expect(carrier).toMatch(/OpenAI is the primary call model/);
    expect(carrier).toMatch(/Gemini is the automatic fallback/);
    expect(carrier).toMatch(/Twilio supplies phone and messaging infrastructure/);
    expect(carrier).not.toMatch(
      /Advanced Cognitive Routing|Custom Model Selection|Model Revision Override/,
    );
  });

  it("keeps server-only voice vendors out of the browser boundary", () => {
    for (const source of [csp, vercel]) {
      expect(source).toMatch(/api\.openai\.com/);
      expect(source).toMatch(/api\.vapi\.ai/);
      // Optional xAI hosts remain allowlisted for experimental surfaces; customer
      // demos and the managed runtime use OpenAI.
      expect(source).toMatch(/api\.x\.ai/);
      // ElevenLabs is invoked server-side only; it must never be reachable from
      // the browser.
      expect(source).not.toMatch(/api\.elevenlabs\.io|cdn\.elevenlabs\.io/);
    }
  });

  it("normalizes every persisted agent to the managed runtime", () => {
    expect(migration).toMatch(/CREATE TRIGGER wireline_agents_managed_voice/);
    expect(migration).toMatch(/NEW\.voice_provider := 'vapi'/);
    expect(migration).toMatch(/NEW\.video_presenter_provider := NULL/);
    expect(migration).toMatch(/UPDATE wireline_agents/);
    expect(migration).toMatch(/voice_provider = 'vapi'/);
  });
});
