import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("verified voice security contract", () => {
  const routes = read("src/routes/voices-routes.ts");
  const library = read("src/components/admin/VoiceLibraryPanel.tsx");

  it("keeps private and generated provider voices out of public surfaces", () => {
    expect(routes).toContain('.filter((v) => v.category === "premade")');
    expect(routes).toContain('if (voice.category !== "premade")');
    expect(routes).toContain("voice IDs are identifiers");
    expect(routes).not.toContain('filter((v) => v.category !== "cloned")');
  });

  it("records versioned authorization evidence without retaining source audio", () => {
    expect(routes).toContain('VOICE_CLONE_CONSENT_VERSION = "voice-clone-consent-v2-2026-07-11"');
    expect(routes).toContain('event: "voice.clone.consent_granted"');
    expect(routes).toContain("sourceSha256");
    expect(routes).toContain("sourceAudioRetained: false");
    expect(routes).toContain("createHash(\"sha256\")");
    expect(library).toContain("consent_statement_version");
    expect(library).toContain("documented authorization");
    expect(library).toContain("not stored in Wireline's database");
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

  it("does not return raw provider errors to account holders", () => {
    expect(routes).toContain('error: "Voice creation failed. Try again or contact support."');
    expect(routes).not.toContain('error: getErrorMessage(e),\n      });\n    }\n  },\n);');
  });
});
