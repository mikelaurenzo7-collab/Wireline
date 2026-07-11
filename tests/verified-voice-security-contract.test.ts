import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("voice authorization security contract", () => {
  const routes = read("src/routes/voices-routes.ts");
  const library = read("src/components/admin/VoiceLibraryPanel.tsx");
  const presenterVoices = read("src/lib/video-presenter/heygen-voice-service.ts");

  it("keeps private and generated provider voices out of public surfaces", () => {
    expect(routes).toContain('.filter((v) => v.category === "premade")');
    expect(routes).toContain('if (voice.category !== "premade")');
    expect(routes).toContain("publicPreviewRateLimiter");
    expect(routes).toContain("assertTrustedElevenLabsPreviewUrl");
    expect(routes).not.toContain('filter((v) => v.category !== "cloned")');
  });

  it("resolves presenter voices only through the provider public catalog", () => {
    expect(presenterVoices).toContain('type: "public"');
    expect(presenterVoices).toContain("await listPresenterVoices()");
    expect(presenterVoices).toContain("Enforce the same public-catalog boundary before paid synthesis");
    expect(presenterVoices).not.toContain("/v3/voices/${encodeURIComponent(normalized)}");
    expect(presenterVoices).toContain(
      'throw AppError.fromHttpStatus(404, "Presenter voice not found.")',
    );
  });

  it("records versioned authorization evidence without retaining source audio", () => {
    expect(routes).toContain(
      'VOICE_CLONE_CONSENT_VERSION = "voice-clone-consent-v2-2026-07-11"',
    );
    expect(routes).toContain(
      "consent_statement_version !== VOICE_CLONE_CONSENT_VERSION",
    );
    expect(routes).toContain('event: "voice.clone.consent_granted"');
    expect(routes).toContain("sourceSha256");
    expect(routes).toContain("sourceAudioRetained: false");
    expect(routes).toContain('createHash("sha256")');
    expect(routes).toContain("consent_recorded: true");
    expect(routes).not.toContain("consent_verified");
    expect(library).toContain("consent_statement_version");
    expect(library).toContain("documented authorization");
    expect(library).toContain("not stored in Wireline's database");
    expect(library).toContain("Create authorized voice");
    expect(library).not.toContain("verified voice");
  });

  it("keeps browser and server payloads beneath the deployed function ceiling", () => {
    expect(library).toContain("MAX_CLONE_UPLOAD_BYTES = 3 * 1024 * 1024");
    expect(library).toContain("cloneFile.size > MAX_CLONE_UPLOAD_BYTES");
    expect(library).toContain("compressed sample under 3 MB");
    expect(routes).toContain("MAX_CLONE_AUDIO_BYTES = 3 * 1024 * 1024");
    expect(routes).toContain("Audio sample too large (max 3 MB)");
    expect(library).not.toContain("under 25 MB");
    expect(routes).not.toContain("max 25 MB");
  });

  it("uses semantic theme tokens in the voice-library surface", () => {
    expect(library).toContain("border-border");
    expect(library).toContain("bg-card");
    expect(library).not.toContain("border-white/");
    expect(library).not.toContain("bg-black/");
    expect(library).not.toContain("wl-label-muted/");
  });

  it("enforces authenticated spend limits across serverless replicas", () => {
    expect(routes).toContain("MAX_CLONE_REQUESTS_PER_WINDOW = 5");
    expect(routes).toContain("voice.clone.requested");
    expect(routes).toContain("pg_advisory_xact_lock");
    expect(routes).toContain("drizzle.transaction");
    expect(routes).toContain("cloneRequestReserved = true");
  });

  it("validates inputs and compensates provider resources on persistence failure", () => {
    expect(routes).toContain("ALLOWED_CLONE_AUDIO_MIME_TYPES");
    expect(routes).toContain("Audio sample is not valid base64");
    expect(routes).toContain("MAX_CLONE_AUDIO_BYTES");
    expect(routes).toContain("voice clone compensation delete failed");
    expect(routes).toContain(".returning({ voiceId: schema.clonedVoices.voiceId })");
    expect(routes).not.toContain("Cloned by Wireline tenant");
  });

  it("preserves tenant ownership whenever provider deletion cannot be completed", () => {
    const deleteHandler = routes.match(
      /router\.delete\([\s\S]*?if \(!elevenLabsConfigured\(\)\)[\s\S]*?ElevenLabs delete failed — preserving local ownership for retry[\s\S]*?res\.json\(\{ ok: true \}\);/,
    )?.[0];
    expect(deleteHandler).toBeDefined();
    expect(deleteHandler).toContain("The voice remains private and owned by this workspace.");
    expect(deleteHandler).toContain(".delete(schema.clonedVoices)");
    expect(deleteHandler).toContain("await elDeleteVoice(voiceId)");
  });

  it("does not return raw provider errors to account holders", () => {
    const handler = routes.match(
      /log\.error\("voice clone failed"[\s\S]*?res\.status\(500\)\.json\(\{([\s\S]*?)\}\);/,
    )?.[1];
    expect(handler).toBeDefined();
    expect(handler).toContain('error: "Voice creation failed. Try again or contact support."');
    expect(handler).not.toContain("getErrorMessage");
  });
});
