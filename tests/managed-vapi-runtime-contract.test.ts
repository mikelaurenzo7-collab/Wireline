import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildManagedVoiceRuntime,
  ELEVENLABS_REALTIME_MODEL,
} from "../src/lib/managed-voice-runtime";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("managed phone voice runtime policy", () => {
  const roster = read("src/data/voice-roster.ts");
  const factory = read("src/lib/vapi-assistant-factory-v2.ts");
  const outboundClient = read("src/lib/vapi-client.ts");
  const draftService = read("src/lib/agent-draft-service.ts");
  const voiceRoutes = read("src/routes/voices-routes.ts");
  const studio = read("src/components/StudioAgentWorkspacePanel.tsx");
  const knowledge = read("src/pages/KnowledgePage.tsx");
  const liveFloor = read("src/components/LiveFloorPresence.tsx");
  const carrier = read("src/components/admin/CarrierPanel.tsx");
  const csp = read("src/lib/csp.ts");
  const vercel = read("vercel.json");
  const migration = read("drizzle/migrations/0119_elevenlabs_managed_voice_runtime.sql");

  it("streams curated studio speech with an independent Vapi fallback", () => {
    const voice = buildManagedVoiceRuntime({
      voiceProvider: "11labs",
      voiceId: "cgSgspJ2msm6clMCkdW9",
      fallbackVoiceId: "Elliot",
    });
    expect(voice).toMatchObject({
      provider: "11labs",
      voiceId: "cgSgspJ2msm6clMCkdW9",
      model: ELEVENLABS_REALTIME_MODEL,
      fallbackPlan: { voices: [{ provider: "vapi", voiceId: "Elliot" }] },
    });
    expect(voice).toMatchObject({
      stability: 0.5,
      similarityBoost: 0.75,
      speed: 1,
    });
  });

  it("fails an unapproved private id closed to a managed phone voice", () => {
    expect(
      buildManagedVoiceRuntime({
        voiceProvider: "11labs",
        voiceId: "private-unapproved-id",
        approvedClone: false,
      }),
    ).toMatchObject({ provider: "vapi", voiceId: "Savannah" });

    expect(
      buildManagedVoiceRuntime({
        voiceProvider: "11labs",
        voiceId: "private-approved-id",
        approvedClone: true,
      }),
    ).toMatchObject({
      provider: "11labs",
      voiceId: "private-approved-id",
      fallbackPlan: { voices: [{ provider: "vapi", voiceId: "Savannah" }] },
    });
  });

  it("uses the same managed decision for inbound and outbound phone calls", () => {
    expect(roster).toMatch(/DEFAULT_MANAGED_VOICE_ID/);
    expect(roster).toMatch(/Savannah/);
    expect(roster).toMatch(/Elliot/);
    expect(factory).toMatch(/buildManagedVoiceRuntime/);
    expect(factory).toMatch(/schema\.clonedVoices\.status, "approved"/);
    expect(outboundClient).toMatch(/buildManagedVoiceRuntime/);
    expect(outboundClient).toMatch(/schema\.clonedVoices\.status, "approved"/);
    expect(draftService).toMatch(/voiceProvider: "vapi"/);
  });

  it("does not replace an approved ElevenLabs selection with the presenter fallback", () => {
    expect(factory).toMatch(
      /configured\.voiceProvider === "11labs"[\s\S]*\? directionalVoice[\s\S]*: resolvePstnVoiceCandidate/,
    );
    expect(outboundClient).toMatch(
      /agentConfig\.voiceProvider === "11labs"[\s\S]*\? outboundVoiceId[\s\S]*: resolvePstnVoiceCandidate/,
    );
  });

  it("gates private voices on authorization, human proof review, and revocation", () => {
    expect(voiceRoutes).toMatch(/requirePlatformAdmin/);
    expect(voiceRoutes).toMatch(/ELEVENLABS_VOICE_CONSENT_VERSION/);
    expect(voiceRoutes).toMatch(/sourceAudioRetained: false/);
    expect(voiceRoutes).toMatch(/createHash\("sha256"\)/);
    expect(voiceRoutes).toMatch(/validateAudioSignature/);
    expect(voiceRoutes).toMatch(/qualityConfirmed/);
    expect(voiceRoutes).toMatch(/generateElevenLabsProof/);
    expect(voiceRoutes).toMatch(/providerVerificationRequired/);
    expect(voiceRoutes).toMatch(/voice\.clone\.consent_withdrawn/);
    expect(voiceRoutes).not.toMatch(/res\.json\(\{[^}]*getErrorMessage/s);
  });

  it("enforces approval and tenant isolation in Postgres", () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS public\.wireline_cloned_voices/);
    expect(migration).toMatch(/source_audio_retained = false/);
    expect(migration).toMatch(/quality_sample_model = 'eleven_flash_v2_5'/);
    expect(migration).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(migration).toMatch(/REVOKE ALL ON TABLE[\s\S]*FROM anon, authenticated, service_role/);
    expect(migration).toMatch(/CREATE POLICY tenant_isolation/);
    expect(migration).toMatch(/voice\.status = 'approved'/);
    expect(migration).toMatch(/wireline_cloned_voice_revocation/);
    expect(migration).toMatch(/provider_verification_required = false/);
    expect(migration).toMatch(/quality_check_version = 'voice-quality-v1-2026-08-01'/);
  });

  it("preserves governed presenter mappings without coupling video state to phone voice", () => {
    expect(migration).toMatch(/lower\(coalesce\(NEW\.phone_voice_provider, ''\)\) = 'vapi'/);
    expect(migration).not.toMatch(/NEW\.video_presenter_[a-z_]+\s*:=/);
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

  it("keeps unrelated avatar experiments out of active authenticated pages", () => {
    expect(studio).toMatch(/SimpleVoicePicker/);
    expect(studio).not.toMatch(/AgentPresenceLivePreview|VoiceGallery|video presenter/);
    expect(knowledge).toMatch(/Business knowledge/);
    expect(knowledge).toMatch(/Test in Studio/);
    expect(knowledge).not.toMatch(
      /VoiceGallery|AgentPresenceVoiceBridge|WirelineLiveVoiceProfile|SimulatorTab/,
    );
    expect(liveFloor).toMatch(/Live customer calls/);
    expect(liveFloor).not.toMatch(/AgentPresencePstnBridge|Live presenter/);
  });

  it("keeps model and carrier complexity managed and provider-neutral", () => {
    // \s+ tolerates Prettier reflowing the JSX copy across lines.
    expect(carrier).toMatch(
      /Wireline manages the phone conversation runtime, voice selection, intelligence\s+routing, and continuity/,
    );
    expect(carrier).toMatch(/Phone runtime", "Wireline managed/);
    expect(carrier).toMatch(/Call intelligence", "Managed automatically/);
    expect(carrier).toMatch(/Continuity", "Automatic failover/);
    expect(carrier).not.toMatch(
      /Gemini is the automatic fallback|Primary intelligence", "OpenAI|Automatic fallback", "Gemini/,
    );
    expect(carrier).not.toMatch(
      /Advanced Cognitive Routing|Custom Model Selection|Model Revision Override/,
    );
  });

  it("keeps server-only voice vendors out of the browser boundary", () => {
    for (const source of [csp, vercel]) {
      expect(source).toMatch(/api\.openai\.com/);
      expect(source).toMatch(/api\.vapi\.ai/);
      expect(source).toMatch(/api\.x\.ai/);
      expect(source).not.toMatch(/api\.elevenlabs\.io|cdn\.elevenlabs\.io/);
    }
  });
});
