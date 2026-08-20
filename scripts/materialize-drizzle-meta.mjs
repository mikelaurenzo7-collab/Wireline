import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = resolve(ROOT, "drizzle/migrations/meta/0049_snapshot.json");
const TARGET = resolve(ROOT, "drizzle/migrations/meta/0050_snapshot.json");
const TARGET_0051_PATH = resolve(ROOT, "drizzle/migrations/meta/0051_snapshot.json");
const TARGET_0052_PATH = resolve(ROOT, "drizzle/migrations/meta/0052_snapshot.json");
const TARGET_0053_PATH = resolve(ROOT, "drizzle/migrations/meta/0053_snapshot.json");
const TARGET_0054_PATH = resolve(ROOT, "drizzle/migrations/meta/0054_snapshot.json");
const TARGET_SHA256 = "d745e0bbd85d3ce13003bcef03851fad1c3afd7e646516ecdd395c83b796835e";
const TARGET_ID = "1e0f1868-ced4-473b-a4cc-d0d9002571fa";
const TARGET_0051_ID = "7c4e9b2a-1f58-4d3a-9c6e-8a2b5d7f1e03";
const TARGET_0051_SHA256 = "ca35f3a7f91759ff9600900fef8d8633b58c34bebcaf17707d080d756d121068";
const TARGET_0052_ID = "96da4f2e-8d80-46e0-834f-ac2d20306fb5";
const TARGET_0052_SHA256 = "2057ac0cd45cd55bcb39e2edb27615bb6c571dbd6ed9d754cf4af4d0eadd9713";
const TARGET_0053_ID = "f8a73de7-740c-4d49-b5eb-cdcaab8c03ce";
const TARGET_0053_SHA256 = "75a6916995f0e973998e4c170b6da445acb00add28b1133a4a01114e33e41b20";
const TARGET_0054_ID = "c3ddc84a-72f2-4d8d-91a2-79f8f4c5ad16";
const TARGET_0054_SHA256 = "PENDING_COMPUTE";
const PREVIOUS_ID = "e5e34b6e-86f4-44f2-90a1-2fe4503111a2";
const TABLE_NAME = "public.wireline_xai_phone_bindings";

