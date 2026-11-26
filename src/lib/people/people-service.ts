import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";

import {
  PERSON_IDENTIFIER_SOURCES,
  PERSON_STATUSES,
  people,
  personEvents,
  personIdentifiers,
  type Person,
  type PersonEventActor,
  type PersonEventKind,
  type PersonIdentifier,
  type PersonIdentifierSource,
  type PersonStatus,
} from "../../db/people-schema";
import { auditLog } from "../../db/schema-base";
import { AppError } from "../api-error";
import { drizzle, tenantStore } from "../server-context";
import { normalizeIdentifier, type NormalizedIdentifier } from "./identifiers";

/**
 * People service. Every read and write runs inside the owner's tenant scope
 * (RLS keyed to `app.current_user_id`) and also filters by `user_id`, so a
 * missing scope fails closed instead of reading across tenants.
 */

export const PEOPLE_LIST_LIMIT = 50;
export const PERSON_NOTE_MAX = 4000;
export const PERSON_SUMMARY_MAX = 2000;
export const PERSON_NAME_MAX = 120;
export const PERSON_CUSTOM_FIELDS_MAX = 20;
export const PERSON_CUSTOM_FIELD_KEY_MAX = 40;
export const PERSON_CUSTOM_FIELD_VALUE_MAX = 500;
export const PERSON_IDENTIFIERS_MAX = 20;
/** Merge chains only grow at their roots; this bounds every chain walk. */
const MERGE_WALK_LIMIT = 64;

export type PeopleActor = { kind: PersonEventActor; agentId?: string | null };

export const OWNER_ACTOR: PeopleActor = { kind: "owner" };

export type PersonIdentifierView = {
  id: string;
  personId: string;
  kind: PersonIdentifier["kind"];
  value: string;
  source: PersonIdentifierSource;
  verified: boolean;
  createdAt: string;
};

export type PersonView = {
  id: string;
  displayName: string | null;
  company: string | null;
  status: PersonStatus;
  summary: string | null;
  customFields: Record<string, string>;
  mergedIntoId: string | null;
  createdAt: string;
  updatedAt: string;
  identifiers: PersonIdentifierView[];
};

export type PersonDetail = PersonView & {
  /** People merged into this one (directly or through a chain). */
  mergedPeople: Array<{ id: string; displayName: string | null; mergedIntoId: string | null }>;
};

export type PersonIdentifierInput = {
  kind: unknown;
  value: unknown;
  source?: unknown;
  verified?: unknown;
};

export type CreatePersonInput = {
  displayName?: unknown;
  company?: unknown;
  identifiers?: unknown;
};

export type UpdatePersonInput = {
  displayName?: unknown;
  company?: unknown;
  status?: unknown;
  summary?: unknown;
  customFields?: unknown;
};

const PG_UNIQUE_VIOLATION = "23505";
const PG_UNDEFINED_TABLE = "42P01";

function pgCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; current && depth < 4; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/** Until migration 0197 is applied, People answers 503 instead of 500. */
export function rethrowPeopleStoreError(error: unknown): never {
  if (pgCode(error) === PG_UNDEFINED_TABLE) {
    throw new AppError(
      503,
      "PEOPLE_UNAVAILABLE",
      "People isn't available on this workspace yet. Try again later.",
    );
  }
  throw error;
}

function inTenant<T>(userId: string, work: () => Promise<T>): Promise<T> {
  return tenantStore.run(userId, async () => {
    try {
      return await work();
    } catch (error) {
      rethrowPeopleStoreError(error);
    }
  });
}

