import { and, eq, like, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import type { drizzle as serverDrizzle } from "./server-context";

/**
 * What callers asked that a Bot had nothing saved to answer. The owner sees
 * these in Needs You under Gaps, each with a link to add the answer. The tab
 * and its reader existed for months, and nothing ever wrote to them.
 */
export const KNOWLEDGE_GAP_PREFIX = "[KNOWLEDGE GAP]";
export const KNOWLEDGE_GAP_SOURCE = "knowledge_gap";
const MAX_QUESTION_CHARS = 200;
/** A Bot that misses constantly must not fill the table. The owner reads the newest 30. */
const MAX_OPEN_GAPS_PER_BOT = 60;

type GapDb = Pick<typeof serverDrizzle, "select" | "insert">;

/** The stored text for a question, or null when it is too short to answer. */
export function knowledgeGapLesson(question: unknown): string | null {
  const clean = String(question ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUESTION_CHARS)
    .trim();
  // A word or two is not a question an owner can answer.
  return clean.length < 8 ? null : `${KNOWLEDGE_GAP_PREFIX} ${clean}`;
}

/**
 * Saves one unanswered question for the owner. The same question from the
 * same Bot is kept once, and one the owner dismissed stays dismissed. The row
 * waits as `pending`: it is a caller's words and must never be read as
 * something the Bot was taught. Never throws: a search result must not depend
 * on this.
 */
export async function recordKnowledgeGap(
  db: GapDb,
  input: { userId: string; agentId: string; question: unknown; callId?: string | null },
): Promise<boolean> {
  const lesson = knowledgeGapLesson(input.question);
  if (!input.userId || !input.agentId || !lesson) return false;
  try {
    const [open] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.agentLessons)
      .where(
        and(
          eq(schema.agentLessons.userId, input.userId),
          eq(schema.agentLessons.agentId, input.agentId),
          like(schema.agentLessons.lesson, `${KNOWLEDGE_GAP_PREFIX}%`),
          sql`${schema.agentLessons.lessonStatus} is distinct from 'rejected'`,
        ),
      );
    if (Number(open?.count ?? 0) >= MAX_OPEN_GAPS_PER_BOT) return false;
    await db
      .insert(schema.agentLessons)
      .values({
        userId: input.userId,
        agentId: input.agentId,
        lesson,
        source: KNOWLEDGE_GAP_SOURCE,
        sourceCallId: input.callId || null,
        lessonStatus: "pending",
      })
      .onConflictDoNothing({ target: [schema.agentLessons.agentId, schema.agentLessons.lesson] });
    return true;
  } catch {
    return false;
  }
}
