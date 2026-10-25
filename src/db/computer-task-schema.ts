import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { agents, users } from "./schema-base";

export const COMPUTER_TASK_STATUSES = [
  "running",
  "needs_input",
  "completed",
  "blocked",
  "failed",
  "stopped",
  "interrupted",
] as const;
export type ComputerTaskStatus = (typeof COMPUTER_TASK_STATUSES)[number];

export type ComputerTaskEvent = {
  at: string;
  kind: "action" | "note" | "question" | "reply" | "result" | "error";
  text: string;
  url?: string;
  ok?: boolean;
};

/**
 * One owner-assigned task on a Bot's cloud computer (migration 0176).
 *
 * The row carries the goal, lifecycle, a bounded owner-readable activity log,
 * and the final report. Screenshots and the model transcript are never
 * persisted; the live frame stays in the serving process's memory.
 */
export const computerTasks = pgTable(
  "wireline_computer_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    goal: text("goal").notNull(),
    startUrl: text("start_url"),
    status: text("status").$type<ComputerTaskStatus>().notNull().default("running"),
    summary: text("summary"),
    question: text("question"),
    sources: jsonb("sources")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    events: jsonb("events")
      .$type<ComputerTaskEvent[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    errorCode: text("error_code"),
    model: text("model"),
    turnCount: integer("turn_count").notNull().default(0),
    actionCount: integer("action_count").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    usageReceipt: jsonb("usage_receipt").$type<{
      periodKey: string;
      quantity: number;
      occurredAt: string;
    }>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userAgentCreatedIdx: index("idx_computer_tasks_user_agent_created").on(
      table.userId,
      table.agentId,
      table.createdAt,
    ),
    // One active task per account, enforced across every API process.
    oneActivePerUser: uniqueIndex("uq_computer_tasks_one_active_per_user")
      .on(table.userId)
      .where(sql`${table.status} IN ('running', 'needs_input')`),
    statusCheck: check(
      "wireline_computer_tasks_status_check",
      sql`${table.status} IN ('running', 'needs_input', 'completed', 'blocked', 'failed', 'stopped', 'interrupted')`,
    ),
    goalLengthCheck: check(
      "wireline_computer_tasks_goal_length_check",
      sql`char_length(${table.goal}) BETWEEN 1 AND 2000`,
    ),
  }),
).enableRLS();