function iso(value: Date | string | null | undefined): string {
  if (!value) return new Date(0).toISOString();
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function identifierView(row: PersonIdentifier): PersonIdentifierView {
  return {
    id: row.id,
    personId: row.personId,
    kind: row.kind,
    value: row.value,
    source: row.source,
    verified: row.verified,
    createdAt: iso(row.createdAt),
  };
}

function personView(row: Person, identifiers: PersonIdentifier[]): PersonView {
  return {
    id: row.id,
    displayName: row.displayName,
    company: row.company,
    status: row.status,
    summary: row.summary,
    customFields: (row.customFields ?? {}) as Record<string, string>,
    mergedIntoId: row.mergedIntoId,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    identifiers: identifiers.map(identifierView),
  };
}

/* ── Input validation ─────────────────────────────────────────────── */

function optionalText(value: unknown, field: string, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw AppError.badRequest(`${field} must be text.`);
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  if (trimmed.length > max) {
    throw AppError.badRequest(`${field} can be at most ${max} characters.`);
  }
  return trimmed;
}

function multilineText(value: unknown, field: string, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw AppError.badRequest(`${field} must be text.`);
  const trimmed = value.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return null;
  if (trimmed.length > max) {
    throw AppError.badRequest(`${field} can be at most ${max} characters.`);
  }
  return trimmed;
}

function parseStatus(value: unknown): PersonStatus | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string" && (PERSON_STATUSES as readonly string[]).includes(value)) {
    return value as PersonStatus;
  }
  throw AppError.badRequest("Status must be active or archived.");
}

export function parseCustomFields(value: unknown): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw AppError.badRequest("Custom fields must be a set of named values.");
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > PERSON_CUSTOM_FIELDS_MAX) {
    throw AppError.badRequest(
      `A person can have at most ${PERSON_CUSTOM_FIELDS_MAX} custom fields.`,
    );
  }
  const out: Record<string, string> = {};
  for (const [rawKey, rawValue] of entries) {
    const key = rawKey.trim();
    if (!key || key.length > PERSON_CUSTOM_FIELD_KEY_MAX) {
      throw AppError.badRequest(
        `Custom field names need 1 to ${PERSON_CUSTOM_FIELD_KEY_MAX} characters.`,
      );
    }
    if (rawValue === null || rawValue === undefined || rawValue === "") continue;
    if (
      typeof rawValue !== "string" &&
      typeof rawValue !== "number" &&
      typeof rawValue !== "boolean"
    ) {
      throw AppError.badRequest(`Custom field "${key}" must be text.`);
    }
    const text = String(rawValue).trim();
    if (text.length > PERSON_CUSTOM_FIELD_VALUE_MAX) {
      throw AppError.badRequest(
        `Custom field "${key}" can be at most ${PERSON_CUSTOM_FIELD_VALUE_MAX} characters.`,
      );
    }
    if (text) out[key] = text;
  }
  return out;
}

function parseSource(value: unknown, fallback: PersonIdentifierSource): PersonIdentifierSource {
  if (value === undefined || value === null) return fallback;
  if (
    typeof value === "string" &&
    (PERSON_IDENTIFIER_SOURCES as readonly string[]).includes(value)
  ) {
    return value as PersonIdentifierSource;
  }
  throw AppError.badRequest("Unknown identifier source.");
}

export function parseIdentifierInput(
  input: PersonIdentifierInput,
  fallbackSource: PersonIdentifierSource,
): NormalizedIdentifier & { source: PersonIdentifierSource; verified: boolean } {
  const normalized = normalizeIdentifier(input?.kind, input?.value);
  if (!normalized) {
    throw new AppError(
      400,
      "PERSON_IDENTIFIER_INVALID",
      input?.kind === "email"
        ? "Enter one email address, like name@example.com."
        : input?.kind === "phone"
          ? "Enter a phone number with its area code, or a + and country code."
          : "Choose a phone number or an email address.",
    );
  }
  return {
    ...normalized,
    source: parseSource(input.source, fallbackSource),
    // Only channel receipts verify an identifier: an owner typing a number
    // does not prove the person answers it.
    verified: input.verified === true && fallbackSource !== "owner",
  };
}

/* ── Internal reads ───────────────────────────────────────────────── */

type Tx = Parameters<Parameters<typeof drizzle.transaction>[0]>[0];
type Db = typeof drizzle | Tx;

async function loadPerson(db: Db, userId: string, personId: string, lock = false) {
  const query = db
    .select()
    .from(people)
    .where(and(eq(people.userId, userId), eq(people.id, personId)))
    .limit(1);
  const [row] = lock ? await query.for("update") : await query;
  return row ?? null;
}

