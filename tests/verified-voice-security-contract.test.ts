import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("voice authorization security contract", () => {
  const routes = read("src/routes/voices-routes.ts");
  const library = read("src/components/admin/VoiceLibraryPanel.tsx");

  it("keeps private and generated provider voices out of public surfaces", () => {
    expect(routes).toContain('.filter((v) => v.category === "premade")');
    expect(routes).toContain('if (voice.category !== "premade")');
    expect(routes).toContain("publicPreviewRateLimiter");
    expect(routes).toContain("assertTrustedElevenLabsPreviewUrl");
    expect(routes).not.toContain('filter((v) => v.category !== "cloned")');
  });

  it("records versioned authorization evidence without retaining source audio", () => {
    expect(routes).toContain('VOICE_CLONE_CONSENT_VERSION = "voice-clone-consent-v2-2026-07-11"');
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

  it("enforces authenticated spend limits across serverless replicas", () => {
    expect(routes).toContain("MAX_CLONE_REQUESTS_PER_WINDOW = 5");
    expect(routes).toContain("voice.clone.requested");
    expect(routes).toContain("pg_advisory_xact_lock");
    expect(routes).toContain("drizzle.transaction");
  });

  it("validates inputs and compensates provider resources on persistence failure", () => {
    expect(routes).toContain("ALLOWED_CLONE_AUDIO_MIME_TYPES");
    expect(routes).toContain("Audio sample is not valid base64");
    expect(routes).toContain("MAX_CLONE_AUDIO_BYTES");
    expect(routes).toContain("voice clone compensation delete failed");
    expect(routes).toContain(".returning({ voiceId: schema.clonedVoices.voiceId })");
    expect(routes).not.toContain("Cloned by Wireline tenant");
  });

  it("preserves tenant ownership when provider deletion fails", () => {
    const deleteHandler = routes.match(
      /router\.delete\([\s\S]*?ElevenLabs delete failed — preserving local ownership for retry[\s\S]*?res\.json\(\{ ok: true \}\);/,
    )?.[0];
    expect(deleteHandler).toBeDefined();
    expect(deleteHandler).toContain("throw AppError.fromHttpStatus(");
    expect(deleteHandler).toContain("The voice remains private and owned by this workspace.");
    expect(deleteHandler).toContain(".delete(schema.clonedVoices)");
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
