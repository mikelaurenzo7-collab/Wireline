import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = resolve(ROOT, "drizzle/migrations/meta/0049_snapshot.json");
const TARGET = resolve(ROOT, "drizzle/migrations/meta/0050_snapshot.json");
const TARGET_SHA256 = "d745e0bbd85d3ce13003bcef03851fad1c3afd7e646516ecdd395c83b796835e";
const TARGET_ID = "1e0f1868-ced4-473b-a4cc-d0d9002571fa";
const PREVIOUS_ID = "e5e34b6e-86f4-44f2-90a1-2fe4503111a2";

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

export function materializeDrizzleMeta() {
  const previous = JSON.parse(readFileSync(SOURCE, "utf8"));
  const serialized = `${JSON.stringify(buildNativeXAISnapshot(previous), null, 2)}\n`;
  const actualHash = hash(serialized);
  if (actualHash !== TARGET_SHA256) {
    throw new Error(
      `Generated 0050 snapshot hash mismatch: expected ${TARGET_SHA256}, got ${actualHash}.`,
    );
  }

  if (existsSync(TARGET) && hash(readFileSync(TARGET, "utf8")) === TARGET_SHA256) {
    return { changed: false, path: TARGET, sha256: TARGET_SHA256 };
  }

  const temporary = `${TARGET}.tmp-${process.pid}`;
  writeFileSync(temporary, serialized, { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, TARGET);
  return { changed: true, path: TARGET, sha256: TARGET_SHA256 };
}

const result = materializeDrizzleMeta();
if (result.changed) {
  console.log(`Materialized Drizzle snapshot 0050 (${result.sha256.slice(0, 12)}…).`);
}