async function requirePerson(db: Db, userId: string, personId: string, lock = false) {
  if (!isUuid(personId)) throw new AppError(404, "PERSON_NOT_FOUND", "That person wasn't found.");
  const row = await loadPerson(db, userId, personId, lock);
  if (!row) throw new AppError(404, "PERSON_NOT_FOUND", "That person wasn't found.");
  return row;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function uuidList(ids: string[]) {
  return sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
}

function resultRows<T>(result: unknown): T[] {
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}

/** The surviving person for each id: follows merge pointers to the root. */
export async function resolveCanonicalPersonIds(
  db: Db,
  userId: string,
  personIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(personIds.filter(isUuid))];
  if (!ids.length) return new Map();
  const result = await db.execute(sql`
    WITH RECURSIVE chain(start_id, id, merged_into_id, depth) AS (
      SELECT id, id, merged_into_id, 0 FROM wireline_people
       WHERE user_id = ${userId} AND id IN (${uuidList(ids)})
      UNION ALL
      SELECT chain.start_id, p.id, p.merged_into_id, chain.depth + 1
        FROM wireline_people p
        JOIN chain ON p.id = chain.merged_into_id
       WHERE p.user_id = ${userId} AND chain.depth < ${MERGE_WALK_LIMIT}
    )
    SELECT start_id, id FROM chain WHERE merged_into_id IS NULL
  `);
  return new Map(
    resultRows<{ start_id: string; id: string }>(result).map((row) => [row.start_id, row.id]),
  );
}

export async function resolveCanonicalPersonId(
  db: Db,
  userId: string,
  personId: string,
): Promise<string> {
  return (await resolveCanonicalPersonIds(db, userId, [personId])).get(personId) ?? personId;
}

/** Each root plus everyone merged into it, directly or through a chain. */
export async function personFamilies(
  db: Db,
  userId: string,
  rootIds: string[],
): Promise<Map<string, string[]>> {
  const ids = [...new Set(rootIds.filter(isUuid))];
  const families = new Map<string, string[]>(ids.map((id) => [id, [id]]));
  if (!ids.length) return families;
  const result = await db.execute(sql`
    WITH RECURSIVE family(root_id, id, depth) AS (
      SELECT id, id, 0 FROM wireline_people
       WHERE user_id = ${userId} AND id IN (${uuidList(ids)})
      UNION ALL
      SELECT family.root_id, p.id, family.depth + 1
        FROM wireline_people p
        JOIN family ON p.merged_into_id = family.id
       WHERE p.user_id = ${userId} AND family.depth < ${MERGE_WALK_LIMIT}
    )
    SELECT root_id, id FROM family WHERE depth > 0
  `);
  for (const row of resultRows<{ root_id: string; id: string }>(result)) {
    const members = families.get(row.root_id);
    if (members && !members.includes(row.id)) members.push(row.id);
  }
  return families;
}

export async function personFamilyIds(db: Db, userId: string, personId: string): Promise<string[]> {
  return (await personFamilies(db, userId, [personId])).get(personId) ?? [personId];
}

async function identifiersFor(db: Db, userId: string, personIds: string[]) {
  if (!personIds.length) return [];
  return db
    .select()
    .from(personIdentifiers)
    .where(
      and(eq(personIdentifiers.userId, userId), inArray(personIdentifiers.personId, personIds)),
    )
    .orderBy(asc(personIdentifiers.createdAt));
}

async function recordEvent(
  db: Db,
  userId: string,
  personId: string,
  kind: PersonEventKind,
  actor: PeopleActor,
  body: string | null = null,
  data: Record<string, unknown> = {},
) {
  const [row] = await db
    .insert(personEvents)
    .values({
      userId,
      personId,
      kind,
      actor: actor.kind,
      agentId: actor.kind === "bot" ? (actor.agentId ?? null) : null,
      body,
      data,
    })
    .returning();
  return row;
}

async function touch(db: Db, userId: string, personId: string) {
  await db
    .update(people)
    .set({ updatedAt: new Date() })
    .where(and(eq(people.userId, userId), eq(people.id, personId)));
}

