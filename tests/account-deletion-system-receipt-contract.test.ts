import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { accountDeletionReceiptId, purgeAccount } from "../src/lib/account-deletion";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

function deletionDb(options: { failReceipt?: boolean } = {}) {
  const receipts: Array<Record<string, unknown>> = [];
  const tx = {
    execute: vi.fn(async () => ({ rows: [{ table_exists: true }] })),
    insert: vi.fn(() => ({
      values: (value: Record<string, unknown>) => ({
        onConflictDoNothing: async () => {
          if (options.failReceipt) throw new Error("receipt unavailable");
          if (!receipts.some((receipt) => receipt.resourceId === value.resourceId)) {
            receipts.push(value);
          }
        },
      }),
    })),
  };
  const db = {
    execute: tx.execute,
    transaction: vi.fn(async (work: (value: typeof tx) => Promise<unknown>) => work(tx)),
  };
  return { db, receipts };
}

const userId = "11111111-1111-4111-8111-111111111111";
const logger = { warn: vi.fn(), error: vi.fn() };

describe("terminal account-erasure receipts", () => {
  it("codifies the nullable, server-only audit boundary in migration history", () => {
    const migration = read("drizzle/migrations/0157_audit_log_system_receipts.sql");
    const journal = read("drizzle/migrations/meta/_journal.json");
    const snapshot = read("drizzle/migrations/meta/0055_snapshot.json");
    const snapshotJson = JSON.parse(snapshot) as {
      tables: Record<string, { columns: Record<string, { notNull: boolean }> }>;
    };
    const schema = read("src/db/schema-base.ts");
    const auditSchema = schema.match(
      /export const auditLog = pgTable[\s\S]*?export const consentLog/,
    )?.[0];
    const auditUserColumn = auditSchema?.match(/userId: uuid\("user_id"\)[^\n]*/)?.[0];

    expect(migration).toContain("ALTER COLUMN user_id DROP NOT NULL");
    expect(migration).toContain("uq_audit_account_deletion_receipt");
    expect(journal).toContain('"tag": "0157_audit_log_system_receipts"');
    expect(snapshotJson.tables["public.wireline_audit_log"].columns.user_id.notNull).toBe(false);
    expect(auditSchema).toBeTruthy();
    expect(auditUserColumn).toContain('userId: uuid("user_id").references');
    expect(auditUserColumn).toContain('onDelete: "cascade"');
  });

  it("uses the user delete as the race-proof tenant-audit erasure boundary", () => {
    const migration = read("drizzle/migrations/0160_cascade_tenant_audit_erasure.sql");
    const reconciliation = read("drizzle/migrations/0165_reconcile_legacy_audit_orphans.sql");
    const schema = read("src/db/schema-base.ts");

    const legacyCleanup = reconciliation.indexOf("DELETE FROM public.wireline_audit_log AS audit");
    const orphanAssertion = reconciliation.indexOf("0165 refused:");

    expect(migration).toContain("wireline_audit_log_user_id_wireline_users_id_fk");
    expect(migration).not.toContain("DELETE FROM public.wireline_audit_log AS audit");
    expect(migration).not.toContain("orphan_preflight");
    expect(legacyCleanup).toBeGreaterThan(-1);
    expect(reconciliation).toContain("audit.event_type = 'data.account_deleted'");
    expect(reconciliation).toContain("audit.action = 'account_deleted'");
    expect(reconciliation).toContain("audit.resource_type = 'user_account'");
    expect(reconciliation).toContain("audit.severity = 'critical'");
    expect(reconciliation).toContain("audit.resource_id = audit.user_id::text");
    expect(reconciliation).toContain("audit.user_id IS NOT NULL");
    expect(reconciliation).toContain(
      "LOCK TABLE public.wireline_audit_log IN SHARE ROW EXCLUSIVE MODE",
    );
    expect(orphanAssertion).toBeGreaterThan(legacyCleanup);
    expect(migration).toContain("ON DELETE CASCADE");
    expect(migration).toContain("NOT VALID");
    expect(migration).toContain("VALIDATE CONSTRAINT");
    expect(schema).toContain(
      'userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" })',
    );
  });

  it("converges repeated successful purges on one terminal receipt", async () => {
    const fake = deletionDb();
    await purgeAccount(userId, { db: fake.db as never, log: logger });
    await purgeAccount(userId, { db: fake.db as never, log: logger });

    expect(fake.receipts).toHaveLength(1);
    expect(fake.receipts[0]?.resourceId).toBe(accountDeletionReceiptId(userId));
  });

  it("writes one pseudonymous receipt inside the successful purge transaction", async () => {
    const fake = deletionDb();
    const result = await purgeAccount(userId, {
      db: fake.db as never,
      log: logger,
    });

    expect(result.ok).toBe(true);
    expect(fake.receipts).toHaveLength(1);
    expect(fake.receipts[0]).toMatchObject({
      userId: null,
      action: "account.purge.completed",
      eventType: "account.deletion.completed",
      resourceType: "account_deletion_receipt",
      resourceId: accountDeletionReceiptId(userId),
    });
    expect(JSON.stringify(fake.receipts[0])).not.toContain(userId);
  });

  it("fails closed when the terminal receipt cannot be retained", async () => {
    const fake = deletionDb({ failReceipt: true });
    await expect(
      purgeAccount(userId, {
        db: fake.db as never,
        log: logger,
      }),
    ).resolves.toMatchObject({
      ok: false,
      authRemoved: false,
      error: "receipt unavailable",
    });
  });

  it("uses a stable one-way identifier with no raw UUID material", () => {
    const receipt = accountDeletionReceiptId(userId);
    expect(receipt).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt).not.toContain(userId.replaceAll("-", ""));
    expect(accountDeletionReceiptId(userId)).toBe(receipt);
  });
});
