import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = resolve(process.cwd(), "drizzle/migrations");

type JournalEntry = { idx: number; tag: string };

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
 * Production applies `drizzle-kit migrate` from scripts/vercel-build.mjs, and
 * drizzle-kit runs the JOURNAL — not the directory listing. A .sql file that is
 * committed but absent from meta/_journal.json therefore never executes on that
 * path, silently and with no error to notice.
 *
 * The repository is in that state today for 105 of its 138 migrations: they were
 * applied out of band through the authenticated Supabase migration tool (the
 * urgent path in docs/DATABASE_OPERATIONS.md) and the journal was never
 * back-filled. That history is NOT something to "repair" from here — adding those
 * tags would make the next production build replay DDL that already ran, and much
 * of it is not idempotent. It is pinned instead, so the state is visible and any
 * movement is a reviewed decision rather than drift.
 *
 * What this contract exists to stop is the forward-going version of the same
 * mistake: a NEW migration authored today, committed, and never journaled.
 */
describe("migration journal integrity contract", () => {
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
    // Vercel build path would then have executed against production. The
    // snapshot chain was resynced; this pins that the sorted-last snapshot
    // always carries the same index as the newest journal entry, so a new
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

  it("documents the split so the journal is not read as the whole history", () => {
    // The operational rule only survives if it is written down where database
    // work starts. docs/DATABASE_OPERATIONS.md is that single source of truth.
    const doc = readFileSync(resolve(process.cwd(), "docs/DATABASE_OPERATIONS.md"), "utf8");
    expect(doc).toContain("meta/_journal.json");
    expect(doc).toContain("drizzle-kit migrate");
  });
});