/** Who already holds an identifier, resolved to the surviving person. */
async function identifierOwner(db: Db, userId: string, identifier: NormalizedIdentifier) {
  const [existing] = await db
    .select({ personId: personIdentifiers.personId })
    .from(personIdentifiers)
    .where(
      and(
        eq(personIdentifiers.userId, userId),
        eq(personIdentifiers.kind, identifier.kind),
        eq(personIdentifiers.value, identifier.value),
      ),
    )
    .limit(1);
  if (!existing) return null;
  return resolveCanonicalPersonId(db, userId, existing.personId);
}

function identifierConflict(identifier: NormalizedIdentifier, personId: string): AppError {
  return new AppError(
    409,
    "PERSON_IDENTIFIER_CONFLICT",
    identifier.kind === "phone"
      ? "That phone number already belongs to someone else in People. Open them to merge or move it."
      : "That email address already belongs to someone else in People. Open them to merge or move it.",
    { personId, kind: identifier.kind, value: identifier.value },
  );
}

/* ── Public API ───────────────────────────────────────────────────── */

export type ListPeopleOptions = {
  query?: unknown;
  status?: unknown;
  limit?: unknown;
  /** ISO timestamp from the previous page's `nextCursor`. */
  cursor?: unknown;
};

export async function listPeople(
  userId: string,
  options: ListPeopleOptions = {},
): Promise<{ people: PersonView[]; nextCursor: string | null }> {
  const limitRaw = Number(options.limit ?? PEOPLE_LIST_LIMIT);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.trunc(limitRaw), 1), PEOPLE_LIST_LIMIT)
    : PEOPLE_LIST_LIMIT;
  const status = options.status === "archived" ? "archived" : "active";
  const query = typeof options.query === "string" ? options.query.trim().slice(0, 120) : "";
  const cursor =
    typeof options.cursor === "string" && !Number.isNaN(Date.parse(options.cursor))
      ? new Date(options.cursor)
      : null;

  return inTenant(userId, async () => {
    const filters = [
      eq(people.userId, userId),
      isNull(people.mergedIntoId),
      eq(people.status, status),
    ];
    if (cursor) filters.push(lt(people.updatedAt, cursor));
    if (query) {
      const escaped = query.replace(/[\\%_]/g, (c) => `\\${c}`);
      const digits = query.replace(/\D/g, "");
      const identifierFilters = [
        and(
          eq(personIdentifiers.kind, "email"),
          sql`${personIdentifiers.value} LIKE ${`%${escaped.toLowerCase()}%`}`,
        ),
      ];
      if (digits.length >= 4) {
        identifierFilters.push(
          and(
            eq(personIdentifiers.kind, "phone"),
            sql`${personIdentifiers.value} LIKE ${`%${digits}%`}`,
          ),
        );
      }
      const holders = await drizzle
        .select({ personId: personIdentifiers.personId })
        .from(personIdentifiers)
        .where(and(eq(personIdentifiers.userId, userId), or(...identifierFilters)))
        .limit(200);
      const canonical = await resolveCanonicalPersonIds(
        drizzle,
        userId,
        holders.map((row) => row.personId),
      );
      const matchedIds = [...new Set(canonical.values())];
      const textMatch = or(
        sql`${people.displayName} ILIKE ${`%${escaped}%`}`,
        sql`${people.company} ILIKE ${`%${escaped}%`}`,
      )!;
      filters.push(matchedIds.length ? or(textMatch, inArray(people.id, matchedIds))! : textMatch);
    }
    const rows = await drizzle
      .select()
      .from(people)
      .where(and(...filters))
      .orderBy(desc(people.updatedAt), desc(people.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    // A person shows every identifier in its family, including merged ones.
    const families = await personFamilies(
      drizzle,
      userId,
      page.map((row) => row.id),
    );
    const memberToRoot = new Map<string, string>();
    for (const [root, members] of families) for (const id of members) memberToRoot.set(id, root);
    const identifiers = await identifiersFor(drizzle, userId, [...memberToRoot.keys()]);
    const byRoot = new Map<string, PersonIdentifier[]>();
    for (const identifier of identifiers) {
      const root = memberToRoot.get(identifier.personId);
      if (!root) continue;
      byRoot.set(root, [...(byRoot.get(root) ?? []), identifier]);
    }
    const last = page[page.length - 1];
    return {
      people: page.map((row) => personView(row, byRoot.get(row.id) ?? [])),
      nextCursor: rows.length > limit && last ? iso(last.updatedAt) : null,
    };
  });
}

export async function getPerson(userId: string, personId: string): Promise<PersonDetail> {
  return inTenant(userId, async () => {
    const row = await requirePerson(drizzle, userId, personId);
    const family = await personFamilyIds(drizzle, userId, row.id);
    const identifiers = await identifiersFor(drizzle, userId, family);
    const descendants = family.filter((id) => id !== row.id);
    const mergedRows = descendants.length
      ? await drizzle
          .select({
            id: people.id,
            displayName: people.displayName,
            mergedIntoId: people.mergedIntoId,
          })
          .from(people)
          .where(and(eq(people.userId, userId), inArray(people.id, descendants)))
      : [];
    return { ...personView(row, identifiers), mergedPeople: mergedRows };
  });
}

/** Find the surviving person that holds a phone or email, if any. */
export async function findPersonByIdentifier(
  userId: string,
  kind: unknown,
  value: unknown,
): Promise<PersonDetail | null> {
  const identifier = normalizeIdentifier(kind, value);
  if (!identifier) return null;
  const personId = await inTenant(userId, () => identifierOwner(drizzle, userId, identifier));
  return personId ? getPerson(userId, personId) : null;
}

export async function createPerson(
  userId: string,
  input: CreatePersonInput,
  actor: PeopleActor = OWNER_ACTOR,
): Promise<PersonDetail> {
  const displayName = optionalText(input.displayName, "Name", PERSON_NAME_MAX) ?? null;
  const company = optionalText(input.company, "Company", PERSON_NAME_MAX) ?? null;
  const rawIdentifiers = Array.isArray(input.identifiers) ? input.identifiers : [];
  if (rawIdentifiers.length > PERSON_IDENTIFIERS_MAX) {
    throw AppError.badRequest(
      `A person can have at most ${PERSON_IDENTIFIERS_MAX} phones and emails.`,
    );
  }
  const fallbackSource: PersonIdentifierSource = actor.kind === "bot" ? "bot" : "owner";
  const identifiers = rawIdentifiers.map((entry) =>
    parseIdentifierInput(entry as PersonIdentifierInput, fallbackSource),
  );
  const unique = new Map(identifiers.map((entry) => [`${entry.kind}:${entry.value}`, entry]));
  if (!displayName && unique.size === 0) {
    throw AppError.badRequest("Add a name, phone number or email address.");
  }

  const personId = await inTenant(userId, () =>
    drizzle.transaction(async (tx) => {
      for (const identifier of unique.values()) {
        const owner = await identifierOwner(tx, userId, identifier);
        if (owner) throw identifierConflict(identifier, owner);
      }
      const [row] = await tx
        .insert(people)
        .values({ userId, displayName, company })
        .returning({ id: people.id });
      if (unique.size) {
        try {
          await tx.insert(personIdentifiers).values(
            [...unique.values()].map((identifier) => ({
              userId,
              personId: row.id,
              kind: identifier.kind,
              value: identifier.value,
              source: identifier.source,
              verified: identifier.verified,
            })),
          );
        } catch (error) {
          if (pgCode(error) === PG_UNIQUE_VIOLATION) {
            throw new AppError(
              409,
              "PERSON_IDENTIFIER_CONFLICT",
              "One of those details was just added to someone else. Refresh and try again.",
            );
          }
          throw error;
        }
      }
      await recordEvent(tx, userId, row.id, "created", actor, null, {
        identifiers: [...unique.values()].map(({ kind, value }) => ({ kind, value })),
      });
      return row.id;
    }),
  );
  return getPerson(userId, personId);
}

const FIELD_LABELS: Record<string, string> = {
  displayName: "name",
  company: "company",
  status: "status",
  summary: "summary",
  customFields: "custom fields",
};

export async function updatePerson(
  userId: string,
  personId: string,
  input: UpdatePersonInput,
  actor: PeopleActor = OWNER_ACTOR,
): Promise<PersonDetail> {
  const patch: Partial<
    Pick<Person, "displayName" | "company" | "status" | "summary" | "customFields">
  > = {};
  const displayName = optionalText(input.displayName, "Name", PERSON_NAME_MAX);
  if (displayName !== undefined) patch.displayName = displayName;
  const company = optionalText(input.company, "Company", PERSON_NAME_MAX);
  if (company !== undefined) patch.company = company;
  const status = parseStatus(input.status);
  if (status !== undefined) patch.status = status;
  const summary = multilineText(input.summary, "Summary", PERSON_SUMMARY_MAX);
  if (summary !== undefined) patch.summary = summary;
  const customFields = parseCustomFields(input.customFields);
  if (customFields !== undefined) patch.customFields = customFields;
  if (!Object.keys(patch).length) throw AppError.badRequest("Nothing to change.");

  await inTenant(userId, () =>
    drizzle.transaction(async (tx) => {
      const before = await requirePerson(tx, userId, personId, true);
      if (before.mergedIntoId) {
        throw new AppError(
          409,
          "PERSON_MERGED",
          "This person was merged into someone else. Edit them there, or unmerge first.",
          { personId: before.mergedIntoId },
        );
      }
      const changes: Array<{ field: string; from: unknown; to: unknown }> = [];
      for (const [field, next] of Object.entries(patch)) {
        const previous = before[field as keyof Person];
        if (JSON.stringify(previous ?? null) !== JSON.stringify(next ?? null)) {
          changes.push({ field, from: previous ?? null, to: next ?? null });
        }
      }
      if (!changes.length) return;
      await tx
        .update(people)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(people.userId, userId), eq(people.id, personId)));
      await recordEvent(
        tx,
        userId,
        personId,
        "field_change",
        actor,
        `Updated ${changes.map((change) => FIELD_LABELS[change.field] ?? change.field).join(", ")}`,
        { changes },
      );
    }),
  );
  return getPerson(userId, personId);
}

