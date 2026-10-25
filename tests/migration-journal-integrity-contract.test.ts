import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

execFileSync(process.execPath, ["scripts/materialize-drizzle-meta.mjs"], {
  cwd: process.cwd(),
  stdio: "inherit",
});

const MIGRATIONS_DIR = resolve(process.cwd(), "drizzle/migrations");

type JournalEntry = { idx: number; tag: string; when: number };

const journal = JSON.parse(readFileSync(resolve(MIGRATIONS_DIR, "meta/_journal.json"), "utf8")) as {
  entries: JournalEntry[];
};

const journalTags = new Set(journal.entries.map((entry) => entry.tag));
const migrationFiles = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith(".sql"))
  .map((name) => name.slice(0, -4))
  .sort();

const numericPrefix = (tag: string): number => {
  const match = /^(\d+)_/.exec(tag);
  return match ? Number(match[1]) : -1;
};

/**
 * Production schema promotion applies `drizzle-kit migrate` from
 * scripts/promote-production-schema.mjs, and drizzle-kit runs the JOURNAL — not
 * the directory listing. A .sql file committed but absent from
 * meta/_journal.json therefore never executes on that path, silently and with
 * no error to notice.
 *
 * The repository is in that state today for 105 historical migrations: they were
 * applied out of band through the authenticated Supabase migration tool (the
 * urgent path in docs/DATABASE_OPERATIONS.md) and the journal was never
 * back-filled. That history is NOT something to "repair" from here — adding those
 * tags would make the next explicit schema promotion replay DDL that already ran,
 * and much of it is not idempotent. It is pinned instead, so the state is visible
 * and any movement is a reviewed decision rather than drift.
 *
 * What this contract exists to stop is the forward-going version of the same
 * mistake: a NEW migration authored today, committed, and never journaled.
 */
