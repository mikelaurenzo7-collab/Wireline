import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminPool, asTenant, createUser } from "./helpers";

// The lane builds tables with drizzle-kit push, which carries no row security.
// Apply migration 0197 itself so these tests exercise its real RLS, grants and
// composite keys, then 0200, which removes the UPDATE on events that
// production's default privileges (mirrored by the fixture) leave behind.
// Every statement in both is idempotent.
const migration = ["0197_people", "0200_person_events_no_update"]
  .map((tag) => readFileSync(path.resolve(`drizzle/migrations/${tag}.sql`), "utf8"))
  .join("\n");

const { tenantStore } = await import("../../src/lib/server-context");
const people = await import("../../src/lib/people/people-service");
const timeline = await import("../../src/lib/people/people-timeline");

const pool = adminPool();
let owner = "";
let other = "";

beforeAll(async () => {
  await pool.query(migration);
  owner = await createUser(pool, "people-owner");
  other = await createUser(pool, "people-other");
});
afterAll(() => pool.end());

const asOwner = <T>(work: () => Promise<T>) => tenantStore.run(owner, work);

describe("People tables: row security and grants from migrations 0197 and 0200", () => {
  it("enables RLS and leaves no grants to browser roles", async () => {
    const { rows } = await pool.query(
      `SELECT relname, relrowsecurity FROM pg_class
        WHERE relname IN ('wireline_people', 'wireline_person_identifiers', 'wireline_person_events')
        ORDER BY relname`,
    );
    expect(rows).toEqual([
      { relname: "wireline_people", relrowsecurity: true },
      { relname: "wireline_person_events", relrowsecurity: true },
      { relname: "wireline_person_identifiers", relrowsecurity: true },
    ]);
    const grants = await pool.query(
      `SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
        WHERE table_name IN ('wireline_people', 'wireline_person_identifiers', 'wireline_person_events')
          AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC')`,
    );
    expect(grants.rows).toEqual([]);
    const eventGrants = await pool.query(
      `SELECT privilege_type FROM information_schema.role_table_grants
        WHERE table_name = 'wireline_person_events' AND grantee = 'wireline_server'
        ORDER BY privilege_type`,
    );
    expect(eventGrants.rows.map((row) => row.privilege_type)).toEqual([
      "DELETE",
      "INSERT",
      "SELECT",
    ]);
  });

  it("hides one tenant's people from another and rejects cross-tenant writes", async () => {
    const created = await asOwner(() =>
      people.createPerson(owner, {
        displayName: "Dana Ruiz",
        identifiers: [{ kind: "phone", value: "(312) 555-0101" }],
      }),
    );
    const seen = await asTenant(pool, other, (c) =>
      c.query("SELECT id FROM wireline_people WHERE id = $1", [created.id]),
    );
    expect(seen.rows).toEqual([]);
    await expect(
      asTenant(pool, other, (c) =>
        c.query("INSERT INTO wireline_people (user_id, display_name) VALUES ($1, 'x')", [owner]),
      ),
    ).rejects.toThrow(/row-level security/);
    // The composite key refuses an identifier that points at another tenant's
    // person, even when the inserting tenant knows the id.
    await expect(
      asTenant(pool, other, (c) =>
        c.query(
          `INSERT INTO wireline_person_identifiers (user_id, person_id, kind, value, source)
           VALUES ($1, $2, 'phone', '+13125550199', 'owner')`,
          [other, created.id],
        ),
      ),
    ).rejects.toThrow(/foreign key/);
    // The service filters by owner too, so the other tenant gets a 404.
    await expect(
      tenantStore.run(other, () => people.getPerson(other, created.id)),
    ).rejects.toMatchObject({ status: 404, code: "PERSON_NOT_FOUND" });
  });

  it("refuses an UPDATE of person events from the server role", async () => {
    const created = await asOwner(() =>
      people.createPerson(owner, { displayName: "Immutable History" }),
    );
    await expect(
      asTenant(pool, owner, (c) =>
        c.query("UPDATE wireline_person_events SET body = 'rewritten' WHERE person_id = $1", [
          created.id,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("People service against Postgres", () => {
  it("normalizes identifiers and reports a conflict instead of merging", async () => {
    const first = await asOwner(() =>
      people.createPerson(owner, {
        displayName: "Sam Ortiz",
        identifiers: [
          { kind: "phone", value: "+1 (415) 555-0142" },
          { kind: "email", value: "Sam Ortiz <SAM@Example.com>" },
        ],
      }),
    );
    expect(first.identifiers.map(({ kind, value }) => `${kind}:${value}`).sort()).toEqual([
      "email:sam@example.com",
      "phone:+14155550142",
    ]);
    await expect(
      asOwner(() =>
        people.createPerson(owner, {
          displayName: "Samuel O.",
          identifiers: [{ kind: "phone", value: "415-555-0142" }],
        }),
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: "PERSON_IDENTIFIER_CONFLICT",
      details: { personId: first.id },
    });
    // The other tenant can hold the same number independently.
    const elsewhere = await tenantStore.run(other, () =>
      people.createPerson(other, { identifiers: [{ kind: "phone", value: "4155550142" }] }),
    );
    expect(elsewhere.identifiers[0].value).toBe("+14155550142");
  });

  it("merges reversibly through chains and unmerges exactly", async () => {
    const a = await asOwner(() =>
      people.createPerson(owner, {
        displayName: "A Lee",
        identifiers: [{ kind: "email", value: "a.lee@example.com" }],
      }),
    );
    const b = await asOwner(() =>
      people.createPerson(owner, {
        displayName: "B Lee",
        identifiers: [{ kind: "phone", value: "2065550111" }],
      }),
    );
    const c = await asOwner(() => people.createPerson(owner, { displayName: "C Lee" }));

    await asOwner(() => people.mergePeople(owner, a.id, b.id));
    const merged = await asOwner(() => people.mergePeople(owner, b.id, c.id));
    expect(merged.id).toBe(c.id);
    expect(merged.mergedPeople.map((p) => p.id).sort()).toEqual([a.id, b.id].sort());
    expect(merged.identifiers.map((i) => i.value).sort()).toEqual([
      "+12065550111",
      "a.lee@example.com",
    ]);
    // Looking up A's email finds the surviving person.
    const found = await asOwner(() =>
      people.findPersonByIdentifier(owner, "email", "A.Lee@example.com"),
    );
    expect(found?.id).toBe(c.id);
    // A merged person cannot be merged again, and nobody merges into themselves.
    await expect(asOwner(() => people.mergePeople(owner, a.id, c.id))).rejects.toMatchObject({
      code: "PERSON_MERGE_INVALID",
    });
    await expect(asOwner(() => people.mergePeople(owner, c.id, c.id))).rejects.toMatchObject({
      code: "PERSON_MERGE_INVALID",
    });
    // The merged list hides A and B; only C survives.
    const listed = await asOwner(() => people.listPeople(owner, { query: "Lee" }));
    expect(listed.people.map((p) => p.id)).toEqual([c.id]);

    const restored = await asOwner(() => people.unmergePerson(owner, b.id));
    expect(restored.mergedIntoId).toBeNull();
    expect(restored.mergedPeople.map((p) => p.id)).toEqual([a.id]);
    const after = await asOwner(() => people.getPerson(owner, c.id));
    expect(after.identifiers).toEqual([]);
  });

  it("deletes a person, unmerges its duplicates and leaves an audit receipt", async () => {
    const keep = await asOwner(() =>
      people.createPerson(owner, {
        displayName: "Keep Me",
        identifiers: [{ kind: "email", value: "keep@example.com" }],
      }),
    );
    const gone = await asOwner(() => people.createPerson(owner, { displayName: "Delete Me" }));
    await asOwner(() => people.mergePeople(owner, keep.id, gone.id));
    await asOwner(() => people.deletePerson(owner, gone.id));
    const survivor = await asOwner(() => people.getPerson(owner, keep.id));
    expect(survivor.mergedIntoId).toBeNull();
    expect(survivor.identifiers.map((i) => i.value)).toEqual(["keep@example.com"]);
    const { rows } = await pool.query(
      "SELECT action, metadata FROM wireline_audit_log WHERE user_id = $1 AND resource_id = $2",
      [owner, gone.id],
    );
    expect(rows).toEqual([
      {
        action: "people.person.deleted",
        metadata: { actor: "owner", identifiers: 0, unmerged: 1 },
      },
    ]);
  });

  it("builds a timeline from channel receipts without copying them", async () => {
    const person = await asOwner(() =>
      people.createPerson(owner, {
        displayName: "Timeline Tess",
        identifiers: [
          { kind: "phone", value: "+1 773 555 0199" },
          { kind: "email", value: "tess@example.com" },
        ],
      }),
    );
    await pool.query(
      `INSERT INTO wireline_call_logs (user_id, direction, customer_number, summary, duration_seconds, created_at)
       VALUES ($1, 'inbound', '7735550199', 'Asked about a Friday install.', 125, now() - interval '3 days'),
              ($1, 'inbound', '+447735550199', 'A different country, same last ten digits.', 30, now() - interval '2 days'),
              ($2, 'inbound', '+17735550199', 'Another tenant.', 30, now() - interval '1 day')`,
      [owner, other],
    );
    const thread = await pool.query(
      `INSERT INTO wireline_sms_threads (user_id, customer_number, destination_number, last_message_at)
       VALUES ($1, '+17735550199', '+13125550000', now() - interval '1 day') RETURNING id`,
      [owner],
    );
    await pool.query(
      `INSERT INTO wireline_sms_messages (user_id, thread_id, direction, body, created_at)
       VALUES ($1, $2, 'in', 'Is Friday still good?', now() - interval '1 day')`,
      [owner, thread.rows[0].id],
    );
    await pool.query(
      `INSERT INTO wireline_email_threads (user_id, customer_email, subject, last_message_at)
       VALUES ($1, 'Tess <TESS@example.com>', 'Quote', now() - interval '4 hours')`,
      [owner],
    );
    await asOwner(() => people.addPersonNote(owner, person.id, "Prefers texts after 5pm."));

    const page = await asOwner(() => timeline.getPersonTimeline(owner, person.id));
    // The note and the "added" event are newest; channel receipts follow.
    expect(page.items.map((item) => item.source)).toEqual([
      "event",
      "event",
      "email",
      "sms",
      "call",
    ]);
    expect(page.items[0].title).toBe("Note");
    expect(page.items.find((item) => item.source === "call")?.preview).toBe(
      "Asked about a Friday install.",
    );
    expect(page.items.some((item) => item.preview?.includes("different country"))).toBe(false);
    expect(page.items.some((item) => item.preview === "Another tenant.")).toBe(false);

    const older = await asOwner(() =>
      timeline.getPersonTimeline(owner, person.id, { before: page.items[2].at, limit: 1 }),
    );
    expect(older.items.map((item) => item.source)).toEqual(["sms"]);
    expect(older.nextCursor).toBe(older.items[0].at);
    const oldest = await asOwner(() =>
      timeline.getPersonTimeline(owner, person.id, { before: older.nextCursor, limit: 1 }),
    );
    expect(oldest.items.map((item) => item.source)).toEqual(["call"]);
    expect(oldest.nextCursor).toBeNull();
  });

  it("suggests recent contacts that nobody in People holds yet", async () => {
    const fresh = await createUser(pool, "people-suggest");
    await pool.query(
      `INSERT INTO wireline_call_logs (user_id, direction, customer_number, created_at)
       VALUES ($1, 'inbound', '(608) 555-0123', now() - interval '2 days'),
              ($1, 'inbound', '608-555-0123', now() - interval '1 day'),
              ($1, 'inbound', '+16085550456', now() - interval '200 days')`,
      [fresh],
    );
    await pool.query(
      `INSERT INTO wireline_appointments (user_id, phone_number, customer_name, created_at)
       VALUES ($1, '6085550123', 'Riley Park', now() - interval '1 day')`,
      [fresh],
    );
    await pool.query(
      `INSERT INTO wireline_email_threads (user_id, customer_email, last_message_at)
       VALUES ($1, 'Jo Ng <jo@example.com>', now() - interval '3 hours')`,
      [fresh],
    );
    const first = await tenantStore.run(fresh, () => timeline.listPeopleSuggestions(fresh));
    expect(first.map(({ kind, value, nameHint }) => ({ kind, value, nameHint }))).toEqual([
      { kind: "email", value: "jo@example.com", nameHint: "Jo Ng" },
      { kind: "phone", value: "+16085550123", nameHint: "Riley Park" },
    ]);
    expect(first[1].sources.sort()).toEqual(["appointment", "call"]);

    await tenantStore.run(fresh, () =>
      people.createPerson(fresh, { identifiers: [{ kind: "email", value: "jo@example.com" }] }),
    );
    const second = await tenantStore.run(fresh, () => timeline.listPeopleSuggestions(fresh));
    expect(second.map((s) => s.value)).toEqual(["+16085550123"]);
  });

  it("pages without dropping rows written in the same millisecond", async () => {
    const pager = await createUser(pool, "people-pager");
    const ids: string[] = [];
    for (const name of ["First", "Second", "Third"]) {
      const created = await tenantStore.run(pager, () =>
        people.createPerson(pager, { displayName: name }),
      );
      ids.push(created.id);
    }
    // Three updates inside one millisecond, apart only in microseconds.
    await pool.query(
      `UPDATE wireline_people SET updated_at = CASE id
         WHEN $1::uuid THEN '2026-11-20T12:00:00.123900Z'::timestamptz
         WHEN $2::uuid THEN '2026-11-20T12:00:00.123500Z'::timestamptz
         WHEN $3::uuid THEN '2026-11-20T12:00:00.123100Z'::timestamptz END
       WHERE user_id = $4`,
      [ids[0], ids[1], ids[2], pager],
    );
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await tenantStore.run(pager, () =>
        people.listPeople(pager, { limit: 1, cursor }),
      );
      seen.push(...page.people.map((p) => p.id));
      cursor = page.nextCursor;
    } while (cursor && seen.length < 10);
    expect(seen).toEqual(ids);

    const owner2 = await createUser(pool, "people-pager-timeline");
    const person = await tenantStore.run(owner2, () =>
      people.createPerson(owner2, { identifiers: [{ kind: "phone", value: "3125550177" }] }),
    );
    await pool.query(
      `INSERT INTO wireline_call_logs (user_id, direction, customer_number, summary, created_at)
       VALUES ($1, 'inbound', '+13125550177', 'one', '2026-11-20T12:00:00.123900Z'),
              ($1, 'inbound', '+13125550177', 'two', '2026-11-20T12:00:00.123500Z'),
              ($1, 'inbound', '+13125550177', 'three', '2026-11-20T12:00:00.123100Z')`,
      [owner2],
    );
    const previews: Array<string | null> = [];
    let before: string | null = "2026-11-21T00:00:00.000000Z";
    while (before && previews.length < 10) {
      const page = await tenantStore.run(owner2, () =>
        timeline.getPersonTimeline(owner2, person.id, { before, limit: 1 }),
      );
      previews.push(...page.items.map((item) => item.preview));
      before = page.nextCursor;
    }
    expect(previews).toEqual(["one", "two", "three"]);
  });
});