export async function addPersonIdentifier(
  userId: string,
  personId: string,
  input: PersonIdentifierInput,
  actor: PeopleActor = OWNER_ACTOR,
): Promise<PersonDetail> {
  const identifier = parseIdentifierInput(input, actor.kind === "bot" ? "bot" : "owner");
  await inTenant(userId, () =>
    drizzle.transaction(async (tx) => {
      const person = await requirePerson(tx, userId, personId, true);
      const target = person.mergedIntoId
        ? await resolveCanonicalPersonId(tx, userId, person.id)
        : person.id;
      const owner = await identifierOwner(tx, userId, identifier);
      if (owner === target) return; // already on this person's record
      if (owner) throw identifierConflict(identifier, owner);
      const [{ count }] = resultRows<{ count: number }>(
        await tx.execute(
          sql`SELECT count(*)::int AS count FROM wireline_person_identifiers WHERE user_id = ${userId} AND person_id = ${target}`,
        ),
      );
      if (count >= PERSON_IDENTIFIERS_MAX) {
        throw AppError.badRequest(
          `A person can have at most ${PERSON_IDENTIFIERS_MAX} phones and emails.`,
        );
      }
      try {
        await tx.insert(personIdentifiers).values({
          userId,
          personId: target,
          kind: identifier.kind,
          value: identifier.value,
          source: identifier.source,
          verified: identifier.verified,
        });
      } catch (error) {
        if (pgCode(error) === PG_UNIQUE_VIOLATION) throw identifierConflict(identifier, target);
        throw error;
      }
      await recordEvent(tx, userId, target, "identifier_added", actor, null, {
        kind: identifier.kind,
        value: identifier.value,
        source: identifier.source,
      });
      await touch(tx, userId, target);
    }),
  );
  return getPerson(userId, personId);
}

