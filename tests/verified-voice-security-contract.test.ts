import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("verified private voice security contract", () => {
  const routes = read("src/routes/voices-routes.ts");
  const provider = read("src/lib/elevenlabs-client.ts");
  const picker = read("src/components/voice/SimpleVoicePicker.tsx");
  const studio = read("src/components/voice/VoiceCloningStudio.tsx");
  const migration = read(
    "drizzle/migrations/0119_elevenlabs_managed_voice_runtime.sql",
  );
  const approvalIndexMigration = read(
    "drizzle/migrations/0120_cloned_voice_approved_by_index.sql",
  );
  const schema = read("src/db/schema.ts");
  const terms = read("src/components/LegalPage.tsx");
  const privacy = read("src/components/PrivacyPolicyPage.tsx");

  it("keeps the provider credential and inventory server-side", () => {
    expect(provider).toContain("process.env.ELEVENLABS_API_KEY");
    expect(provider).toMatch(
      /headers:\s*\{[\s\S]*"xi-api-key": requireApiKey\(\)/,
    );
    expect(picker).not.toMatch(/ELEVENLABS_API_KEY|api\.elevenlabs\.io/);
    expect(studio).not.toMatch(/ELEVENLABS_API_KEY|api\.elevenlabs\.io/);
    expect(routes).not.toMatch(/process\.env\.ELEVENLABS_API_KEY/);
  });

  it("puts auth, founder authorization, and spend controls before mutations", () => {
    expect(routes).toMatch(
      /"\/api\/voices\/clone",[\s\S]*authenticateUser,[\s\S]*requirePlatformAdmin,[\s\S]*voiceMutationRateLimit,[\s\S]*cloneIpRateLimit/,
    );
    expect(routes).toMatch(
      /"\/api\/voices\/:id\/approve",[\s\S]*authenticateUser,[\s\S]*requirePlatformAdmin,[\s\S]*voiceMutationRateLimit/,
    );
    expect(routes).toMatch(
      /router\.delete\([\s\S]*authenticateUser,[\s\S]*requirePlatformAdmin,[\s\S]*voiceMutationRateLimit/,
    );
  });

  it("rejects malformed uploads and preserves durable consent evidence", () => {
    expect(routes).toContain("MAX_CLONE_AUDIO_BYTES");
    expect(routes).toContain("ALLOWED_CLONE_AUDIO_MIME_TYPES");
    expect(routes).toContain("validateAudioSignature");
    expect(routes).toContain('createHash("sha256")');
    expect(routes).toContain("pg_advisory_xact_lock");
    expect(routes).toContain('status: "creating"');
    expect(routes).toContain("CREATING_RESERVATION_TTL_MS");
    expect(routes).toContain('rejectionReason: "reservation_expired"');
    expect(routes).toContain("voice.clone.consent_granted");
    expect(routes).toContain("sourceAudioRetained: false");
    expect(migration).toContain("uq_cloned_voices_active_source");
  });

  it("fails live use closed at both API and database layers", () => {
    expect(routes).toContain('voice.status === "approved"');
    expect(routes).toContain("providerVerificationRequired");
    expect(migration).toContain("voice.status = 'approved'");
    expect(migration).toContain("wireline_cloned_voices_approval_check");
    expect(migration).toContain("provider_verification_required = false");
    expect(migration).toContain(
      "quality_check_version = 'voice-quality-v1-2026-08-01'",
    );
    expect(migration).toContain("ON DELETE RESTRICT");
    expect(schema).toMatch(
      /approvedBy: uuid\("approved_by"\)[\s\S]*onDelete: "restrict"/,
    );
    expect(approvalIndexMigration).toContain("idx_cloned_voices_approved_by");
    expect(schema).toContain("idx_cloned_voices_approved_by");
    expect(migration).toContain(
      "consent_version = 'voice-clone-consent-v1-2026-08-01'",
    );
    expect(migration).toContain("intended_use = 'wireline-agents'");
    expect(migration).toContain("char_length(btrim(name)) BETWEEN 2 AND 80");
    expect(migration).toContain("wireline_cloned_voices_mime_check");
    expect(migration).toContain("wireline_cloned_voice_revocation");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
  });

  it("discloses authorization, biometric sensitivity, provider processing, and revocation", () => {
    expect(terms).toContain("Voice Cloning and Synthetic Media");
    expect(terms).toMatch(/documented,\s+legally sufficient authorization/);
    expect(terms).toMatch(
      /AI-generated and cloned voices are artificial voices/,
    );
    expect(privacy).toMatch(
      /Voice characteristics may be biometric or\s+sensitive data/,
    );
    expect(privacy).toMatch(/does not\s+place the source file/);
    expect(privacy).toMatch(/ElevenLabs receives the sample/);
    expect(privacy).toMatch(/deletion remains pending/);
  });
});