describe("migration journal integrity contract", () => {
  it("gives the newest migration a timestamp after every earlier migration", () => {
    // Drizzle compares timestamps with its applied ledger, not just array order.
    // A generated timestamp before a future-dated parent would silently skip DDL.
    const head = journal.entries.at(-1)!;
    expect(head.when).toBeGreaterThan(
      Math.max(...journal.entries.slice(0, -1).map((entry) => entry.when)),
    );
  });
  it("has a committed .sql file for every journal entry", () => {
    // The inverse direction is a hard production failure rather than a silent
    // one: drizzle-kit aborts the build when a journalled tag has no file, which
    // takes down the deploy rather than the schema.
    const onDisk = new Set(migrationFiles);
    const orphanedTags = [...journalTags].filter((tag) => !onDisk.has(tag)).sort();
    expect(orphanedTags).toEqual([]);
  });

  it("keeps the newest meta snapshot aligned with the newest journal entry", () => {
    // `drizzle-kit generate` diffs src/db/schema.ts against the LAST snapshot in
    // a sorted listing of meta/*.json — not against the journal. With the newest
    // snapshot 41 migrations stale (the state found on 2026-08-14: only
    // 0001/0004 existed), a routine `npm run db:generate` produced a
    // destructive full-create/drop migration that `npm run db:migrate` on the
    // explicit Production schema-promotion path would then have executed against
    // production. The snapshot chain was resynced; this pins that the sorted-last
    // snapshot always carries the same index as the newest journal entry, so a new
    // journalled migration without its regenerated snapshot fails here instead
    // of arming that footgun again.
    const snapshotIndexes = readdirSync(resolve(MIGRATIONS_DIR, "meta"))
      .filter((name) => /^\d{4}_snapshot\.json$/.test(name))
      .map((name) => Number(name.slice(0, 4)))
      .sort((a, b) => a - b);
    expect(snapshotIndexes.length).toBeGreaterThan(0);
    const newestSnapshotIdx = snapshotIndexes[snapshotIndexes.length - 1];
    const newestJournalIdx = Math.max(...journal.entries.map((entry) => entry.idx));
    expect(newestSnapshotIdx).toBe(newestJournalIdx);
  });

  it("keeps the newest snapshot linked to its predecessor", () => {
    const snapshotNames = readdirSync(resolve(MIGRATIONS_DIR, "meta"))
      .filter((name) => /^\d{4}_snapshot\.json$/.test(name))
      .sort();
    expect(snapshotNames.length).toBeGreaterThan(1);
    const previous = JSON.parse(
      readFileSync(resolve(MIGRATIONS_DIR, "meta", snapshotNames.at(-2)!), "utf8"),
    ) as { id: string };
    const newest = JSON.parse(
      readFileSync(resolve(MIGRATIONS_DIR, "meta", snapshotNames.at(-1)!), "utf8"),
    ) as { id: string; prevId: string };
    expect(newest.id).not.toBe(previous.id);
    expect(newest.prevId).toBe(previous.id);
  });

  it("journals every migration at or above the newest journalled migration", () => {
    // Numeric prefixes are reused in this repository (0108, 0118, 0120 and others
    // each name two different migrations), so ordering cannot be derived from the
    // filename alone and "newest" has to be read off the journal itself.
    //
    // Anything authored at or beyond that point is new work, and new work must go
    // through the journal to reach production. This is the assertion that fires
    // when someone adds 0135_*.sql and forgets meta/_journal.json.
    const newestJournalled = Math.max(...[...journalTags].map(numericPrefix));
    const unjournalledAtHead = migrationFiles
      .filter((file) => numericPrefix(file) >= newestJournalled)
      .filter((file) => !journalTags.has(file));
    expect(unjournalledAtHead).toEqual([]);
  });

  it("pins the historical out-of-band migration backlog", () => {
    // A bare count, deliberately. Either direction of change should stop a
    // reviewer: the number growing means a new migration was committed without a
    // journal entry, and the number shrinking means part of the backlog was
    // back-filled — which schedules that DDL to replay against a database that
    // already has it. Neither should happen silently.
    const unjournalled = migrationFiles.filter((file) => !journalTags.has(file));
    expect(unjournalled.length).toBe(105);

    // Called out by name because these are security migrations the application
    // reasons about as though they were guaranteed: 0127 installs the
    // BEFORE UPDATE OF password_hash trigger that bumps session_version, which is
    // what makes password-change session revocation database-owned rather than
    // best-effort application code. A rebuilt environment that only ran the
    // journal would not have it.
    for (const securityMigration of [
      "0120_security_atomicity_team_sessions",
      "0122_team_workspace_rls",
      "0124_team_invitation_claim_function",
      "0126_oauth_bridge_atomic_consume_function",
      "0127_monotonic_session_version",
    ]) {
      expect(migrationFiles, securityMigration).toContain(securityMigration);
      expect(journalTags.has(securityMigration), `${securityMigration} is journalled`).toBe(false);
    }
  });

  it("journals and materializes the managed Grok 4.6 persisted defaults", () => {
    expect(journal.entries).toContainEqual(
      expect.objectContaining({
        idx: 52,
        tag: "0154_xai_grok_46_persisted_defaults",
      }),
    );
    const materializer = readFileSync(
      resolve(process.cwd(), "scripts/materialize-drizzle-meta.mjs"),
      "utf8",
    );
    expect(materializer).toContain("TARGET_0052_PATH");
    expect(materializer).toContain("buildGrok46DefaultsSnapshot");
    expect(materializer).toContain(".columns.voice_llm_model.default = \"'grok-4.6'\"");
    expect(materializer).not.toContain('TARGET_0052_SHA256 = "PENDING_COMPUTE"');
  });

  it("journals and materializes the hot-path knowledge and jobs indexes", () => {
    expect(journal.entries).toContainEqual(
      expect.objectContaining({
        idx: 53,
        tag: "0155_hot_path_knowledge_and_jobs_indexes",
      }),
    );
    const materializer = readFileSync(
      resolve(process.cwd(), "scripts/materialize-drizzle-meta.mjs"),
      "utf8",
    );
    expect(materializer).toContain("TARGET_0053_PATH");
    expect(materializer).toContain("buildHotPathIndexSnapshot");
    expect(materializer).not.toContain('TARGET_0053_SHA256 = "PENDING_COMPUTE"');
  });

  it("journals and materializes the OpenAI runtime-cohesion defaults", () => {
    expect(journal.entries).toContainEqual(
      expect.objectContaining({
        idx: 54,
        tag: "0156_openai_runtime_cohesion",
      }),
    );
    const materializer = readFileSync(
      resolve(process.cwd(), "scripts/materialize-drizzle-meta.mjs"),
      "utf8",
    );
    expect(materializer).toContain("TARGET_0054_PATH");
    expect(materializer).toContain("buildOpenAIRuntimeCohesionSnapshot");
    expect(materializer).toContain("settings.voice_llm_provider.default = \"'openai'\"");
    expect(materializer).toContain("settings.voice_llm_model.default = \"'gpt-4o'\"");
    expect(materializer).not.toContain('TARGET_0054_SHA256 = "PENDING_COMPUTE"');
  });

  it("journals and materializes nullable server-owned audit receipts", () => {
    expect(journal.entries).toContainEqual(
      expect.objectContaining({
        idx: 55,
        tag: "0157_audit_log_system_receipts",
      }),
    );
    const materializer = readFileSync(
      resolve(process.cwd(), "scripts/materialize-drizzle-meta.mjs"),
      "utf8",
    );
    expect(materializer).toContain("TARGET_0055_PATH");
    expect(materializer).toContain("buildAuditSystemReceiptSnapshot");
    expect(materializer).toContain("auditLog.columns.user_id.notNull = false");
    expect(materializer).toContain("auditLog.isRLSEnabled = true");
    expect(materializer).toContain("uq_audit_account_deletion_receipt");
    expect(materializer).not.toContain('TARGET_0055_SHA256 = "PENDING_COMPUTE"');
  });

  it("journals the resolved orphan-carrier scrub with a data-only snapshot", () => {
    expect(journal.entries).toContainEqual(
      expect.objectContaining({
        idx: 56,
        tag: "0158_scrub_resolved_orphan_carrier_resources",
      }),
    );
    const materializer = readFileSync(
      resolve(process.cwd(), "scripts/materialize-drizzle-meta.mjs"),
      "utf8",
    );
    expect(materializer).toContain("TARGET_0056_PATH");
    expect(materializer).toContain("buildResolvedOrphanScrubSnapshot");
    expect(materializer).not.toContain('TARGET_0056_SHA256 = "PENDING_COMPUTE"');
  });

  it("journals and materializes retired xAI binding de-identification", () => {
    expect(journal.entries).toContainEqual(
      expect.objectContaining({
        idx: 57,
        tag: "0159_deidentify_retired_xai_bindings",
      }),
    );
    const materializer = readFileSync(
      resolve(process.cwd(), "scripts/materialize-drizzle-meta.mjs"),
      "utf8",
    );
    expect(materializer).toContain("TARGET_0057_PATH");
    expect(materializer).toContain("buildRetiredXAIBindingIdentitySnapshot");
    expect(materializer).toContain("wireline_xai_binding_owner_identity");
    expect(materializer).not.toContain('TARGET_0057_SHA256 = "PENDING_COMPUTE"');
  });

  it("journals and materializes the tenant-audit cascade boundary", () => {
    expect(journal.entries).toContainEqual(
      expect.objectContaining({
        idx: 58,
        tag: "0160_cascade_tenant_audit_erasure",
      }),
    );
    const materializer = readFileSync(
      resolve(process.cwd(), "scripts/materialize-drizzle-meta.mjs"),
      "utf8",
    );
    expect(materializer).toContain("TARGET_0058_PATH");
    expect(materializer).toContain("buildAuditCascadeSnapshot");
    expect(materializer).toContain("wireline_audit_log_user_id_wireline_users_id_fk");
    expect(materializer).not.toContain('TARGET_0058_SHA256 = "PENDING_COMPUTE"');
  });

  it("journals and materializes durable account-operation leases", () => {
    expect(journal.entries).toContainEqual(
      expect.objectContaining({
        idx: 59,
        tag: "0161_account_operation_leases",
      }),
    );
    const materializer = readFileSync(
      resolve(process.cwd(), "scripts/materialize-drizzle-meta.mjs"),
      "utf8",
    );
    expect(materializer).toContain("TARGET_0059_PATH");
    expect(materializer).toContain("buildAccountOperationLeaseSnapshot");
    expect(materializer).toContain("wireline_account_operation_leases");
    expect(materializer).not.toContain('TARGET_0059_SHA256 = "PENDING_COMPUTE"');
  });

  it("journals and materializes subscription ownership", () => {
    expect(journal.entries).toContainEqual(
      expect.objectContaining({
        idx: 60,
        tag: "0162_cascade_subscription_user_erasure",
      }),
    );
    const materializer = readFileSync(
      resolve(process.cwd(), "scripts/materialize-drizzle-meta.mjs"),
      "utf8",
    );
    expect(materializer).toContain("TARGET_0060_PATH");
    expect(materializer).toContain("buildSubscriptionCascadeSnapshot");
    expect(materializer).toContain("wireline_subscriptions_user_id_wireline_users_id_fk");
    expect(materializer).not.toContain('TARGET_0060_SHA256 = "PENDING_COMPUTE"');
  });

  it("journals the account-environment promotion guard with a data-only snapshot", () => {
    expect(journal.entries).toContainEqual(
      expect.objectContaining({
        idx: 61,
        tag: "0163_guard_account_environment_promotion",
      }),
    );
    const materializer = readFileSync(
      resolve(process.cwd(), "scripts/materialize-drizzle-meta.mjs"),
      "utf8",
    );
    expect(materializer).toContain("TARGET_0061_PATH");
    expect(materializer).toContain("buildAccountEnvironmentPromotionGuardSnapshot");
    expect(materializer).not.toContain('TARGET_0061_SHA256 = "PENDING_COMPUTE"');
  });

  it("journals and snapshots Stripe event claim fencing", () => {
    expect(journal.entries).toContainEqual(
      expect.objectContaining({
        idx: 62,
        tag: "0164_stripe_event_claim_fencing",
      }),
    );
    const snapshot = JSON.parse(
      readFileSync(resolve(MIGRATIONS_DIR, "meta/0062_snapshot.json"), "utf8"),
    ) as { tables: Record<string, { columns: Record<string, { type: string }> }> };
    expect(snapshot.tables["public.wireline_stripe_events"].columns.claim_token.type).toBe("uuid");
  });

  it("journals and materializes legacy audit-orphan reconciliation as data-only", () => {
    expect(journal.entries).toContainEqual(
      expect.objectContaining({
        idx: 63,
        tag: "0165_reconcile_legacy_audit_orphans",
      }),
    );
    const materializer = readFileSync(
      resolve(process.cwd(), "scripts/materialize-drizzle-meta.mjs"),
      "utf8",
    );
    expect(materializer).toContain("TARGET_0063_PATH");
    expect(materializer).toContain("buildLegacyAuditOrphanReconciliationSnapshot");
    expect(materializer).not.toContain('TARGET_0063_SHA256 = "PENDING_COMPUTE"');

    const stripeSnapshot = JSON.parse(
      readFileSync(resolve(MIGRATIONS_DIR, "meta/0062_snapshot.json"), "utf8"),
    ) as { id: string; tables: unknown };
    const reconciliationSnapshot = JSON.parse(
      readFileSync(resolve(MIGRATIONS_DIR, "meta/0063_snapshot.json"), "utf8"),
    ) as { prevId: string; tables: unknown };
    expect(reconciliationSnapshot.prevId).toBe(stripeSnapshot.id);
    expect(reconciliationSnapshot.tables).toEqual(stripeSnapshot.tables);
  });

  it("journals and materializes the curated Bot identity mark", () => {
    expect(journal.entries).toContainEqual(
      expect.objectContaining({
        idx: 64,
        tag: "0166_agent_identity_marks",
      }),
    );
    const materializer = readFileSync(
      resolve(process.cwd(), "scripts/materialize-drizzle-meta.mjs"),
      "utf8",
    );
    expect(materializer).toContain("TARGET_0064_PATH");
    expect(materializer).toContain("buildAgentIdentityMarkSnapshot");
    expect(materializer).not.toContain('TARGET_0064_SHA256 = "PENDING_COMPUTE"');
    const migration = readFileSync(
      resolve(MIGRATIONS_DIR, "0166_agent_identity_marks.sql"),
      "utf8",
    );
    expect(migration).toContain("HAVING count(*) > 120");
    expect(migration).toContain("assign_wireline_agent_mark_key");
    expect(migration).toContain("pg_advisory_xact_lock(hashtext(NEW.user_id::text))");
    expect(migration).toContain("BEFORE INSERT OR UPDATE OF mark_key");
    expect(migration).toContain("Bot identity backfill left unassigned agents");

    const previous = JSON.parse(
      readFileSync(resolve(MIGRATIONS_DIR, "meta/0063_snapshot.json"), "utf8"),
    ) as { id: string };
    const snapshot = JSON.parse(
      readFileSync(resolve(MIGRATIONS_DIR, "meta/0064_snapshot.json"), "utf8"),
    ) as {
      prevId: string;
      tables: Record<
        string,
        {
          columns: Record<string, { type: string; notNull: boolean }>;
          checkConstraints: Record<string, { value: string }>;
        }
      >;
    };
    expect(snapshot.prevId).toBe(previous.id);
    const agents = snapshot.tables["public.wireline_agents"];
    expect(agents.columns.mark_key).toMatchObject({ type: "text", notNull: false });
    expect(agents.checkConstraints.wireline_agents_mark_key_check.value).toContain("vertex");
    expect(agents.checkConstraints.wireline_agents_mark_key_check.value).toContain("slate");
    expect(agents.checkConstraints.wireline_agents_mark_key_check.value).toContain("~");
    expect(snapshot.tables["public.wireline_agents"].checkConstraints).toHaveProperty(
      "wireline_agents_mark_key_check",
    );
  });

  it("journals and materializes paid Bot identity job deduplication", () => {
    expect(journal.entries).toContainEqual(
      expect.objectContaining({
        idx: 65,
        tag: "0167_paid_bot_identity_jobs",
      }),
    );
    const materializer = readFileSync(
      resolve(process.cwd(), "scripts/materialize-drizzle-meta.mjs"),
      "utf8",
    );
    expect(materializer).toContain("TARGET_0065_PATH");
    expect(materializer).toContain("buildPaidBotIdentityJobSnapshot");
    expect(materializer).not.toContain('TARGET_0065_SHA256 = "PENDING_COMPUTE"');

    const previous = JSON.parse(
      readFileSync(resolve(MIGRATIONS_DIR, "meta/0064_snapshot.json"), "utf8"),
    ) as { id: string };
    const snapshot = JSON.parse(
      readFileSync(resolve(MIGRATIONS_DIR, "meta/0065_snapshot.json"), "utf8"),
    ) as {
      prevId: string;
      tables: Record<string, { indexes: Record<string, { where: string }> }>;
    };
    expect(snapshot.prevId).toBe(previous.id);
    expect(snapshot.tables["public.wireline_jobs"].indexes).toHaveProperty(
      "uq_jobs_paid_bot_identity_active",
    );
    expect(
      snapshot.tables["public.wireline_jobs"].indexes.uq_jobs_paid_bot_identity_active.where,
    ).toContain("paid_bot_identity_reconcile");
  });

  it("journals and materializes the OpenAI Realtime voice runtime defaults", () => {
    expect(journal.entries).toContainEqual(
      expect.objectContaining({
        idx: 66,
        tag: "0168_openai_realtime_voice_runtime",
      }),
    );
    const materializer = readFileSync(
      resolve(process.cwd(), "scripts/materialize-drizzle-meta.mjs"),
      "utf8",
    );
    expect(materializer).toContain("TARGET_0066_PATH");
    expect(materializer).toContain("buildOpenAIRealtimeVoiceSnapshot");
    expect(materializer).toContain("agents.voice_id.default = \"'marin'\"");
    expect(materializer).toContain("settings.voice_llm_model.default = \"'gpt-realtime-2.1'\"");
    expect(materializer).not.toContain('TARGET_0066_SHA256 = "PENDING_COMPUTE"');
  });

  it("documents the split so the journal is not read as the whole history", () => {
    // The operational rule only survives if it is written down where database
    // work starts. docs/DATABASE_OPERATIONS.md is that single source of truth.
    const doc = readFileSync(resolve(process.cwd(), "docs/DATABASE_OPERATIONS.md"), "utf8");
    expect(doc).toContain("meta/_journal.json");
    expect(doc).toContain("drizzle-kit migrate");
  });
});