export async function removePersonIdentifier(
  userId: string,
  personId: string,
  identifierId: string,
  actor: PeopleActor = OWNER_ACTOR,
): Promise<PersonDetail> {
  if (!isUuid(identifierId)) {
    throw new AppError(404, "PERSON_IDENTIFIER_NOT_FOUND", "That detail wasn't found.");
  }
  await inTenant(userId, () =>
    drizzle.transaction(async (tx) => {
      const person = await requirePerson(tx, userId, personId, true);
      const canonical = await resolveCanonicalPersonId(tx, userId, person.id);
      const family = await personFamilyIds(tx, userId, canonical);
      const [removed] = await tx
        .delete(personIdentifiers)
        .where(
          and(
            eq(personIdentifiers.userId, userId),
            eq(personIdentifiers.id, identifierId),
            inArray(personIdentifiers.personId, family),
          ),
        )
        .returning();
      if (!removed) {
        throw new AppError(404, "PERSON_IDENTIFIER_NOT_FOUND", "That detail wasn't found.");
      }
      await recordEvent(tx, userId, canonical, "identifier_removed", actor, null, {
        kind: removed.kind,
        value: removed.value,
      });
      await touch(tx, userId, canonical);
    }),
  );
  return getPerson(userId, personId);
}

export async function addPersonNote(
  userId: string,
  personId: string,
  body: unknown,
  actor: PeopleActor = OWNER_ACTOR,
) {
  const text = multilineText(body, "Note", PERSON_NOTE_MAX);
  if (!text) throw AppError.badRequest("Write a note first.");
  return inTenant(userId, () =>
    drizzle.transaction(async (tx) => {
      const person = await requirePerson(tx, userId, personId, true);
      const target = person.mergedIntoId
        ? await resolveCanonicalPersonId(tx, userId, person.id)
        : person.id;
      const event = await recordEvent(tx, userId, target, "note", actor, text);
      await touch(tx, userId, target);
      return {
        id: event.id,
        personId: target,
        kind: event.kind,
        actor: event.actor,
        body: event.body,
        createdAt: iso(event.createdAt),
      };
    }),
  );
}

