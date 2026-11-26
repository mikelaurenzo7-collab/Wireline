import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./schema-base";

/**
 * People (migration 0197): the tenant-owned customer record. One row per
 * person, any number of normalized identifiers, and an event history. The
 * timeline is a read-time union over the existing channel tables joined
 * through identifiers, so channel rows stay the receipts and are never copied.
 *
 * Merging is a reversible pointer: `merged_into_id` names the surviving
 * person and nothing moves. Unmerging clears the pointer. Identifiers are
 * unique per tenant, so an identifier already on another person is an
 * explicit conflict for the owner to resolve, never an automatic merge.
 *
 * Customer records are separate from model memory (`wireline_agent_lessons`).
 */
export const PERSON_STATUSES = ["active", "archived"] as const;
export type PersonStatus = (typeof PERSON_STATUSES)[number];

export const PERSON_IDENTIFIER_KINDS = ["phone", "email"] as const;
export type PersonIdentifierKind = (typeof PERSON_IDENTIFIER_KINDS)[number];

/** Where an identifier came from. Owner-entered and channel-derived values differ in trust. */
export const PERSON_IDENTIFIER_SOURCES = [
  "owner",
  "call",
  "sms",
  "email",
  "appointment",
  "bot",
] as const;
export type PersonIdentifierSource = (typeof PERSON_IDENTIFIER_SOURCES)[number];

export const PERSON_EVENT_KINDS = [
  "created",
  "note",
  "interaction",
  "field_change",
  "identifier_added",
  "identifier_removed",
  "merged",
  "unmerged",
] as const;
export type PersonEventKind = (typeof PERSON_EVENT_KINDS)[number];

export const PERSON_EVENT_ACTORS = ["owner", "bot", "system"] as const;
export type PersonEventActor = (typeof PERSON_EVENT_ACTORS)[number];

export const people = pgTable(
  "wireline_people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    displayName: text("display_name"),
    company: text("company"),
    status: text("status").$type<PersonStatus>().notNull().default("active"),
    /** Short summary the Bot maintains with owner approval. */
    summary: text("summary"),
    /** Owner-defined fields: a flat object of short string values. */
    customFields: jsonb("custom_fields")
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    /**
     * Reversible merge pointer to the surviving person, always in the same
     * tenant (composite key below). Deleting a person unmerges its children
     * first, so the key never needs ON DELETE behavior.
     */
    mergedIntoId: uuid("merged_into_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    idUserKey: unique("wireline_people_id_user_key").on(t.id, t.userId),
    mergedIntoFk: foreignKey({
      name: "wireline_people_merged_into_fk",
      columns: [t.mergedIntoId, t.userId],
      foreignColumns: [t.id, t.userId],
    }),
    userUpdatedIdx: index("idx_people_user_updated").on(t.userId, t.updatedAt),
    mergedIntoIdx: index("idx_people_merged_into")
      .on(t.mergedIntoId)
      .where(sql`${t.mergedIntoId} IS NOT NULL`),
    statusCheck: check("wireline_people_status_check", sql`${t.status} IN ('active', 'archived')`),
    nameCheck: check(
      "wireline_people_display_name_check",
      sql`${t.displayName} IS NULL OR char_length(${t.displayName}) BETWEEN 1 AND 120`,
    ),
    companyCheck: check(
      "wireline_people_company_check",
      sql`${t.company} IS NULL OR char_length(${t.company}) BETWEEN 1 AND 120`,
    ),
    summaryCheck: check(
      "wireline_people_summary_check",
      sql`${t.summary} IS NULL OR char_length(${t.summary}) <= 2000`,
    ),
    customFieldsCheck: check(
      "wireline_people_custom_fields_check",
      sql`jsonb_typeof(${t.customFields}) = 'object'`,
    ),
    mergeSelfCheck: check(
      "wireline_people_merge_self_check",
      sql`${t.mergedIntoId} IS NULL OR ${t.mergedIntoId} <> ${t.id}`,
    ),
  }),
).enableRLS();

export const personIdentifiers = pgTable(
  "wireline_person_identifiers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    personId: uuid("person_id").notNull(),
    kind: text("kind").$type<PersonIdentifierKind>().notNull(),
    /** E.164 phone or lowercased email address. */
    value: text("value").notNull(),
    source: text("source").$type<PersonIdentifierSource>().notNull(),
    verified: boolean("verified").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    personFk: foreignKey({
      name: "wireline_person_identifiers_person_fk",
      columns: [t.personId, t.userId],
      foreignColumns: [people.id, people.userId],
    }).onDelete("cascade"),
    tenantValueKey: uniqueIndex("uq_person_identifiers_user_kind_value").on(
      t.userId,
      t.kind,
      t.value,
    ),
    personIdx: index("idx_person_identifiers_person").on(t.personId),
    kindCheck: check(
      "wireline_person_identifiers_kind_check",
      sql`${t.kind} IN ('phone', 'email')`,
    ),
    sourceCheck: check(
      "wireline_person_identifiers_source_check",
      sql`${t.source} IN ('owner', 'call', 'sms', 'email', 'appointment', 'bot')`,
    ),
    valueCheck: check(
      "wireline_person_identifiers_value_check",
      sql`(${t.kind} = 'phone' AND ${t.value} ~ '^\\+[1-9][0-9]{6,14}$') OR (${t.kind} = 'email' AND ${t.value} = lower(${t.value}) AND char_length(${t.value}) <= 254 AND ${t.value} ~ '^[^@[:space:]]+@[^@[:space:]]+$')`,
    ),
  }),
).enableRLS();

export const personEvents = pgTable(
  "wireline_person_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    personId: uuid("person_id").notNull(),
    kind: text("kind").$type<PersonEventKind>().notNull(),
    actor: text("actor").$type<PersonEventActor>().notNull(),
    /** Bot that acted, when `actor` is `bot`. */
    agentId: text("agent_id"),
    body: text("body"),
    data: jsonb("data")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    personFk: foreignKey({
      name: "wireline_person_events_person_fk",
      columns: [t.personId, t.userId],
      foreignColumns: [people.id, people.userId],
    }).onDelete("cascade"),
    personCreatedIdx: index("idx_person_events_person_created").on(t.personId, t.createdAt),
    userCreatedIdx: index("idx_person_events_user_created").on(t.userId, t.createdAt),
    kindCheck: check(
      "wireline_person_events_kind_check",
      sql`${t.kind} IN ('created', 'note', 'interaction', 'field_change', 'identifier_added', 'identifier_removed', 'merged', 'unmerged')`,
    ),
    actorCheck: check(
      "wireline_person_events_actor_check",
      sql`${t.actor} IN ('owner', 'bot', 'system')`,
    ),
    bodyCheck: check(
      "wireline_person_events_body_check",
      sql`${t.body} IS NULL OR char_length(${t.body}) <= 4000`,
    ),
    dataCheck: check("wireline_person_events_data_check", sql`jsonb_typeof(${t.data}) = 'object'`),
  }),
).enableRLS();

export type Person = typeof people.$inferSelect;
export type PersonIdentifier = typeof personIdentifiers.$inferSelect;
export type PersonEvent = typeof personEvents.$inferSelect;
