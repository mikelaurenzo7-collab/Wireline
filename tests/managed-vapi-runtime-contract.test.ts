import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("managed Vapi runtime policy", () => {
  const roster = read("src/data/voice-roster.ts");
  const factory = read("src/lib/vapi-assistant-factory-v2.ts");
  const draftService = read("src/lib/agent-draft-service.ts");
  const studio = read("src/components/StudioAgentWorkspacePanel.tsx");
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
    expect(factory).not.toMatch(/resolveElevenLabsSpeed|pronunciationDictionaryLocators|eleven_flash/);
    expect(draftService).toMatch(/voiceProvider: "vapi"/);
  });

  it("keeps external voice and avatar experiments out of Studio", () => {
    expect(studio).toMatch(/Wireline manages the voice runtime/);
    expect(studio).not.toMatch(/AgentPresenceLivePreview|VoiceGallery|video presenter|External voice/);
  });

  it("keeps model and carrier complexity managed instead of user-tuned", () => {
    expect(carrier).toMatch(/Vapi handles the phone conversation runtime/);
    expect(carrier).toMatch(/OpenAI is the primary call model/);
    expect(carrier).toMatch(/Gemini is the automatic fallback/);
    expect(carrier).toMatch(/Twilio supplies phone and messaging infrastructure/);
    expect(carrier).not.toMatch(/Advanced Cognitive Routing|Custom Model Selection|Model Revision Override/);
  });

  it("removes dormant voice vendors from the browser boundary", () => {
    for (const source of [csp, vercel]) {
      expect(source).toMatch(/api\.openai\.com/);
      expect(source).toMatch(/api\.vapi\.ai/);
      expect(source).not.toMatch(/api\.x\.ai|api\.elevenlabs\.io|cdn\.elevenlabs\.io/);
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