export async function deletePersonNote(userId: string, personId: string, eventId: string) {
  if (!isUuid(eventId)) throw new AppError(404, "PERSON_NOTE_NOT_FOUND", "That note wasn't found.");
  if (!isUuid(personId))
    throw new AppError(404, "PERSON_NOTE_NOT_FOUND", "That note wasn't found.");
  await inTenant(userId, async () => {
    const canonical = await resolveCanonicalPersonId(drizzle, userId, personId);
    const family = await personFamilyIds(drizzle, userId, canonical);
    // Only notes can be removed; field changes, merges and Bot interactions
    // stay as history.
    const [removed] = await drizzle
      .delete(personEvents)
      .where(
        and(
          eq(personEvents.userId, userId),
          eq(personEvents.id, eventId),
          eq(personEvents.kind, "note"),
          inArray(personEvents.personId, family),
        ),
      )
      .returning({ id: personEvents.id });
    if (!removed) throw new AppError(404, "PERSON_NOTE_NOT_FOUND", "That note wasn't found.");
  });
}

/**
 * Merge `sourceId` into `targetId`. Both must be surviving people. Nothing
 * moves: the source keeps its identifiers and history and gains a pointer, so
 * unmerging restores exactly what was there.
 */
export async function mergePeople(
  userId: string,
  sourceId: string,
  targetId: string,
  actor: PeopleActor = OWNER_ACTOR,
): Promise<PersonDetail> {
  if (!isUuid(sourceId) || !isUuid(targetId) || sourceId === targetId) {
    throw new AppError(409, "PERSON_MERGE_INVALID", "Choose two different people to merge.");
  }
  await inTenant(userId, () =>
    drizzle.transaction(async (tx) => {
      // Lock in a fixed order so two opposite merges cannot deadlock.
      const [first, second] = [sourceId, targetId].sort();
      const a = await requirePerson(tx, userId, first, true);
      const b = await requirePerson(tx, userId, second, true);
      const source = a.id === sourceId ? a : b;
      const target = a.id === targetId ? a : b;
      if (source.mergedIntoId || target.mergedIntoId) {
        throw new AppError(
          409,
          "PERSON_MERGE_INVALID",
          "One of these people is already merged into someone else. Unmerge them first.",
        );
      }
      await tx
        .update(people)
        .set({ mergedIntoId: target.id, updatedAt: new Date() })
        .where(and(eq(people.userId, userId), eq(people.id, source.id)));
      await recordEvent(tx, userId, target.id, "merged", actor, null, {
        sourceId: source.id,
        sourceName: source.displayName,
      });
      await recordEvent(tx, userId, source.id, "merged", actor, null, {
        targetId: target.id,
        targetName: target.displayName,
      });
      await touch(tx, userId, target.id);
    }),
  );
  return getPerson(userId, targetId);
}

