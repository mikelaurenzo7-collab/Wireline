import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ACCOUNT_DELETION_TABLES } from "../src/lib/account-deletion";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");
const migration = read("drizzle/migrations/0197_people.sql");
const TABLES = ["wireline_people", "wireline_person_identifiers", "wireline_person_events"];

describe("People migration 0197", () => {
  it("scopes every People table to its tenant through the role and GUC boundary", () => {
    for (const table of TABLES) {
      expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
      expect(migration).toContain(`REVOKE ALL ON TABLE public.${table} FROM PUBLIC;`);
      expect(migration).toContain(
        `REVOKE ALL ON TABLE public.${table} FROM anon, authenticated, service_role;`,
      );
      expect(migration).toContain(`CREATE POLICY tenant_isolation ON public.${table}`);
    }
    expect(migration.match(/FOR ALL TO wireline_server/g)).toHaveLength(3);
    expect(
      migration.match(/USING \(user_id = \(SELECT public\.wireline_current_user_id\(\)\)\)/g),
    ).toHaveLength(3);
    expect(
      migration.match(/WITH CHECK \(user_id = \(SELECT public\.wireline_current_user_id\(\)\)\)/g),
    ).toHaveLength(3);
    expect(migration).not.toContain("auth.uid()");
    expect(migration).not.toContain("SECURITY DEFINER");
    expect(migration).not.toMatch(/USING \(true\)/);
  });

  it("keeps person history append-or-delete: no UPDATE grant on events", () => {
    expect(migration).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON public.wireline_people TO wireline_server;",
    );
    expect(migration).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON public.wireline_person_identifiers TO wireline_server;",
    );
    expect(migration).toContain(
      "GRANT SELECT, INSERT, DELETE ON public.wireline_person_events TO wireline_server;",
    );
  });

  it("keeps identifiers, events and merge pointers inside one tenant with composite keys", () => {
    expect(migration).toContain('CONSTRAINT "wireline_people_id_user_key" UNIQUE("id","user_id")');
    expect(migration).toContain(
      'FOREIGN KEY ("merged_into_id","user_id") REFERENCES "public"."wireline_people"("id","user_id")',
    );
    expect(
      migration.match(
        /FOREIGN KEY \("person_id","user_id"\) REFERENCES "public"\."wireline_people"\("id","user_id"\) ON DELETE cascade/g,
      ),
    ).toHaveLength(2);
    expect(migration).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "uq_person_identifiers_user_kind_value"',
    );
  });

  it("stores only normalized identifiers", () => {
    expect(migration).toContain(`"value" ~ '^\\+[1-9][0-9]{6,14}$'`);
    expect(migration).toContain(`"value" = lower("wireline_person_identifiers"."value")`);
  });

  it("is idempotent and bounded by a lock timeout", () => {
    expect(migration.startsWith("-- 0197")).toBe(true);
    expect(migration).toContain("SET lock_timeout = '5s';");
    expect(migration.trim().endsWith("RESET lock_timeout;")).toBe(true);
    expect(migration.match(/CREATE TABLE(?! IF NOT EXISTS)/g)).toBeNull();
    expect(migration.match(/CREATE (UNIQUE )?INDEX(?! IF NOT EXISTS)/g)).toBeNull();
    expect(migration).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM/);
  });

  it("is erased by account deletion, children before parents, and stays out of the 365-day purge", () => {
    const order = TABLES.map((table) => ACCOUNT_DELETION_TABLES.indexOf(table));
    expect(order.every((index) => index >= 0)).toBe(true);
    const [peopleIndex, identifiersIndex, eventsIndex] = order;
    expect(eventsIndex).toBeLessThan(peopleIndex);
    expect(identifiersIndex).toBeLessThan(peopleIndex);
    const purge = read("drizzle/migrations/0149_retention_purge_fails_closed.sql");
    for (const table of TABLES) expect(purge).not.toContain(table);
  });

  it("journals 0197 and adds only the People tables to the linked snapshot", () => {
    const journal = JSON.parse(read("drizzle/migrations/meta/_journal.json"));
    const entry = journal.entries.find(
      (candidate: { tag: string }) => candidate.tag === "0197_people",
    );
    expect(entry).toMatchObject({ version: "7", breakpoints: true });
    const snapshotIndex = String(entry.idx).padStart(4, "0");
    const previousIndex = String(entry.idx - 1).padStart(4, "0");
    const previous = JSON.parse(read(`drizzle/migrations/meta/${previousIndex}_snapshot.json`));
    const next = JSON.parse(read(`drizzle/migrations/meta/${snapshotIndex}_snapshot.json`));
    expect(next.prevId).toBe(previous.id);
    expect(
      Object.keys(next.tables)
        .filter((name) => !previous.tables[name])
        .sort(),
    ).toEqual(TABLES.map((table) => `public.${table}`).sort());
    for (const table of TABLES) expect(next.tables[`public.${table}`].isRLSEnabled).toBe(true);
    // The one existing table that changes is the live-voice provider check the
    // migration reconciles with the schema source.
    // Compared structurally: Drizzle Kit may reorder keys without changing them.
    for (const [name, definition] of Object.entries(previous.tables)) {
      if (name === "public.wireline_live_voices") continue;
      expect(next.tables[name], name).toEqual(definition);
    }
    expect(next.tables["public.wireline_live_voices"]).not.toEqual(
      previous.tables["public.wireline_live_voices"],
    );
    expect(
      next.tables["public.wireline_live_voices"].checkConstraints
        .wireline_live_voices_provider_check.value,
    ).toContain("'inhouse'");
    expect(migration).toContain(
      `ADD CONSTRAINT "wireline_live_voices_provider_check" CHECK ("wireline_live_voices"."provider" IN ('xai', 'elevenlabs', 'inhouse'))`,
    );
  });
});
