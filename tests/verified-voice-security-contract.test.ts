import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ACCOUNT_DELETION_TARGETS } from "../src/lib/account-deletion";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("verified private voice security contract", () => {
  const routes = read("src/routes/voices-routes.ts");
  const provider = read("src/lib/elevenlabs-client.ts");
  const picker = read("src/components/voice/SimpleVoicePicker.tsx");
  const studio = read("src/components/voice/VoiceCloningStudio.tsx");
  const migration = read("drizzle/migrations/0119_elevenlabs_managed_voice_runtime.sql");
  const consentMigration = read("drizzle/migrations/0121_align_voice_clone_consent_contract.sql");
  const approvalIndexMigration = read("drizzle/migrations/0120_cloned_voice_approved_by_index.sql");
  const managedRuntime = read("src/lib/managed-voice-runtime.ts");
  const schema = read("src/db/schema.ts");
  const terms = read("src/components/LegalPage.tsx");
  const privacy = read("src/components/PrivacyPolicyPage.tsx");

  it("keeps the provider credential and inventory server-side", () => {
    expect(provider).toContain("process.env.ELEVENLABS_API_KEY");
    expect(provider).toMatch(/headers:\s*\{[\s\S]*"xi-api-key": requireApiKey\(\)/);
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
    const consentVersion = managedRuntime.match(
      /ELEVENLABS_VOICE_CONSENT_VERSION\s*=\s*\n?\s*"([^"]+)"/,
    )?.[1];
    expect(consentVersion).toBeTruthy();
    expect(migration).toContain(`consent_version = '${consentVersion}'`);
    expect(consentMigration).toContain(`consent_version = '${consentVersion}'`);
    expect(routes).toContain('voice.status === "approved"');
    expect(routes).toContain("providerVerificationRequired");
    expect(migration).toContain("voice.status = 'approved'");
    expect(migration).toContain("wireline_cloned_voices_approval_check");
    expect(migration).toContain("provider_verification_required = false");
    expect(migration).toContain("quality_check_version = 'voice-quality-v1-2026-08-01'");
    expect(migration).toContain("ON DELETE RESTRICT");
    expect(schema).toMatch(/approvedBy: uuid\("approved_by"\)[\s\S]*onDelete: "restrict"/);
    expect(approvalIndexMigration).toContain("idx_cloned_voices_approved_by");
    expect(schema).toContain("idx_cloned_voices_approved_by");
    expect(migration).toContain("consent_version = 'voice-clone-consent-v3-2026-08-01'");
    expect(migration).toContain("intended_use = 'wireline-agents'");
    expect(migration).toContain("char_length(btrim(name)) BETWEEN 2 AND 80");
    expect(migration).toContain("wireline_cloned_voices_mime_check");
    expect(migration).toContain("wireline_cloned_voice_revocation");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
  });

  it("explains why voice creation is unavailable instead of showing a dead button", () => {
    // The Create voice button is disabled whenever the provider credential is
    // absent. Without a reason next to it, an admin sees a greyed control and
    // reads it as broken.
    expect(studio).toContain("Custom voices need the voice provider connected.");
    expect(studio).toContain('id="create-voice-unavailable"');
    expect(studio).toMatch(
      /aria-describedby=\{configured \? undefined : "create-voice-unavailable"\}/,
    );
  });

  it("purges cloned voices by owner, never by approver", () => {
    // Doctrine requires every new tenant table to carry explicit account
    // deletion behavior rather than relying on FK cascade alone.
    const target = ACCOUNT_DELETION_TARGETS.find(
      (entry) => entry.table === "wireline_cloned_voices",
    );
    expect(target, "wireline_cloned_voices missing from ACCOUNT_DELETION_TARGETS").toBeDefined();
    expect(target?.userColumns).toEqual(["user_id"]);

    // Purging by approved_by would be a cross-tenant delete the moment approval
    // widens beyond self-review: the owner's row would be removed because a
    // *different* user approved it, and the revoke trigger would reset their
    // live agents. Owner-only keeps the worst case at a blocked purge.
    expect(target?.userColumns).not.toContain("approved_by");
  });

  it("keeps voice approval self-scoped, so approver and owner cannot diverge", () => {
    // The purge predicate above is only complete while these are the same
    // person. If approval is ever widened, revisit account deletion first.
    expect(routes).toMatch(
      /approvedBy: req\.user\.id[\s\S]*?eq\(schema\.clonedVoices\.userId, req\.user\.id\)/,
    );
    expect(migration).toMatch(/approved_by[\s\S]*ON DELETE RESTRICT/);
    expect(migration).toMatch(/user_id[\s\S]*ON DELETE CASCADE/);
  });

  it("discloses authorization, biometric sensitivity, provider processing, and revocation", () => {
    expect(terms).toContain("Voice Cloning and Synthetic Media");
    expect(terms).toMatch(/documented,\s+legally sufficient authorization/);
    expect(terms).toMatch(/AI-generated and cloned voices are artificial voices/);
    expect(privacy).toMatch(/Voice characteristics may be biometric or\s+sensitive data/);
    expect(privacy).toMatch(/does not\s+place the source file/);
    expect(privacy).toMatch(/ElevenLabs receives the sample/);
    expect(privacy).toMatch(/deletion remains pending/);
  });
});
