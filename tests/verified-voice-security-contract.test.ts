import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ACCOUNT_DELETION_TARGETS } from "../src/lib/account-deletion";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("retired private-voice provider contract", () => {
  const migration = read("drizzle/migrations/0169_remove_legacy_voice_provider.sql");
  const schema = `${read("src/db/schema.ts")}\n${read("src/db/schema-base.ts")}`;
  const picker = read("src/components/voice/SimpleVoicePicker.tsx");
  const catalog = read("src/lib/voice-catalog.ts");
  const runtime = read("src/lib/managed-voice-runtime.ts");
  // Legal JSX text is re-wrapped by the formatter; compare the words, not line breaks.
  const terms = read("src/components/LegalPage.tsx").replace(/\s+/g, " ");
  const privacy = read("src/components/PrivacyPolicyPage.tsx").replace(/\s+/g, " ");

  it("ships no ElevenLabs credential, route, client, or cloning studio", () => {
    for (const path of [
      "src/routes/voices-routes.ts",
      "src/lib/elevenlabs-client.ts",
      "src/components/voice/VoiceCloningStudio.tsx",
    ]) {
      expect(existsSync(resolve(process.cwd(), path)), path).toBe(false);
    }
    expect(`${picker}\n${catalog}\n${runtime}`).not.toMatch(/elevenlabs|11labs|clone upload/i);
    expect(runtime).toContain('provider: "openai" as const');
    expect(runtime).toContain("isManagedOpenAIVoiceId");
  });

  it("fails closed if legacy voice assets exist before dropping the table", () => {
    expect(migration).toContain("SELECT EXISTS (SELECT 1 FROM public.wireline_cloned_voices)");
    expect(migration).toContain("IF has_rows THEN");
    expect(migration).toContain(
      "Refusing to retire the legacy voice provider while mapped voice assets still exist",
    );
    expect(migration).toContain("DROP TABLE IF EXISTS public.wireline_cloned_voices");
    expect(migration).toContain(
      "DROP FUNCTION IF EXISTS public.wireline_revoke_cloned_voice_assignments()",
    );
  });

  it("removes the retired table from schema and deletion registries", () => {
    expect(schema).not.toContain('"wireline_cloned_voices"');
    expect(ACCOUNT_DELETION_TARGETS.some((entry) => entry.table === "wireline_cloned_voices")).toBe(
      false,
    );
  });

  it("uses only the managed OpenAI Realtime voice catalog", () => {
    expect(catalog).toContain("OPENAI_REALTIME_VOICES");
    expect(catalog).toContain("OPENAI_REALTIME_VOICE_IDS");
    expect(catalog).not.toMatch(/elevenlabs|11labs|vapi|xai|grok/i);
    expect(picker).toContain("OPENAI_REALTIME_VOICES");
  });

  it("separates existing live-call voices from explicitly consented private previews", () => {
    expect(terms).toContain("does not enable it");
    expect(terms).toContain("separate, explicit permission");
    expect(terms).toContain("artificial voices from its managed voice roster");
    expect(privacy).toContain("Private voice previews require separate speaker permission");
    expect(privacy).toContain("Delete the saved voice to revoke future use");
    expect(`${terms}\n${privacy}`).not.toMatch(/ElevenLabs receives|source sample.*provider/i);
  });
});
