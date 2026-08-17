import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const META_DIR = resolve(process.cwd(), "drizzle/migrations/meta");

function column(
  name: string,
  type: string,
  notNull: boolean,
  primaryKey = false,
  defaultValue?: string,
) {
  return {
    name,
    type,
    primaryKey,
    notNull,
    ...(defaultValue === undefined ? {} : { default: defaultValue }),
  };
}

function index(name: string, expression: string, isUnique: boolean) {
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

function foreignKey(name: string, columnName: string, targetTable: string) {
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

describe("one-build native xAI snapshot recovery", () => {
  it("emits the complete 0050 snapshot as compressed protected-log chunks", () => {
    const previous = JSON.parse(
      readFileSync(resolve(META_DIR, "0049_snapshot.json"), "utf8"),
    ) as Record<string, any>;

    const snapshot = {
      ...previous,
      id: "1e0f1868-ced4-473b-a4cc-d0d9002571fa",
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
          isRLSEnabled: false,
        },
      },
    };

    const encoded = gzipSync(Buffer.from(`${JSON.stringify(snapshot, null, 2)}\n`, "utf8"))
      .toString("base64");
    const size = 3_600;
    const chunks = Array.from(
      { length: Math.ceil(encoded.length / size) },
      (_, offset) => encoded.slice(offset * size, (offset + 1) * size),
    );
    console.log(`WIRELINE_XAI_SNAPSHOT_BEGIN:${chunks.length}`);
    chunks.forEach((chunk, offset) =>
      console.log(`WIRELINE_XAI_SNAPSHOT_CHUNK:${offset + 1}/${chunks.length}:${chunk}`),
    );
    console.log("WIRELINE_XAI_SNAPSHOT_END");
    expect(snapshot.prevId).toBe(previous.id);
    expect(snapshot.tables).toHaveProperty("public.wireline_xai_phone_bindings");
  });
});
