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
  const rollbackFactory = read("src/lib/vapi-assistant-factory-v2.ts");
  const nativeRuntime = read("src/lib/voice/xai-agent-runtime.ts");
  const nativeOutbound = read("src/lib/voice/outbound-call-service.ts");
  const nativePlacement = read("src/lib/voice/xai-outbound-placement.ts");
  const vapiFacade = read("src/lib/vapi-client.ts");
  const draftService = read("src/lib/agent-draft-service.ts");
  const voiceRoutes = read("src/routes/voices-routes.ts");
  const studio = read("src/components/StudioAgentWorkspacePanel.tsx");
  const knowledge = read("src/pages/KnowledgePage.tsx");
  const liveFloor = read("src/components/LiveFloorPresence.tsx");
  const carrier = read("src/components/admin/CarrierPanel.tsx");
  const csp = read("src/lib/csp.ts");
  const vercel = read("vercel.json");
  const migration = read("drizzle/migrations/0119_elevenlabs_managed_voice_runtime.sql");

  it("keeps the governed ElevenLabs/Vapi voice builder intact for rollback", () => {
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

  it("fails an unapproved private rollback voice closed to a managed phone voice", () => {
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

  it("keeps rollback voice governance while native phone calls use xAI profiles only", () => {
    expect(roster).toMatch(/DEFAULT_MANAGED_VOICE_ID/);
    expect(roster).toMatch(/Savannah/);
    expect(roster).toMatch(/Elliot/);
    expect(rollbackFactory).toMatch(/buildManagedVoiceRuntime/);
    expect(rollbackFactory).toMatch(/schema\.clonedVoices\.status, "approved"/);

    expect(nativeRuntime).toContain("resolveWirelineGrokVoice");
    expect(nativeRuntime).toContain("GROK_VOICE_DEFAULT_MODEL");
    expect(nativeRuntime).not.toContain("buildManagedVoiceRuntime");
    expect(nativeRuntime).not.toContain("11labs");
    expect(nativeOutbound).toContain("claimNativeOutboundPlacement");
    expect(nativePlacement).toContain('provider: "twilio_xai_sip"');
    expect(nativeOutbound).not.toContain("11labs");
    expect(nativePlacement).not.toContain("11labs");
    expect(nativeOutbound).not.toContain("buildManagedVoiceRuntime");
    expect(vapiFacade).toContain("Compatibility facade for legacy imports");
    expect(vapiFacade).toContain("placeNativeOutboundCall");
    expect(draftService).toMatch(/voiceProvider: isXaiPstnVoiceId\(voiceId\) \? "xai" : "vapi"/);
  });

  it("does not let presenter or ElevenLabs selections cross the native phone boundary", () => {
    expect(rollbackFactory).toMatch(
      /configured\.voiceProvider === "11labs"[\s\S]*\? directionalVoice[\s\S]*: resolvePstnVoiceCandidate/,
    );
    expect(nativeRuntime).toContain("resolveWirelineVoiceProfile");
    expect(nativeRuntime).toContain("resolveWirelineGrokVoice");
    expect(nativeRuntime).not.toContain("resolvePstnVoiceCandidate");
    expect(nativeRuntime).not.toContain("voiceProvider");
    expect(nativeOutbound).not.toContain("voiceProvider");
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

  it("bounds native context and preserves runtime guardrails", () => {
    expect(nativeRuntime).toContain("MAX_PROMPT_LINE_LENGTH");
    expect(nativeRuntime).toContain("MAX_INITIAL_KNOWLEDGE_ITEMS");
    expect(nativeRuntime).toContain("NON_NEGOTIABLE_RUNTIME_RULES");
    expect(nativeRuntime).toContain("listBlock(\"OPERATING RULES\"");
    expect(nativeRuntime).toContain("listBlock(\"INITIAL APPROVED KNOWLEDGE\"");
    expect(nativeRuntime).toContain("serialQueryBatch");
  });

  it("makes after-hours and unknown-fact behavior durable and truthful", () => {
    expect(nativeRuntime).toContain("Do not invent facts");
    expect(nativeRuntime).toContain("Never claim an action happened unless a tool result explicitly confirms it");
    expect(nativeRuntime).toContain("search approved knowledge or say you will take a message");
    expect(nativeRuntime).toContain("Treat every tool result as authoritative");
    expect(nativeRuntime).not.toContain("make sure the right person follows up");
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
