import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PgDialect } from "drizzle-orm/pg-core";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  voiceAssets,
  VOICE_ASSET_CONSENT_VERSION,
  VOICE_ASSET_ENGINE_ID,
  VOICE_ASSET_MODEL_REVISION,
  VOICE_ASSET_SOURCE_REVISION,
  VOICE_ASSET_STATUSES,
  VOICE_ASSET_QUALITY_CHECK_VERSION,
} from "../src/db/voice-asset-schema";
import { redactAccountExportValue } from "../src/lib/account-export";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = read("drizzle/migrations/0179_inhouse_voice_assets.sql");
const table = getTableConfig(voiceAssets);
const dialect = new PgDialect();
const checks = Object.fromEntries(
  table.checks.map((check) => [check.name, dialect.sqlToQuery(check.value).sql]),
);

describe("private in-house voice asset source schema", () => {
  it("declares a tenant-owned private registry with no external voice IDs or raw audio columns", () => {
    expect(table.name).toBe("wireline_voice_assets");
    expect(table.enableRLS).toBe(true);
    const columns = Object.fromEntries(table.columns.map((column) => [column.name, column]));
    expect(columns.user_id.notNull).toBe(true);
    expect(columns.secret_encrypted.notNull).toBe(false);
    expect(columns.status.default).toBe("pending_review");
    expect(columns.version.default).toBe(1);
    for (const column of [
      "vendor_voice_id",
      "provider_voice_id",
      "reference_audio",
      "base64_data",
      "preview_url",
      "live_calls_enabled",
    ])
      expect(columns).not.toHaveProperty(column);
    const fk = table.foreignKeys[0];
    expect(fk.reference().foreignTable).toBeDefined();
    expect(fk.reference().columns.map((column) => column.name)).toEqual(["user_id"]);
    expect(fk.onDelete).toBe("cascade");
  });

  it("keeps the encrypted source out of existing account exports and adds terminal erasure coverage", () => {
    expect(
      redactAccountExportValue({
        id: "voice-asset",
        secret_encrypted: "vref1.private.payload",
        source_sha256: "a".repeat(64),
      }),
    ).toEqual({ id: "voice-asset", source_sha256: "a".repeat(64) });
    expect(read("src/lib/account-deletion.ts")).toContain(
      '{ table: "wireline_voice_assets", userColumns: ["user_id"] }',
    );
    expect(read("src/db/schema.ts")).toContain('export * from "./voice-asset-schema"');
  });

  it("pins the worker engine/source/model without opening live calling", () => {
    const client = read("src/lib/voice/inhouse-voice-client.ts");
    for (const value of [
      VOICE_ASSET_ENGINE_ID,
      VOICE_ASSET_MODEL_REVISION,
      VOICE_ASSET_SOURCE_REVISION,
    ]) {
      expect(client).toContain(`"${value}"`);
      expect(checks.wireline_voice_assets_engine_check).toContain(value);
      expect(migration).toContain(value);
    }
    expect(checks.wireline_voice_assets_purpose_check).toContain("'private_preview'");
    expect(migration).not.toMatch(/UPDATE\s+(?:public\.)?["']?wireline_agents/i);
    expect(migration).not.toContain("voice_provider =");
  });

  it("bounds PCM metadata consistently with the reference validator", () => {
    const source = checks.wireline_voice_assets_source_check;
    for (const part of [
      "2000000",
      "16000",
      "22050",
      "24000",
      "44100",
      "48000",
      "BETWEEN 6 AND 20",
      "source_sample_count",
      "double precision",
      "0.000001",
    ])
      expect(source).toContain(part);
    expect(source).toContain("'audio/wav'");
    expect(source).toContain("^[0-9a-f]{64}$");
    expect(migration).toContain("2666731");
    expect(migration).toContain("^vref1[.]");
  });

  it("requires current self-speaker consent and renders literal SQL without placeholders", () => {
    expect(VOICE_ASSET_CONSENT_VERSION).toBe("voice-reference-self-speaker-v1-2026-10-17");
    expect(checks.wireline_voice_assets_consent_check).toContain(
      `'${VOICE_ASSET_CONSENT_VERSION}'`,
    );
    expect(checks.wireline_voice_assets_consent_check).toContain(
      '"consent_accepted_by" = "wireline_voice_assets"."user_id"',
    );
    expect(migration).not.toMatch(/\$\d+\b/);
    for (const check of table.checks) expect(dialect.sqlToQuery(check.value).params).toEqual([]);
  });

  it("requires explicit source-matching review evidence so SQL NULL cannot satisfy approval", () => {
    const approval = checks.wireline_voice_assets_approval_check;
    for (const field of [
      "reviewed_at",
      "reviewed_by",
      "reviewed_source_sha256",
      "quality_check_version",
    ])
      expect(approval).toContain(`"${field}" IS NOT NULL`);
    expect(approval).toContain(VOICE_ASSET_QUALITY_CHECK_VERSION);
    expect(approval).toContain(
      '"reviewed_source_sha256" = "wireline_voice_assets"."source_sha256"',
    );
    expect(migration).toContain("NEW.status <> 'pending_review' OR NEW.version <> 1");
    expect(migration).toContain(
      "A voice reference must begin in pending review without approval metadata",
    );
  });

  it("guards immutable source and consent evidence, versioned updates, and terminal revocation", () => {
    expect(VOICE_ASSET_STATUSES).toEqual(["pending_review", "approved", "revoked", "deleted"]);
    for (const field of [
      "id",
      "user_id",
      "engine_id",
      "model_revision",
      "source_revision",
      "intended_use",
      "source_sha256",
      "source_mime_type",
      "source_size_bytes",
      "source_sample_rate_hz",
      "source_sample_count",
      "source_duration_seconds",
      "consent_version",
      "consent_accepted_at",
      "consent_accepted_by",
      "created_at",
    ]) {
      expect(migration).toContain(`NEW.${field}`);
      expect(migration).toContain(`OLD.${field}`);
    }
    expect(migration).toContain("NEW.version IS DISTINCT FROM OLD.version + 1");
    expect(migration).toContain("OLD.status = 'deleted'");
    expect(migration).toContain(
      "OLD.status = 'revoked' AND NEW.status NOT IN ('revoked', 'deleted')",
    );
    expect(migration).toContain("OLD.status = 'pending_review' AND NEW.status = 'approved'");
    expect(migration).toContain("NEW.updated_at := clock_timestamp()");
    expect(migration).toContain("USING ERRCODE = '23514'");
  });

  it("only clears ciphertext for deletion and retains immutable revocation evidence", () => {
    expect(migration).toContain("NEW.secret_encrypted IS DISTINCT FROM OLD.secret_encrypted");
    expect(migration).toContain("NEW.status = 'deleted' AND NEW.secret_encrypted IS NULL");
    expect(migration).toContain(
      "OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at",
    );
    const lifecycle = checks.wireline_voice_assets_lifecycle_check;
    expect(lifecycle).toContain('"secret_encrypted" IS NULL');
    expect(lifecycle).toContain('"deleted_at" IS NOT NULL');
    expect(lifecycle).toContain('"revoked_at" IS NOT NULL');
  });

  it("restricts every tenant row through the canonical role/GUC boundary", () => {
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("FROM PUBLIC");
    expect(migration).toContain("FROM anon, authenticated, service_role");
    expect(migration).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON public.wireline_voice_assets TO wireline_server",
    );
    expect(migration).toContain("FOR ALL TO wireline_server");
    expect(migration).toContain("USING (user_id = (SELECT public.wireline_current_user_id()))");
    expect(migration).toContain(
      "WITH CHECK (user_id = (SELECT public.wireline_current_user_id()))",
    );
    expect(migration).not.toContain("auth.uid()");
    expect(migration).toContain("SET search_path = ''");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.wireline_guard_voice_asset_state() FROM PUBLIC",
    );
    expect(migration).not.toContain("SECURITY DEFINER");
  });

  it("prevents duplicate active references within a tenant without making fingerprints globally unique", () => {
    const index = table.indexes.find(
      (candidate) => candidate.config.name === "uq_voice_assets_active_source",
    );
    expect(index?.config.unique).toBe(true);
    expect(index?.config.columns.map((column) => ("name" in column ? column.name : null))).toEqual([
      "user_id",
      "source_sha256",
    ]);
    expect(migration).toContain(
      "WHERE \"wireline_voice_assets\".\"status\" IN ('pending_review', 'approved')",
    );
  });

  it("journals the new migration and changes only its new table in the linked snapshot", () => {
    const journal = JSON.parse(read("drizzle/migrations/meta/_journal.json"));
    expect(journal.entries.at(-1)).toMatchObject({
      idx: 77,
      tag: "0179_inhouse_voice_assets",
      version: "7",
      breakpoints: true,
    });
    const previous = JSON.parse(read("drizzle/migrations/meta/0076_snapshot.json"));
    const next = JSON.parse(read("drizzle/migrations/meta/0077_snapshot.json"));
    expect(next.prevId).toBe(previous.id);
    expect(next.id).not.toBe(previous.id);
    expect(Object.keys(next.tables).filter((name) => !previous.tables[name])).toEqual([
      "public.wireline_voice_assets",
    ]);
    for (const [name, definition] of Object.entries(previous.tables))
      expect(next.tables[name], name).toEqual(definition);
    for (const field of ["enums", "schemas", "sequences", "roles", "policies", "views", "_meta"])
      expect(next[field], field).toEqual(previous[field]);
    expect(next.tables["public.wireline_voice_assets"].isRLSEnabled).toBe(true);
    expect(
      next.tables["public.wireline_voice_assets"].checkConstraints
        .wireline_voice_assets_consent_check.value,
    ).toContain(VOICE_ASSET_CONSENT_VERSION);
  });
});
