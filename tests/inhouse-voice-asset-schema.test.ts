import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PgDialect } from "drizzle-orm/pg-core";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  voiceAssets,
  voiceCloneEvents,
  VOICE_ASSET_CONSENT_VERSION,
  VOICE_ASSET_ENGINE_ID,
  VOICE_ASSET_MODEL_REVISION,
  VOICE_ASSET_SOURCE_REVISION,
  VOICE_ASSET_STATUSES,
  VOICE_ASSET_QUALITY_CHECK_VERSION,
  VOICE_CLONE_DELETED_REASONS,
  VOICE_CLONE_EVENT_KINDS,
  VOICE_CLONE_RETENTION_DAYS_DEFAULT,
  VOICE_CLONE_RETENTION_DAYS_MAX,
  VOICE_CLONE_RETENTION_DAYS_MIN,
  VOICE_CLONE_RETENTION_POLICY_VERSION,
} from "../src/db/voice-asset-schema";
import { redactAccountExportValue } from "../src/lib/account-export";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = read("drizzle/migrations/0179_inhouse_voice_assets.sql");
const customerLaneMigration = read("drizzle/migrations/0185_voice_clone_customer_lane.sql");
const table = getTableConfig(voiceAssets);
const eventsTable = getTableConfig(voiceCloneEvents);
const dialect = new PgDialect();
const checks = Object.fromEntries(
  table.checks.map((check) => [check.name, dialect.sqlToQuery(check.value).sql]),
);
const eventChecks = Object.fromEntries(
  eventsTable.checks.map((check) => [check.name, dialect.sqlToQuery(check.value).sql]),
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
    expect(
      journal.entries.find((entry: { tag: string }) => entry.tag === "0179_inhouse_voice_assets"),
    ).toMatchObject({
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

describe("customer voice clone preview lane schema", () => {
  it("extends the asset registry with bounded-retention customer evidence", () => {
    expect(customerLaneMigration).toContain("SET lock_timeout = '5s'");
    const columns = Object.fromEntries(table.columns.map((column) => [column.name, column]));
    expect(columns.retention_policy_version.notNull).toBe(false);
    expect(columns.expires_at.notNull).toBe(false);
    expect(columns.last_preview_at.notNull).toBe(false);
    expect(columns.deleted_reason.notNull).toBe(false);
    expect(columns.customer_visible.notNull).toBe(true);
    expect(columns.customer_visible.default).toBe(false);
    for (const name of [
      "retention_policy_version",
      "expires_at",
      "last_preview_at",
      "deleted_reason",
      "customer_visible",
    ]) {
      expect(customerLaneMigration).toContain(`ADD COLUMN IF NOT EXISTS "${name}"`);
    }
    expect(checks.wireline_voice_assets_retention_check).toContain(
      `'${VOICE_CLONE_RETENTION_POLICY_VERSION}'`,
    );
    expect(checks.wireline_voice_assets_retention_check).toContain(
      '"expires_at" > "wireline_voice_assets"."created_at"',
    );
    expect(checks.wireline_voice_assets_deleted_reason_check).toContain("'user_deleted'");
    expect(checks.wireline_voice_assets_deleted_reason_check).toContain("'retention_expired'");
    expect(checks.wireline_voice_assets_customer_visible_check).toContain(
      '"customer_visible" = false',
    );
    expect(VOICE_CLONE_DELETED_REASONS).toEqual(["user_deleted", "retention_expired"]);
    expect(VOICE_CLONE_RETENTION_DAYS_DEFAULT).toBe(30);
    expect(VOICE_CLONE_RETENTION_DAYS_MIN).toBe(1);
    expect(VOICE_CLONE_RETENTION_DAYS_MAX).toBe(365);
    for (const check of table.checks)
      expect(dialect.sqlToQuery(check.value).params, check.name).toEqual([]);
  });

  it("indexes retention expiry partially so terminal rows drop out of the sweep", () => {
    const index = table.indexes.find(
      (candidate) => candidate.config.name === "idx_voice_assets_expiry_due",
    );
    expect(index?.config.unique).toBe(false);
    expect(index?.config.columns.map((column) => ("name" in column ? column.name : null))).toEqual([
      "expires_at",
    ]);
    expect(index?.config.where).toBeTruthy();
    expect(customerLaneMigration).toContain(
      'CREATE INDEX IF NOT EXISTS "idx_voice_assets_expiry_due" ON public."wireline_voice_assets" USING btree ("expires_at") WHERE "wireline_voice_assets"."deleted_at" IS NULL',
    );
  });

  it("declares an append-only, tenant-owned event ledger with preview accounting", () => {
    expect(eventsTable.name).toBe("wireline_voice_clone_events");
    expect(eventsTable.enableRLS).toBe(true);
    const columns = Object.fromEntries(eventsTable.columns.map((column) => [column.name, column]));
    expect(columns.user_id.notNull).toBe(true);
    expect(columns.asset_id.notNull).toBe(false);
    expect(columns.kind.notNull).toBe(true);
    expect(columns.source_sha256.notNull).toBe(true);
    expect(columns.reserved_usd_micros.notNull).toBe(false);
    expect(columns.committed_usd_micros.notNull).toBe(false);
    expect(columns.engine_id.notNull).toBe(true);
    expect(columns.model_revision.notNull).toBe(true);
    expect(columns.source_revision.notNull).toBe(true);
    expect(columns.created_at.notNull).toBe(true);
    expect(VOICE_CLONE_EVENT_KINDS).toEqual([
      "created",
      "reviewed",
      "preview",
      "deleted",
      "expired",
    ]);
    for (const kind of VOICE_CLONE_EVENT_KINDS)
      expect(eventChecks.wireline_voice_clone_events_kind_check).toContain(`'${kind}'`);
    expect(eventChecks.wireline_voice_clone_events_amounts_check).toContain(
      '"committed_usd_micros" <= "wireline_voice_clone_events"."reserved_usd_micros"',
    );
    expect(eventChecks.wireline_voice_clone_events_engine_check).toContain(
      VOICE_ASSET_MODEL_REVISION,
    );
    const index = eventsTable.indexes.find(
      (candidate) => candidate.config.name === "idx_voice_clone_events_user_created",
    );
    expect(index?.config.columns.map((column) => ("name" in column ? column.name : null))).toEqual([
      "user_id",
      "created_at",
    ]);
    const fk = eventsTable.foreignKeys[0];
    expect(fk.reference().columns.map((column) => column.name)).toEqual(["user_id"]);
    expect(fk.onDelete).toBe("cascade");
    for (const check of eventsTable.checks)
      expect(dialect.sqlToQuery(check.value).params, check.name).toEqual([]);
  });

  it("guards customer state, preview stamping and terminal deletion reasons", () => {
    expect(customerLaneMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.wireline_guard_voice_asset_state()",
    );
    expect(customerLaneMigration).toContain("NEW.retention_policy_version");
    expect(customerLaneMigration).toContain("NEW.expires_at");
    expect(customerLaneMigration).toContain("NEW.customer_visible");
    expect(customerLaneMigration).toContain("NEW.last_preview_at");
    expect(customerLaneMigration).toContain("NEW.deleted_reason");
    expect(customerLaneMigration).toContain(
      "A voice reference preview observation may only record last_preview_at",
    );
    expect(customerLaneMigration).toContain(
      "A terminal voice reference deletion requires a deletion reason",
    );
    expect(customerLaneMigration).toContain(
      "A customer-visible voice reference requires bounded private-preview retention",
    );
    expect(customerLaneMigration).toContain(
      "Voice ownership, source, model, consent and retention evidence are immutable",
    );
    expect(customerLaneMigration).toContain("NEW.updated_at := clock_timestamp()");
    expect(customerLaneMigration).toContain("USING ERRCODE = '23514'");
    expect(customerLaneMigration).toContain(
      'BEFORE INSERT OR UPDATE ON public."wireline_voice_assets"',
    );
  });

  it("makes the ledger immutable to tenants but erasable by the terminal account purge", () => {
    expect(customerLaneMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.wireline_guard_voice_clone_event_ledger()",
    );
    expect(customerLaneMigration).toContain("IF TG_OP = 'UPDATE' THEN");
    expect(customerLaneMigration).toContain("Voice clone preview ledger rows are immutable");
    expect(customerLaneMigration).toContain(
      "NULLIF(current_setting('app.current_user_id', true), '') IS NOT NULL",
    );
    expect(customerLaneMigration).toContain(
      "Voice clone preview ledger rows can only be erased by terminal account deletion",
    );
    expect(customerLaneMigration).toContain(
      'BEFORE UPDATE OR DELETE ON public."wireline_voice_clone_events"',
    );
    expect(customerLaneMigration).toContain(
      "GRANT SELECT, INSERT ON public.wireline_voice_clone_events TO wireline_server",
    );
    expect(customerLaneMigration).not.toMatch(
      /GRANT[^;]*UPDATE[^;]*ON public\.wireline_voice_clone_events/,
    );
    expect(customerLaneMigration).not.toMatch(
      /GRANT[^;]*DELETE[^;]*ON public\.wireline_voice_clone_events/,
    );
    expect(customerLaneMigration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(customerLaneMigration).toContain("FROM anon, authenticated, service_role");
    expect(customerLaneMigration).toContain(
      "USING (user_id = (SELECT public.wireline_current_user_id()))",
    );
    expect(customerLaneMigration).not.toContain("auth.uid()");
    expect(customerLaneMigration).not.toContain("SECURITY DEFINER");
  });

  it("never touches the live-call runtime, plan catalog or provider selection", () => {
    expect(customerLaneMigration).not.toMatch(/UPDATE\s+(?:public\.)?["']?wireline_agents/i);
    expect(customerLaneMigration).not.toMatch(/UPDATE\s+(?:public\.)?["']?wireline_call_logs/i);
    expect(customerLaneMigration).not.toContain("voice_provider =");
    expect(customerLaneMigration).not.toContain("voice_id =");
    expect(customerLaneMigration).not.toContain("DROP TABLE");
    expect(customerLaneMigration).not.toMatch(/ALTER TABLE public\."?wireline_agents/i);
    expect(customerLaneMigration).not.toMatch(/intended_use\s*=/);
  });

  it("journals the 0185 migration and keeps its snapshot chain linked to 0082", () => {
    const journal = JSON.parse(read("drizzle/migrations/meta/_journal.json"));
    expect(
      journal.entries.find(
        (entry: { tag: string }) => entry.tag === "0185_voice_clone_customer_lane",
      ),
    ).toMatchObject({
      idx: 83,
      tag: "0185_voice_clone_customer_lane",
      version: "7",
      breakpoints: true,
    });
    expect(
      journal.entries.find((entry: { tag: string }) => entry.tag === "0184_agent_call_recording"),
    ).toMatchObject({ idx: 82 });
    const previous = JSON.parse(read("drizzle/migrations/meta/0082_snapshot.json"));
    const next = JSON.parse(read("drizzle/migrations/meta/0083_snapshot.json"));
    expect(next.prevId).toBe(previous.id);
    expect(next.id).not.toBe(previous.id);
    expect(Object.keys(next.tables).filter((name) => !previous.tables[name])).toEqual([
      "public.wireline_voice_clone_events",
    ]);
    for (const [name, definition] of Object.entries(previous.tables))
      if (name !== "public.wireline_voice_assets")
        expect(next.tables[name], name).toEqual(definition);
    expect(next.tables["public.wireline_voice_assets"].columns.customer_visible).toMatchObject({
      type: "boolean",
      notNull: true,
      default: false,
    });
    expect(next.tables["public.wireline_voice_assets"].columns.expires_at).toMatchObject({
      type: "timestamp with time zone",
      notNull: false,
    });
    expect(next.tables["public.wireline_voice_assets"].checkConstraints).toHaveProperty(
      "wireline_voice_assets_retention_check",
    );
    expect(next.tables["public.wireline_voice_assets"].indexes).toHaveProperty(
      "idx_voice_assets_expiry_due",
    );
    expect(next.tables["public.wireline_voice_clone_events"].isRLSEnabled).toBe(true);
    for (const field of ["enums", "schemas", "sequences", "roles", "policies", "views", "_meta"])
      expect(next[field], field).toEqual(previous[field]);
  });

  it("purges ledger evidence with the account before its references", () => {
    const source = read("src/lib/account-deletion.ts");
    expect(source).toContain('{ table: "wireline_voice_clone_events", userColumns: ["user_id"] }');
    expect(source).toContain('{ table: "wireline_voice_assets", userColumns: ["user_id"] }');
    expect(source.indexOf('"wireline_voice_clone_events"')).toBeLessThan(
      source.indexOf('"wireline_voice_assets"'),
    );
  });
});