function hash(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function column(name, type, notNull, primaryKey = false, defaultValue) {
  return {
    name,
    type,
    primaryKey,
    notNull,
    ...(defaultValue === undefined ? {} : { default: defaultValue }),
  };
}

function index(name, expression, isUnique) {
  return {
    name,
    columns: [
      {
        expression,
        isExpression: false,
        asc: true,
        nulls: "last",
      },
    ],
    isUnique,
    concurrently: false,
    method: "btree",
    with: {},
  };
}

function foreignKey(name, columnName, targetTable) {
  return {
    name,
    tableFrom: "wireline_xai_phone_bindings",
    tableTo: targetTable,
    columnsFrom: [columnName],
    columnsTo: ["id"],
    onDelete: "cascade",
    onUpdate: "no action",
  };
}

export function buildNativeXAISnapshot(previous) {
  if (!previous || previous.id !== PREVIOUS_ID || previous.version !== "7") {
    throw new Error("0049 snapshot identity changed; refusing to synthesize 0050.");
  }

  return {
    ...previous,
    id: TARGET_ID,
    prevId: previous.id,
    tables: {
      ...previous.tables,
      "public.wireline_xai_phone_bindings": {
        name: "wireline_xai_phone_bindings",
        schema: "",
        columns: {
          id: column("id", "uuid", true, true, "gen_random_uuid()"),
          user_id: column("user_id", "uuid", true),
          agent_id: column("agent_id", "text", true),
          phone_number: column("phone_number", "text", true),
          twilio_phone_number_sid: column("twilio_phone_number_sid", "text", false),
          twilio_sip_trunk_sid: column("twilio_sip_trunk_sid", "text", false),
          xai_phone_number_id: column("xai_phone_number_id", "text", false),
          xai_webhook_id: column("xai_webhook_id", "text", false),
          webhook_secret_encrypted: column("webhook_secret_encrypted", "text", false),
          webhook_secret_last_four: column("webhook_secret_last_four", "text", false),
          status: column("status", "text", true, false, "'provisioning'"),
          provisioning_token: column("provisioning_token", "uuid", false),
          provisioning_claimed_at: column(
            "provisioning_claimed_at",
            "timestamp with time zone",
            false,
          ),
          last_error: column("last_error", "text", false),
          activated_at: column("activated_at", "timestamp with time zone", false),
          created_at: column(
            "created_at",
            "timestamp with time zone",
            true,
            false,
            "now()",
          ),
          updated_at: column(
            "updated_at",
            "timestamp with time zone",
            true,
            false,
            "now()",
          ),
        },
        indexes: {
          idx_xai_phone_bindings_user: index(
            "idx_xai_phone_bindings_user",
            "user_id",
            false,
          ),
          idx_xai_phone_bindings_agent: index(
            "idx_xai_phone_bindings_agent",
            "agent_id",
            false,
          ),
          uq_xai_phone_bindings_phone: index(
            "uq_xai_phone_bindings_phone",
            "phone_number",
            true,
          ),
          uq_xai_phone_bindings_twilio_phone: index(
            "uq_xai_phone_bindings_twilio_phone",
            "twilio_phone_number_sid",
            true,
          ),
          uq_xai_phone_bindings_xai_phone: index(
            "uq_xai_phone_bindings_xai_phone",
            "xai_phone_number_id",
            true,
          ),
          uq_xai_phone_bindings_xai_webhook: index(
            "uq_xai_phone_bindings_xai_webhook",
            "xai_webhook_id",
            true,
          ),
        },
        foreignKeys: {
          wireline_xai_phone_bindings_user_id_wireline_users_id_fk: foreignKey(
            "wireline_xai_phone_bindings_user_id_wireline_users_id_fk",
            "user_id",
            "wireline_users",
          ),
          wireline_xai_phone_bindings_agent_id_wireline_agents_id_fk: foreignKey(
            "wireline_xai_phone_bindings_agent_id_wireline_agents_id_fk",
            "agent_id",
            "wireline_agents",
          ),
        },
        compositePrimaryKeys: {},
        uniqueConstraints: {},
        policies: {},
        checkConstraints: {},
        isRLSEnabled: true,
      },
    },
  };
}

export function buildPreservedRegistrationSnapshot(nativeSnapshot) {
  if (!nativeSnapshot || nativeSnapshot.id !== TARGET_ID || nativeSnapshot.version !== "7") {
    throw new Error("0050 snapshot identity changed; refusing to synthesize 0051.");
  }
  const snapshot = structuredClone(nativeSnapshot);
  snapshot.id = TARGET_0051_ID;
  snapshot.prevId = nativeSnapshot.id;
  snapshot.tables[TABLE_NAME].foreignKeys = {};
  return snapshot;
}

export function buildGrok46DefaultsSnapshot(preservedSnapshot) {
  if (
    !preservedSnapshot ||
    preservedSnapshot.id !== TARGET_0051_ID ||
    preservedSnapshot.version !== "7"
  ) {
    throw new Error("0051 snapshot identity changed; refusing to synthesize 0052.");
  }
  const snapshot = structuredClone(preservedSnapshot);
  snapshot.id = TARGET_0052_ID;
  snapshot.prevId = preservedSnapshot.id;
  snapshot.tables["public.wireline_settings"].columns.voice_llm_model.default = "'grok-4.6'";
  return snapshot;
}

export function buildHotPathIndexSnapshot(grok46Snapshot) {
  if (!grok46Snapshot || grok46Snapshot.id !== TARGET_0052_ID || grok46Snapshot.version !== "7") {
    throw new Error("0052 snapshot identity changed; refusing to synthesize 0053.");
  }
  const snapshot = structuredClone(grok46Snapshot);
  snapshot.id = TARGET_0053_ID;
  snapshot.prevId = grok46Snapshot.id;
  return snapshot;
}

export function buildProvenanceValidationSnapshot(hotPathSnapshot) {
  if (!hotPathSnapshot || hotPathSnapshot.id !== TARGET_0053_ID || hotPathSnapshot.version !== "7") {
    throw new Error("0053 snapshot identity changed; refusing to synthesize 0054.");
  }
  // 0156 only validates an existing NOT VALID CHECK constraint. Drizzle's
  // schema snapshot has no representation for pg_constraint.convalidated, so
  // the schema shape is intentionally unchanged; only the snapshot identity
  // advances to stay aligned with the journal head.
  const snapshot = structuredClone(hotPathSnapshot);
  snapshot.id = TARGET_0054_ID;
  snapshot.prevId = hotPathSnapshot.id;
  return snapshot;
}

function writeSnapshot(path, serialized, expectedHash) {
  const actualHash = hash(serialized);
  if (expectedHash !== "PENDING_COMPUTE" && actualHash !== expectedHash) {
    throw new Error(`Generated snapshot hash mismatch for ${path}: expected ${expectedHash}, got ${actualHash}.`);
  }
  if (existsSync(path) && hash(readFileSync(path, "utf8")) === actualHash) {
    return { changed: false, path, sha256: actualHash };
  }
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, serialized, { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, path);
  return { changed: true, path, sha256: actualHash };
}

export function materializeDrizzleMeta() {
  const previous = JSON.parse(readFileSync(SOURCE, "utf8"));
  const nativeSnapshot = buildNativeXAISnapshot(previous);
  const preservedSnapshot = buildPreservedRegistrationSnapshot(nativeSnapshot);
  const nativeSerialized = `${JSON.stringify(nativeSnapshot, null, 2)}\n`;
  const preservedSerialized = `${JSON.stringify(preservedSnapshot, null, 2)}\n`;
  const grok46Snapshot = buildGrok46DefaultsSnapshot(preservedSnapshot);
  const grok46Serialized = `${JSON.stringify(grok46Snapshot, null, 2)}\n`;
  const hotPathSnapshot = buildHotPathIndexSnapshot(grok46Snapshot);
  const hotPathSerialized = `${JSON.stringify(hotPathSnapshot, null, 2)}\n`;
  const provenanceSnapshot = buildProvenanceValidationSnapshot(hotPathSnapshot);
  const provenanceSerialized = `${JSON.stringify(provenanceSnapshot, null, 2)}\n`;
  const native = writeSnapshot(TARGET, nativeSerialized, TARGET_SHA256);
  const preserved = writeSnapshot(TARGET_0051_PATH, preservedSerialized, TARGET_0051_SHA256);
  const grok46 = writeSnapshot(TARGET_0052_PATH, grok46Serialized, TARGET_0052_SHA256);
  const hotPath = writeSnapshot(TARGET_0053_PATH, hotPathSerialized, TARGET_0053_SHA256);
  const provenance = writeSnapshot(TARGET_0054_PATH, provenanceSerialized, TARGET_0054_SHA256);
  return { native, preserved, grok46, hotPath, provenance };
}

const result = materializeDrizzleMeta();
if (result.native.changed) {
  console.log(`Materialized Drizzle snapshot 0050 (${result.native.sha256.slice(0, 12)}…).`);
}
if (result.preserved.changed) {
  console.log(`Materialized Drizzle snapshot 0051 (${result.preserved.sha256.slice(0, 12)}…).`);
}
if (result.grok46.changed) {
  console.log(`Materialized Drizzle snapshot 0052 (${result.grok46.sha256.slice(0, 12)}…).`);
}
if (result.hotPath.changed) {
  console.log(`Materialized Drizzle snapshot 0053 (${result.hotPath.sha256.slice(0, 12)}…).`);
}
if (result.provenance.changed) {
  // The full hash is intentionally logged while TARGET_0054_SHA256 is pending;
  // the next commit pins it and removes the bootstrap state before merge.
  console.log(`Materialized Drizzle snapshot 0054 (${result.provenance.sha256}).`);
}
