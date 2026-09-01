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
const TARGET_0055_PATH = resolve(ROOT, "drizzle/migrations/meta/0055_snapshot.json");
const TARGET_0056_PATH = resolve(ROOT, "drizzle/migrations/meta/0056_snapshot.json");
const TARGET_0057_PATH = resolve(ROOT, "drizzle/migrations/meta/0057_snapshot.json");
const TARGET_0058_PATH = resolve(ROOT, "drizzle/migrations/meta/0058_snapshot.json");
const TARGET_0059_PATH = resolve(ROOT, "drizzle/migrations/meta/0059_snapshot.json");
const TARGET_0060_PATH = resolve(ROOT, "drizzle/migrations/meta/0060_snapshot.json");
const TARGET_0061_PATH = resolve(ROOT, "drizzle/migrations/meta/0061_snapshot.json");
const SOURCE_0062_PATH = resolve(ROOT, "drizzle/migrations/meta/0062_snapshot.json");
const TARGET_0063_PATH = resolve(ROOT, "drizzle/migrations/meta/0063_snapshot.json");
const TARGET_0064_PATH = resolve(ROOT, "drizzle/migrations/meta/0064_snapshot.json");
const TARGET_0065_PATH = resolve(ROOT, "drizzle/migrations/meta/0065_snapshot.json");
const TARGET_0066_PATH = resolve(ROOT, "drizzle/migrations/meta/0066_snapshot.json");
const TARGET_0067_PATH = resolve(ROOT, "drizzle/migrations/meta/0067_snapshot.json");
const TARGET_0068_PATH = resolve(ROOT, "drizzle/migrations/meta/0068_snapshot.json");
const TARGET_0069_PATH = resolve(ROOT, "drizzle/migrations/meta/0069_snapshot.json");
const TARGET_0070_PATH = resolve(ROOT, "drizzle/migrations/meta/0070_snapshot.json");
const TARGET_SHA256 = "d745e0bbd85d3ce13003bcef03851fad1c3afd7e646516ecdd395c83b796835e";
const TARGET_ID = "1e0f1868-ced4-473b-a4cc-d0d9002571fa";
const TARGET_0051_ID = "7c4e9b2a-1f58-4d3a-9c6e-8a2b5d7f1e03";
const TARGET_0051_SHA256 = "ca35f3a7f91759ff9600900fef8d8633b58c34bebcaf17707d080d756d121068";
const TARGET_0052_ID = "96da4f2e-8d80-46e0-834f-ac2d20306fb5";
const TARGET_0052_SHA256 = "2057ac0cd45cd55bcb39e2edb27615bb6c571dbd6ed9d754cf4af4d0eadd9713";
const TARGET_0053_ID = "f8a73de7-740c-4d49-b5eb-cdcaab8c03ce";
const TARGET_0053_SHA256 = "75a6916995f0e973998e4c170b6da445acb00add28b1133a4a01114e33e41b20";
const TARGET_0054_ID = "3d2b8f06-4a7f-4d76-9e31-6c5b8071a942";
const TARGET_0054_SHA256 = "8081f5bab348dd484e15e6e6780aa13edfc3993c0f8f22fff7e524ad80d86757";
const TARGET_0055_ID = "53c88e83-547e-4a92-bcfe-3cf5c4af9348";
const TARGET_0055_SHA256 = "8c36f3aa40d6fe815f64f70c07e2834b8eabb6f465c9e9ad2cf6c2cc91efedd8";
const TARGET_0056_ID = "b7c9f8a1-3e52-4d86-9b47-1a2f6e5c8d30";
const TARGET_0056_SHA256 = "cdac9aed8da908488c960ada9603fe29b11686ade57f6d8dd2998cdef8e853e5";
const TARGET_0057_ID = "e4a2d671-9b35-4f08-8c2e-6d1a7f934b50";
const TARGET_0057_SHA256 = "a322c3bbf0f2bedd18ae362a25cbf484dfe14d4b184eb647d6bea5e663ed1331";
const TARGET_0058_ID = "7d73fe9a-4a4f-4aac-82b2-9b2c46b04a17";
const TARGET_0058_SHA256 = "f1d426d1694617aec08552e1130754ffae2b8fa77127eb5b5cbb917a4b3dc758";
const TARGET_0059_ID = "a91c5e76-13ac-4d43-bd80-7fb8d864c9a1";
const TARGET_0059_SHA256 = "8e03fd5268b0991b279297d80be736224a9d0a164ea0e22dd5df78864012508f";
const TARGET_0060_ID = "b6d92ed4-2df5-43b6-a8b2-f4816dc34fa2";
const TARGET_0060_SHA256 = "2b11dbd447336abc4ccb4301b00a0abe87e12996417e9eefa42a5349fe81e212";
const TARGET_0061_ID = "7564a2ba-adb5-47fe-9abb-990b35c20b69";
const TARGET_0061_SHA256 = "c3f10b6940fef1e026e4c837fb3a4ba1ff9cdc3f479351c2cd841fc20b8a2090";
const SOURCE_0062_ID = "a905b7c9-a1f8-4796-a294-bccc09db5601";
const SOURCE_0062_SHA256 = "ebc456e87118028b0c17e34db67f744f4d2cb0ee70024ccd3583805d17043a1e";
const TARGET_0063_ID = "d8764100-e1b8-4d00-8abb-b876d90b3828";
const TARGET_0063_SHA256 = "ee649aa201d1ef54f3dab1dc90ea615ae00ae5bce0ff763cabfb027458a07367";
const TARGET_0064_ID = "6c735f69-77f0-4c5f-9d61-2f1f7e4543a8";
const TARGET_0064_SHA256 = "823ff657a10c975cc63a9dc2707dc1abc4a6c3726f42e769b7e96ddba020bd79";
const TARGET_0065_ID = "065505d7-57b1-42ce-a9c0-50f6d3490ae9";
const TARGET_0065_SHA256 = "0eed50cf6d3264d03712ad69001b98c5b08310b6e0e1a683f625ba21a7cc48f7";
const TARGET_0066_ID = "94a4f6ab-bbf1-4c63-9c36-2e1370d22068";
const TARGET_0066_SHA256 = "2deb591dd9d837e4cad0de81078324f8d865352ca348fe16acbecbfe4d3432b6";
const TARGET_0067_ID = "46517560-a4ac-4edb-b423-91352eff46ae";
const TARGET_0067_SHA256 = "3e32979541bc416ae5ccea055cedca540e5ad67af54ee0aca7c9b52c45ab41d9";
const TARGET_0068_ID = "0634832a-0159-460f-90dd-8c581d0358e1";
const TARGET_0068_SHA256 = "19a7b218f8979b97956f98e3542317a64f305bbc89588c9babb2fe76380aaaad";
const TARGET_0069_ID = "4382dc6d-ceac-4f3a-a61a-136ddc895d17";
const TARGET_0069_SHA256 = "e4ca6264c71f0cf1307d4f5cf101622b0dc871800d175ff10cde7a3afd2ced58";
const TARGET_0070_ID = "ee0cd15b-c76d-4247-9fca-5ad417fc3638";
const TARGET_0070_SHA256 = "d2552ae27ab62f58dd9b1dcb11bdc4d4075568b559e4ccd166d17f3046c7d044";
const PREVIOUS_ID = "e5e34b6e-86f4-44f2-90a1-2fe4503111a2";
const TABLE_NAME = "public.wireline_xai_phone_bindings";
const LEGACY_VOICE_TABLE_NAME = "public.wireline_cloned_voices";
const SMS_THREADS_TABLE_NAME = "public.wireline_sms_threads";
const SMS_SEND_OPERATIONS_TABLE_NAME = "public.wireline_sms_send_operations";

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
          created_at: column("created_at", "timestamp with time zone", true, false, "now()"),
          updated_at: column("updated_at", "timestamp with time zone", true, false, "now()"),
        },
        indexes: {
          idx_xai_phone_bindings_user: index("idx_xai_phone_bindings_user", "user_id", false),
          idx_xai_phone_bindings_agent: index("idx_xai_phone_bindings_agent", "agent_id", false),
          uq_xai_phone_bindings_phone: index("uq_xai_phone_bindings_phone", "phone_number", true),
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

export function buildOpenAIRuntimeCohesionSnapshot(hotPathSnapshot) {
  if (
    !hotPathSnapshot ||
    hotPathSnapshot.id !== TARGET_0053_ID ||
    hotPathSnapshot.version !== "7"
  ) {
    throw new Error("0053 snapshot identity changed; refusing to synthesize 0054.");
  }
  const snapshot = structuredClone(hotPathSnapshot);
  snapshot.id = TARGET_0054_ID;
  snapshot.prevId = hotPathSnapshot.id;
  const settings = snapshot.tables["public.wireline_settings"].columns;
  settings.voice_llm_provider.default = "'openai'";
  settings.voice_llm_model.default = "'gpt-4o'";
  return snapshot;
}

export function buildAuditSystemReceiptSnapshot(openaiRuntimeSnapshot) {
  if (
    !openaiRuntimeSnapshot ||
    openaiRuntimeSnapshot.id !== TARGET_0054_ID ||
    openaiRuntimeSnapshot.version !== "7"
  ) {
    throw new Error("0054 snapshot identity changed; refusing to synthesize 0055.");
  }
  const snapshot = structuredClone(openaiRuntimeSnapshot);
  snapshot.id = TARGET_0055_ID;
  snapshot.prevId = openaiRuntimeSnapshot.id;
  const auditLog = snapshot.tables["public.wireline_audit_log"];
  auditLog.columns.user_id.notNull = false;
  auditLog.isRLSEnabled = true;
  auditLog.indexes.uq_audit_account_deletion_receipt = {
    name: "uq_audit_account_deletion_receipt",
    columns: [
      { expression: "event_type", isExpression: false, asc: true, nulls: "last" },
      { expression: "resource_type", isExpression: false, asc: true, nulls: "last" },
      { expression: "resource_id", isExpression: false, asc: true, nulls: "last" },
    ],
    isUnique: true,
    where:
      "event_type = 'account.deletion.completed' AND resource_type = 'account_deletion_receipt' AND resource_id IS NOT NULL",
    concurrently: false,
    method: "btree",
    with: {},
  };
  return snapshot;
}

export function buildResolvedOrphanScrubSnapshot(auditSystemReceiptSnapshot) {
  if (
    !auditSystemReceiptSnapshot ||
    auditSystemReceiptSnapshot.id !== TARGET_0055_ID ||
    auditSystemReceiptSnapshot.version !== "7"
  ) {
    throw new Error("0055 snapshot identity changed; refusing to synthesize 0056.");
  }
  const snapshot = structuredClone(auditSystemReceiptSnapshot);
  snapshot.id = TARGET_0056_ID;
  snapshot.prevId = auditSystemReceiptSnapshot.id;
  return snapshot;
}

export function buildRetiredXAIBindingIdentitySnapshot(resolvedOrphanScrubSnapshot) {
  if (
    !resolvedOrphanScrubSnapshot ||
    resolvedOrphanScrubSnapshot.id !== TARGET_0056_ID ||
    resolvedOrphanScrubSnapshot.version !== "7"
  ) {
    throw new Error("0056 snapshot identity changed; refusing to synthesize 0057.");
  }
  const snapshot = structuredClone(resolvedOrphanScrubSnapshot);
  snapshot.id = TARGET_0057_ID;
  snapshot.prevId = resolvedOrphanScrubSnapshot.id;
  snapshot.tables[TABLE_NAME].checkConstraints.wireline_xai_binding_owner_identity = {
    name: "wireline_xai_binding_owner_identity",
    value:
      "(((user_id = id AND agent_id = ('retired:' || id::text)) AND status IN ('retired', 'error')) OR ((user_id <> id AND agent_id <> ('retired:' || id::text)) AND status <> 'retired'))",
  };
  return snapshot;
}

export function buildAuditCascadeSnapshot(retiredXAIBindingIdentitySnapshot) {
  if (
    !retiredXAIBindingIdentitySnapshot ||
    retiredXAIBindingIdentitySnapshot.id !== TARGET_0057_ID ||
    retiredXAIBindingIdentitySnapshot.version !== "7"
  ) {
    throw new Error("0057 snapshot identity changed; refusing to synthesize 0058.");
  }
  const snapshot = structuredClone(retiredXAIBindingIdentitySnapshot);
  snapshot.id = TARGET_0058_ID;
  snapshot.prevId = retiredXAIBindingIdentitySnapshot.id;
  snapshot.tables["public.wireline_audit_log"].foreignKeys = {
    wireline_audit_log_user_id_wireline_users_id_fk: {
      name: "wireline_audit_log_user_id_wireline_users_id_fk",
      tableFrom: "wireline_audit_log",
      tableTo: "wireline_users",
      columnsFrom: ["user_id"],
      columnsTo: ["id"],
      onDelete: "cascade",
      onUpdate: "no action",
    },
  };
  return snapshot;
}

export function buildAccountOperationLeaseSnapshot(auditCascadeSnapshot) {
  if (!auditCascadeSnapshot || auditCascadeSnapshot.id !== TARGET_0058_ID) {
    throw new Error("0058 snapshot identity changed; refusing to synthesize 0059.");
  }
  const snapshot = structuredClone(auditCascadeSnapshot);
  snapshot.id = TARGET_0059_ID;
  snapshot.prevId = auditCascadeSnapshot.id;
  snapshot.tables["public.wireline_account_operation_leases"] = {
    name: "wireline_account_operation_leases",
    schema: "",
    columns: {
      id: column("id", "uuid", true, true, "gen_random_uuid()"),
      user_id: column("user_id", "uuid", true),
      kind: column("kind", "text", true),
      operation: column("operation", "text", true),
      expires_at: column("expires_at", "timestamp with time zone", true),
      created_at: column("created_at", "timestamp with time zone", true, false, "now()"),
    },
    indexes: {
      idx_account_operation_leases_active_user: {
        name: "idx_account_operation_leases_active_user",
        columns: [
          { expression: "user_id", isExpression: false, asc: true, nulls: "last" },
          { expression: "expires_at", isExpression: false, asc: true, nulls: "last" },
        ],
        isUnique: false,
        concurrently: false,
        method: "btree",
        with: {},
      },
    },
    foreignKeys: {
      wireline_account_operation_leases_user_id_wireline_users_id_fk: {
        name: "wireline_account_operation_leases_user_id_wireline_users_id_fk",
        tableFrom: "wireline_account_operation_leases",
        tableTo: "wireline_users",
        columnsFrom: ["user_id"],
        columnsTo: ["id"],
        onDelete: "cascade",
        onUpdate: "no action",
      },
    },
    compositePrimaryKeys: {},
    uniqueConstraints: {},
    policies: {},
    checkConstraints: {
      wireline_account_operation_leases_kind_check: {
        name: "wireline_account_operation_leases_kind_check",
        value: "kind IN ('billing', 'provider')",
      },
    },
    isRLSEnabled: true,
  };
  return snapshot;
}

export function buildSubscriptionCascadeSnapshot(accountOperationLeaseSnapshot) {
  if (!accountOperationLeaseSnapshot || accountOperationLeaseSnapshot.id !== TARGET_0059_ID) {
    throw new Error("0059 snapshot identity changed; refusing to synthesize 0060.");
  }
  const snapshot = structuredClone(accountOperationLeaseSnapshot);
  snapshot.id = TARGET_0060_ID;
  snapshot.prevId = accountOperationLeaseSnapshot.id;
  snapshot.tables["public.wireline_subscriptions"].foreignKeys = {
    wireline_subscriptions_user_id_wireline_users_id_fk: {
      name: "wireline_subscriptions_user_id_wireline_users_id_fk",
      tableFrom: "wireline_subscriptions",
      tableTo: "wireline_users",
      columnsFrom: ["user_id"],
      columnsTo: ["id"],
      onDelete: "cascade",
      onUpdate: "no action",
    },
  };
  return snapshot;
}

export function buildAccountEnvironmentPromotionGuardSnapshot(subscriptionCascadeSnapshot) {
  if (!subscriptionCascadeSnapshot || subscriptionCascadeSnapshot.id !== TARGET_0060_ID) {
    throw new Error("0060 snapshot identity changed; refusing to synthesize 0061.");
  }
  const snapshot = structuredClone(subscriptionCascadeSnapshot);
  snapshot.id = TARGET_0061_ID;
  snapshot.prevId = subscriptionCascadeSnapshot.id;
  return snapshot;
}

export function buildLegacyAuditOrphanReconciliationSnapshot(stripeClaimFencingSnapshot) {
  if (
    !stripeClaimFencingSnapshot ||
    stripeClaimFencingSnapshot.id !== SOURCE_0062_ID ||
    stripeClaimFencingSnapshot.version !== "7"
  ) {
    throw new Error("0062 snapshot identity changed; refusing to synthesize 0063.");
  }
  const snapshot = structuredClone(stripeClaimFencingSnapshot);
  snapshot.id = TARGET_0063_ID;
  snapshot.prevId = stripeClaimFencingSnapshot.id;
  return snapshot;
}

export function buildAgentIdentityMarkSnapshot(legacyAuditOrphanReconciliationSnapshot) {
  if (
    !legacyAuditOrphanReconciliationSnapshot ||
    legacyAuditOrphanReconciliationSnapshot.id !== TARGET_0063_ID ||
    legacyAuditOrphanReconciliationSnapshot.version !== "7"
  ) {
    throw new Error("0063 snapshot identity changed; refusing to synthesize 0064.");
  }
  const snapshot = structuredClone(legacyAuditOrphanReconciliationSnapshot);
  snapshot.id = TARGET_0064_ID;
  snapshot.prevId = legacyAuditOrphanReconciliationSnapshot.id;
  const agents = snapshot.tables["public.wireline_agents"];
  if (!agents) {
    throw new Error("wireline_agents is missing; refusing to synthesize 0064.");
  }
  agents.columns.mark_key = column("mark_key", "text", false);
  agents.checkConstraints.wireline_agents_mark_key_check = {
    name: "wireline_agents_mark_key_check",
    value:
      '"wireline_agents"."mark_key" IS NULL OR "wireline_agents"."mark_key" ~ \'^(orbit|beacon|spark|prism|flow|pulse|compass|focus|aperture|wave|helix|loop|nova|route|vertex)-(violet|blue|rose|amber|teal|magenta|indigo|slate)$\'',
  };
  agents.indexes.uq_wireline_agents_user_mark_key = {
    name: "uq_wireline_agents_user_mark_key",
    columns: [
      { expression: "user_id", isExpression: false, asc: true, nulls: "last" },
      { expression: "mark_key", isExpression: false, asc: true, nulls: "last" },
    ],
    isUnique: true,
    where: '"wireline_agents"."mark_key" IS NOT NULL',
    concurrently: false,
    method: "btree",
    with: {},
  };
  return snapshot;
}

export function buildPaidBotIdentityJobSnapshot(agentIdentityMarkSnapshot) {
  if (
    !agentIdentityMarkSnapshot ||
    agentIdentityMarkSnapshot.id !== TARGET_0064_ID ||
    agentIdentityMarkSnapshot.version !== "7"
  ) {
    throw new Error("0064 snapshot identity changed; refusing to synthesize 0065.");
  }
  const snapshot = structuredClone(agentIdentityMarkSnapshot);
  snapshot.id = TARGET_0065_ID;
  snapshot.prevId = agentIdentityMarkSnapshot.id;
  const jobs = snapshot.tables["public.wireline_jobs"];
  if (!jobs) {
    throw new Error("wireline_jobs is missing; refusing to synthesize 0065.");
  }
  jobs.indexes.uq_jobs_paid_bot_identity_active = {
    name: "uq_jobs_paid_bot_identity_active",
    columns: [
      { expression: "user_id", isExpression: false, asc: true, nulls: "last" },
      {
        expression: "(\"payload\"->>'agentId')",
        isExpression: true,
        asc: true,
        nulls: "last",
      },
    ],
    isUnique: true,
    where:
      '"wireline_jobs"."type" = \'paid_bot_identity_reconcile\' AND ("wireline_jobs"."payload"->>\'agentId\') IS NOT NULL AND "wireline_jobs"."status" IN (\'pending\', \'running\', \'failed\')',
    concurrently: false,
    method: "btree",
    with: {},
  };
  return snapshot;
}

export function buildOpenAIRealtimeVoiceSnapshot(paidBotIdentityJobSnapshot) {
  if (
    !paidBotIdentityJobSnapshot ||
    paidBotIdentityJobSnapshot.id !== TARGET_0065_ID ||
    paidBotIdentityJobSnapshot.version !== "7"
  ) {
    throw new Error("0065 snapshot identity changed; refusing to synthesize 0066.");
  }
  const snapshot = structuredClone(paidBotIdentityJobSnapshot);
  snapshot.id = TARGET_0066_ID;
  snapshot.prevId = paidBotIdentityJobSnapshot.id;

  const agents = snapshot.tables["public.wireline_agents"].columns;
  agents.voice_provider.default = "'openai'";
  agents.voice_id.default = "'marin'";

  const settings = snapshot.tables["public.wireline_settings"].columns;
  settings.voice_llm_provider.default = "'openai'";
  settings.voice_llm_model.default = "'gpt-realtime-2.1'";
  return snapshot;
}

export function buildLegacyVoiceProviderRemovalSnapshot(openAIRealtimeVoiceSnapshot) {
  if (
    !openAIRealtimeVoiceSnapshot ||
    openAIRealtimeVoiceSnapshot.id !== TARGET_0066_ID ||
    openAIRealtimeVoiceSnapshot.version !== "7"
  ) {
    throw new Error("0066 snapshot identity changed; refusing to synthesize 0067.");
  }
  if (!openAIRealtimeVoiceSnapshot.tables[LEGACY_VOICE_TABLE_NAME]) {
    throw new Error("Legacy voice table is missing; refusing to synthesize 0067.");
  }
  const snapshot = structuredClone(openAIRealtimeVoiceSnapshot);
  snapshot.id = TARGET_0067_ID;
  snapshot.prevId = openAIRealtimeVoiceSnapshot.id;
  delete snapshot.tables[LEGACY_VOICE_TABLE_NAME];
  return snapshot;
}

export function buildSmsDestinationRoutingSnapshot(legacyVoiceProviderRemovalSnapshot) {
  if (
    !legacyVoiceProviderRemovalSnapshot ||
    legacyVoiceProviderRemovalSnapshot.id !== TARGET_0067_ID ||
    legacyVoiceProviderRemovalSnapshot.version !== "7"
  ) {
    throw new Error("0067 snapshot identity changed; refusing to synthesize 0068.");
  }
  const snapshot = structuredClone(legacyVoiceProviderRemovalSnapshot);
  snapshot.id = TARGET_0068_ID;
  snapshot.prevId = legacyVoiceProviderRemovalSnapshot.id;
  const threads = snapshot.tables[SMS_THREADS_TABLE_NAME];
  if (!threads) {
    throw new Error("SMS thread table is missing; refusing to synthesize 0068.");
  }
  threads.columns.destination_number = column("destination_number", "text", false);
  delete threads.indexes.idx_sms_threads_user_customer;
  threads.indexes.idx_sms_threads_user_destination_customer = {
    name: "idx_sms_threads_user_destination_customer",
    columns: [
      { expression: "user_id", isExpression: false, asc: true, nulls: "last" },
      { expression: "destination_number", isExpression: false, asc: true, nulls: "last" },
      { expression: "customer_number", isExpression: false, asc: true, nulls: "last" },
    ],
    isUnique: true,
    where: '"wireline_sms_threads"."destination_number" IS NOT NULL',
    concurrently: false,
    method: "btree",
    with: {},
  };
  threads.indexes.idx_sms_threads_legacy_user_customer = {
    name: "idx_sms_threads_legacy_user_customer",
    columns: [
      { expression: "user_id", isExpression: false, asc: true, nulls: "last" },
      { expression: "customer_number", isExpression: false, asc: true, nulls: "last" },
    ],
    isUnique: true,
    where: '"wireline_sms_threads"."destination_number" IS NULL',
    concurrently: false,
    method: "btree",
    with: {},
  };
  return snapshot;
}

export function buildSmsSendIdempotencySnapshot(smsDestinationRoutingSnapshot) {
  if (
    !smsDestinationRoutingSnapshot ||
    smsDestinationRoutingSnapshot.id !== TARGET_0068_ID ||
    smsDestinationRoutingSnapshot.version !== "7"
  ) {
    throw new Error("0068 snapshot identity changed; refusing to synthesize 0069.");
  }
  const snapshot = structuredClone(smsDestinationRoutingSnapshot);
  snapshot.id = TARGET_0069_ID;
  snapshot.prevId = smsDestinationRoutingSnapshot.id;
  snapshot.tables[SMS_SEND_OPERATIONS_TABLE_NAME] = {
    name: "wireline_sms_send_operations",
    schema: "",
    columns: {
      id: column("id", "uuid", true, true, "gen_random_uuid()"),
      user_id: column("user_id", "uuid", true),
      thread_id: column("thread_id", "uuid", true),
      idempotency_key: column("idempotency_key", "text", true),
      request_hash: column("request_hash", "text", true),
      status: column("status", "text", true, false, "'reserved'"),
      provider_sid: column("provider_sid", "text", false),
      provider_status: column("provider_status", "text", false),
      failure_code: column("failure_code", "text", false),
      created_at: column("created_at", "timestamp with time zone", true, false, "now()"),
      updated_at: column("updated_at", "timestamp with time zone", true, false, "now()"),
    },
    indexes: {
      uq_sms_send_operations_user_idempotency: {
        name: "uq_sms_send_operations_user_idempotency",
        columns: [
          { expression: "user_id", isExpression: false, asc: true, nulls: "last" },
          { expression: "idempotency_key", isExpression: false, asc: true, nulls: "last" },
        ],
        isUnique: true,
        concurrently: false,
        method: "btree",
        with: {},
      },
      idx_sms_send_operations_thread_created: {
        name: "idx_sms_send_operations_thread_created",
        columns: [
          { expression: "thread_id", isExpression: false, asc: true, nulls: "last" },
          { expression: "created_at", isExpression: false, asc: true, nulls: "last" },
        ],
        isUnique: false,
        concurrently: false,
        method: "btree",
        with: {},
      },
    },
    foreignKeys: {
      wireline_sms_send_operations_user_id_wireline_users_id_fk: {
        name: "wireline_sms_send_operations_user_id_wireline_users_id_fk",
        tableFrom: "wireline_sms_send_operations",
        tableTo: "wireline_users",
        columnsFrom: ["user_id"],
        columnsTo: ["id"],
        onDelete: "cascade",
        onUpdate: "no action",
      },
      wireline_sms_send_operations_thread_id_wireline_sms_threads_id_fk: {
        name: "wireline_sms_send_operations_thread_id_wireline_sms_threads_id_fk",
        tableFrom: "wireline_sms_send_operations",
        tableTo: "wireline_sms_threads",
        columnsFrom: ["thread_id"],
        columnsTo: ["id"],
        onDelete: "cascade",
        onUpdate: "no action",
      },
    },
    compositePrimaryKeys: {},
    uniqueConstraints: {},
    policies: {},
    checkConstraints: {
      wireline_sms_send_operations_status_check: {
        name: "wireline_sms_send_operations_status_check",
        value:
          '"wireline_sms_send_operations"."status" IN (\'reserved\', \'attempting\', \'accepted\', \'rejected\', \'ambiguous\')',
      },
    },
    isRLSEnabled: true,
  };
  return snapshot;
}

export function buildRetiredXAIVoiceBindingRemovalSnapshot(smsSendIdempotencySnapshot) {
  if (
    !smsSendIdempotencySnapshot ||
    smsSendIdempotencySnapshot.id !== TARGET_0069_ID ||
    smsSendIdempotencySnapshot.version !== "7"
  ) {
    throw new Error("0069 snapshot identity changed; refusing to synthesize 0070.");
  }
  if (!smsSendIdempotencySnapshot.tables[TABLE_NAME]) {
    throw new Error("Retired xAI binding table is missing; refusing to synthesize 0070.");
  }
  const snapshot = structuredClone(smsSendIdempotencySnapshot);
  snapshot.id = TARGET_0070_ID;
  snapshot.prevId = smsSendIdempotencySnapshot.id;
  delete snapshot.tables[TABLE_NAME];
  return snapshot;
}

function writeSnapshot(path, serialized, expectedHash) {
  const actualHash = hash(serialized);
  if (expectedHash !== "PENDING_COMPUTE" && actualHash !== expectedHash) {
    throw new Error(
      `Generated snapshot hash mismatch for ${path}: expected ${expectedHash}, got ${actualHash}.`,
    );
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
  const openaiRuntimeSnapshot = buildOpenAIRuntimeCohesionSnapshot(hotPathSnapshot);
  const openaiRuntimeSerialized = `${JSON.stringify(openaiRuntimeSnapshot, null, 2)}\n`;
  const auditSystemReceiptSnapshot = buildAuditSystemReceiptSnapshot(openaiRuntimeSnapshot);
  const auditSystemReceiptSerialized = `${JSON.stringify(auditSystemReceiptSnapshot, null, 2)}\n`;
  const resolvedOrphanScrubSnapshot = buildResolvedOrphanScrubSnapshot(auditSystemReceiptSnapshot);
  const resolvedOrphanScrubSerialized = `${JSON.stringify(resolvedOrphanScrubSnapshot, null, 2)}\n`;
  const retiredXAIBindingIdentitySnapshot = buildRetiredXAIBindingIdentitySnapshot(
    resolvedOrphanScrubSnapshot,
  );
  const retiredXAIBindingIdentitySerialized = `${JSON.stringify(retiredXAIBindingIdentitySnapshot, null, 2)}\n`;
  const auditCascadeSnapshot = buildAuditCascadeSnapshot(retiredXAIBindingIdentitySnapshot);
  const auditCascadeSerialized = `${JSON.stringify(auditCascadeSnapshot, null, 2)}\n`;
  const accountOperationLeaseSnapshot = buildAccountOperationLeaseSnapshot(auditCascadeSnapshot);
  const accountOperationLeaseSerialized = `${JSON.stringify(accountOperationLeaseSnapshot, null, 2)}\n`;
  const subscriptionCascadeSnapshot = buildSubscriptionCascadeSnapshot(
    accountOperationLeaseSnapshot,
  );
  const subscriptionCascadeSerialized = `${JSON.stringify(subscriptionCascadeSnapshot, null, 2)}\n`;
  const accountEnvironmentPromotionGuardSnapshot = buildAccountEnvironmentPromotionGuardSnapshot(
    subscriptionCascadeSnapshot,
  );
  const accountEnvironmentPromotionGuardSerialized = `${JSON.stringify(accountEnvironmentPromotionGuardSnapshot, null, 2)}\n`;
  const stripeClaimFencingSerialized = readFileSync(SOURCE_0062_PATH, "utf8");
  if (hash(stripeClaimFencingSerialized) !== SOURCE_0062_SHA256) {
    throw new Error("0062 snapshot hash changed; refusing to synthesize 0063.");
  }
  const stripeClaimFencingSnapshot = JSON.parse(stripeClaimFencingSerialized);
  const legacyAuditOrphanReconciliationSnapshot = buildLegacyAuditOrphanReconciliationSnapshot(
    stripeClaimFencingSnapshot,
  );
  const legacyAuditOrphanReconciliationSerialized = `${JSON.stringify(legacyAuditOrphanReconciliationSnapshot, null, 2)}\n`;
  const agentIdentityMarkSnapshot = buildAgentIdentityMarkSnapshot(
    legacyAuditOrphanReconciliationSnapshot,
  );
  const agentIdentityMarkSerialized = `${JSON.stringify(agentIdentityMarkSnapshot, null, 2)}\n`;
  const paidBotIdentityJobSnapshot = buildPaidBotIdentityJobSnapshot(agentIdentityMarkSnapshot);
  const paidBotIdentityJobSerialized = `${JSON.stringify(paidBotIdentityJobSnapshot, null, 2)}\n`;
  const openAIRealtimeVoiceSnapshot = buildOpenAIRealtimeVoiceSnapshot(
    paidBotIdentityJobSnapshot,
  );
  const openAIRealtimeVoiceSerialized = `${JSON.stringify(openAIRealtimeVoiceSnapshot, null, 2)}\n`;
  const legacyVoiceProviderRemovalSnapshot = buildLegacyVoiceProviderRemovalSnapshot(
    openAIRealtimeVoiceSnapshot,
  );
  const legacyVoiceProviderRemovalSerialized = `${JSON.stringify(legacyVoiceProviderRemovalSnapshot, null, 2)}\n`;
  const smsDestinationRoutingSnapshot = buildSmsDestinationRoutingSnapshot(
    legacyVoiceProviderRemovalSnapshot,
  );
  const smsDestinationRoutingSerialized = `${JSON.stringify(smsDestinationRoutingSnapshot, null, 2)}\n`;
  const smsSendIdempotencySnapshot = buildSmsSendIdempotencySnapshot(
    smsDestinationRoutingSnapshot,
  );
  const smsSendIdempotencySerialized = `${JSON.stringify(smsSendIdempotencySnapshot, null, 2)}\n`;
  const retiredXAIVoiceBindingRemovalSnapshot = buildRetiredXAIVoiceBindingRemovalSnapshot(
    smsSendIdempotencySnapshot,
  );
  const retiredXAIVoiceBindingRemovalSerialized = `${JSON.stringify(retiredXAIVoiceBindingRemovalSnapshot, null, 2)}\n`;
  const native = writeSnapshot(TARGET, nativeSerialized, TARGET_SHA256);
  const preserved = writeSnapshot(TARGET_0051_PATH, preservedSerialized, TARGET_0051_SHA256);
  const grok46 = writeSnapshot(TARGET_0052_PATH, grok46Serialized, TARGET_0052_SHA256);
  const hotPath = writeSnapshot(TARGET_0053_PATH, hotPathSerialized, TARGET_0053_SHA256);
  const openaiRuntime = writeSnapshot(
    TARGET_0054_PATH,
    openaiRuntimeSerialized,
    TARGET_0054_SHA256,
  );
  const auditSystemReceipt = writeSnapshot(
    TARGET_0055_PATH,
    auditSystemReceiptSerialized,
    TARGET_0055_SHA256,
  );
  const resolvedOrphanScrub = writeSnapshot(
    TARGET_0056_PATH,
    resolvedOrphanScrubSerialized,
    TARGET_0056_SHA256,
  );
  const retiredXAIBindingIdentity = writeSnapshot(
    TARGET_0057_PATH,
    retiredXAIBindingIdentitySerialized,
    TARGET_0057_SHA256,
  );
  const auditCascade = writeSnapshot(TARGET_0058_PATH, auditCascadeSerialized, TARGET_0058_SHA256);
  const accountOperationLease = writeSnapshot(
    TARGET_0059_PATH,
    accountOperationLeaseSerialized,
    TARGET_0059_SHA256,
  );
  const subscriptionCascade = writeSnapshot(
    TARGET_0060_PATH,
    subscriptionCascadeSerialized,
    TARGET_0060_SHA256,
  );
  const accountEnvironmentPromotionGuard = writeSnapshot(
    TARGET_0061_PATH,
    accountEnvironmentPromotionGuardSerialized,
    TARGET_0061_SHA256,
  );
  const legacyAuditOrphanReconciliation = writeSnapshot(
    TARGET_0063_PATH,
    legacyAuditOrphanReconciliationSerialized,
    TARGET_0063_SHA256,
  );
  const agentIdentityMark = writeSnapshot(
    TARGET_0064_PATH,
    agentIdentityMarkSerialized,
    TARGET_0064_SHA256,
  );
  const paidBotIdentityJob = writeSnapshot(
    TARGET_0065_PATH,
    paidBotIdentityJobSerialized,
    TARGET_0065_SHA256,
  );
  const openAIRealtimeVoice = writeSnapshot(
    TARGET_0066_PATH,
    openAIRealtimeVoiceSerialized,
    TARGET_0066_SHA256,
  );
  const legacyVoiceProviderRemoval = writeSnapshot(
    TARGET_0067_PATH,
    legacyVoiceProviderRemovalSerialized,
    TARGET_0067_SHA256,
  );
  const smsDestinationRouting = writeSnapshot(
    TARGET_0068_PATH,
    smsDestinationRoutingSerialized,
    TARGET_0068_SHA256,
  );
  const smsSendIdempotency = writeSnapshot(
    TARGET_0069_PATH,
    smsSendIdempotencySerialized,
    TARGET_0069_SHA256,
  );
  const retiredXAIVoiceBindingRemoval = writeSnapshot(
    TARGET_0070_PATH,
    retiredXAIVoiceBindingRemovalSerialized,
    TARGET_0070_SHA256,
  );
  return {
    native,
    preserved,
    grok46,
    hotPath,
    openaiRuntime,
    auditSystemReceipt,
    resolvedOrphanScrub,
    retiredXAIBindingIdentity,
    auditCascade,
    accountOperationLease,
    subscriptionCascade,
    accountEnvironmentPromotionGuard,
    legacyAuditOrphanReconciliation,
    agentIdentityMark,
    paidBotIdentityJob,
    openAIRealtimeVoice,
    legacyVoiceProviderRemoval,
    smsDestinationRouting,
    smsSendIdempotency,
    retiredXAIVoiceBindingRemoval,
  };
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
if (result.openaiRuntime.changed) {
  console.log(`Materialized Drizzle snapshot 0054 (${result.openaiRuntime.sha256.slice(0, 12)}…).`);
}
if (result.auditSystemReceipt.changed) {
  console.log(
    `Materialized Drizzle snapshot 0055 (${result.auditSystemReceipt.sha256.slice(0, 12)}…).`,
  );
}
if (result.resolvedOrphanScrub.changed) {
  console.log(
    `Materialized Drizzle snapshot 0056 (${result.resolvedOrphanScrub.sha256.slice(0, 12)}…).`,
  );
}
if (result.retiredXAIBindingIdentity.changed) {
  console.log(
    `Materialized Drizzle snapshot 0057 (${result.retiredXAIBindingIdentity.sha256.slice(0, 12)}…).`,
  );
}
if (result.auditCascade.changed) {
  console.log(`Materialized Drizzle snapshot 0058 (${result.auditCascade.sha256.slice(0, 12)}…).`);
}
if (result.accountOperationLease.changed) {
  console.log(
    `Materialized Drizzle snapshot 0059 (${result.accountOperationLease.sha256.slice(0, 12)}…).`,
  );
}
if (result.subscriptionCascade.changed) {
  console.log(
    `Materialized Drizzle snapshot 0060 (${result.subscriptionCascade.sha256.slice(0, 12)}…).`,
  );
}
if (result.accountEnvironmentPromotionGuard.changed) {
  console.log(
    `Materialized Drizzle snapshot 0061 (${result.accountEnvironmentPromotionGuard.sha256.slice(0, 12)}…).`,
  );
}
if (result.legacyAuditOrphanReconciliation.changed) {
  console.log(
    `Materialized Drizzle snapshot 0063 (${result.legacyAuditOrphanReconciliation.sha256.slice(0, 12)}…).`,
  );
}
if (result.agentIdentityMark.changed) {
  console.log(
    `Materialized Drizzle snapshot 0064 (${result.agentIdentityMark.sha256.slice(0, 12)}…).`,
  );
}
if (result.paidBotIdentityJob.changed) {
  console.log(
    `Materialized Drizzle snapshot 0065 (${result.paidBotIdentityJob.sha256.slice(0, 12)}…).`,
  );
}
if (result.openAIRealtimeVoice.changed) {
  console.log(
    `Materialized Drizzle snapshot 0066 (${result.openAIRealtimeVoice.sha256.slice(0, 12)}…).`,
  );
}
if (result.legacyVoiceProviderRemoval.changed) {
  console.log(
    `Materialized Drizzle snapshot 0067 (${result.legacyVoiceProviderRemoval.sha256.slice(0, 12)}…).`,
  );
}
if (result.smsDestinationRouting.changed) {
  console.log(
    `Materialized Drizzle snapshot 0068 (${result.smsDestinationRouting.sha256.slice(0, 12)}…).`,
  );
}
if (result.smsSendIdempotency.changed) {
  console.log(
    `Materialized Drizzle snapshot 0069 (${result.smsSendIdempotency.sha256.slice(0, 12)}…).`,
  );
}
if (result.retiredXAIVoiceBindingRemoval.changed) {
  console.log(
    `Materialized Drizzle snapshot 0070 (${result.retiredXAIVoiceBindingRemoval.sha256.slice(0, 12)}…).`,
  );
}
