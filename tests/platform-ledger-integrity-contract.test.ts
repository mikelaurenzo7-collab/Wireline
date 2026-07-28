import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("platform ledger migration delivery", () => {
  it("journals every committed 0112-0117 production migration", () => {
    const journal = JSON.parse(read("drizzle/migrations/meta/_journal.json")) as {
      entries: Array<{ idx: number; tag: string; when: number }>;
    };
    const tags = journal.entries.map((entry) => entry.tag);

    for (const tag of [
      "0112_stripe_event_claim_status",
      "0113_settings_subscription_status_pending_default",
      "0114_fix_rls_wireline_server_recap_and_handoffs",
      "0115_mcp_tables_wireline_server_policies",
      "0116_orphan_carrier_resources",
      "0117_twilio_consent_message_sid_uniqueness",
    ]) {
      expect(tags).toContain(tag);
      expect(() => read(`drizzle/migrations/${tag}.sql`)).not.toThrow();
    }

    expect(journal.entries.map((entry) => entry.idx)).toEqual(
      journal.entries.map((_entry, index) => index),
    );
    expect(journal.entries.map((entry) => entry.when)).toEqual(
      [...journal.entries.map((entry) => entry.when)].sort((a, b) => a - b),
    );
  });

  it("keeps failed carrier releases durable and retry-idempotent", () => {
    const migration = read("drizzle/migrations/0116_orphan_carrier_resources.sql");
    const deletion = read("src/lib/account-deletion.ts");

    expect(migration).toContain("wireline_orphan_carrier_resources");
    expect(migration).toContain("uq_orphan_carrier_resources_open");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("FOR ALL TO wireline_server");

    expect(deletion).toContain("schema.phoneNumbers.vapiNumberId");
    expect(deletion).toContain("INSERT INTO public.wireline_orphan_carrier_resources");
    expect(deletion).toContain(
      "ON CONFLICT (former_user_id, phone_number) WHERE status = 'pending'",
    );
    expect(deletion).toContain("orphan carrier handoff failed — deferring account purge");
    expect(deletion).toContain("throw ledgerErr");

    // Pin the untouched deletion engine and grace-window exports. This prevents
    // a future focused edit from accidentally truncating the lower half of the
    // module while preserving the new carrier handoff.
    expect(deletion).toContain("async function purgeAccountOutsideTenantContext");
    expect(deletion).toContain("ACCOUNT_DELETION_GRACE_DAYS = 30");
    expect(deletion).toContain("export function computeScheduledPurgeAt");
  });

  it("enforces Twilio consent MessageSid idempotency in Postgres", () => {
    const migration = read(
      "drizzle/migrations/0117_twilio_consent_message_sid_uniqueness.sql",
    );
    expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS");
    expect(migration).toContain("uq_consent_log_twilio_message_sid");
    expect(migration).toContain("metadata ->> 'twilio_message_sid'");
    expect(migration).toContain("WHERE NULLIF");
  });
});