export async function unmergePerson(
  userId: string,
  personId: string,
  actor: PeopleActor = OWNER_ACTOR,
): Promise<PersonDetail> {
  await inTenant(userId, () =>
    drizzle.transaction(async (tx) => {
      const person = await requirePerson(tx, userId, personId, true);
      if (!person.mergedIntoId) {
        throw new AppError(409, "PERSON_NOT_MERGED", "This person isn't merged into anyone.");
      }
      const formerTarget = person.mergedIntoId;
      await tx
        .update(people)
        .set({ mergedIntoId: null, updatedAt: new Date() })
        .where(and(eq(people.userId, userId), eq(people.id, person.id)));
      await recordEvent(tx, userId, person.id, "unmerged", actor, null, { fromId: formerTarget });
      await recordEvent(tx, userId, formerTarget, "unmerged", actor, null, {
        sourceId: person.id,
        sourceName: person.displayName,
      });
      await touch(tx, userId, formerTarget);
    }),
  );
  return getPerson(userId, personId);
}

/**
 * Delete one person record: its identifiers and events go with it. Anyone
 * merged into it is unmerged first, so their records survive. Channel
 * receipts (calls, texts, email, bookings) are never touched.
 */
export async function deletePerson(
  userId: string,
  personId: string,
  actor: PeopleActor = OWNER_ACTOR,
): Promise<void> {
  await inTenant(userId, () =>
    drizzle.transaction(async (tx) => {
      const person = await requirePerson(tx, userId, personId, true);
      const children = await tx
        .update(people)
        .set({ mergedIntoId: null, updatedAt: new Date() })
        .where(and(eq(people.userId, userId), eq(people.mergedIntoId, person.id)))
        .returning({ id: people.id });
      for (const child of children) {
        await recordEvent(tx, userId, child.id, "unmerged", actor, null, {
          fromId: person.id,
          reason: "deleted",
        });
      }
      const [{ identifiers }] = resultRows<{ identifiers: number }>(
        await tx.execute(
          sql`SELECT count(*)::int AS identifiers FROM wireline_person_identifiers WHERE user_id = ${userId} AND person_id = ${person.id}`,
        ),
      );
      await tx.delete(people).where(and(eq(people.userId, userId), eq(people.id, person.id)));
      // The person's own history goes with it, so the receipt lives in the
      // audit log. It names no phone, email or person details.
      await tx.insert(auditLog).values({
        userId,
        action: "people.person.deleted",
        eventType: "people.person.deleted",
        resourceType: "person",
        resourceId: person.id,
        metadata: { actor: actor.kind, identifiers, unmerged: children.length },
      });
    }),
  );
}

export type PersonEventView = {
  id: string;
  personId: string;
  kind: PersonEventKind;
  actor: PersonEventActor;
  agentId: string | null;
  body: string | null;
  data: Record<string, unknown>;
  createdAt: string;
};

export async function listPersonEvents(
  db: Db,
  userId: string,
  personIds: string[],
  before: Date | null,
  limit: number,
): Promise<PersonEventView[]> {
  if (!personIds.length) return [];
  const filters = [eq(personEvents.userId, userId), inArray(personEvents.personId, personIds)];
  if (before) filters.push(lt(personEvents.createdAt, before));
  const rows = await db
    .select()
    .from(personEvents)
    .where(and(...filters))
    .orderBy(desc(personEvents.createdAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    personId: row.personId,
    kind: row.kind,
    actor: row.actor,
    agentId: row.agentId,
    body: row.body,
    data: (row.data ?? {}) as Record<string, unknown>,
    createdAt: iso(row.createdAt),
  }));
}

export { identifiersFor, inTenant as runPeopleInTenant };
