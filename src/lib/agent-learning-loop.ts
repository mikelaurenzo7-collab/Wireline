/**
 * Lesson review and learning summaries.
 */
import { and, desc, eq, gte } from "drizzle-orm";
import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";

export const PRODUCTIVE_OUTCOMES = new Set(["booked", "qualified", "followup", "info"]);

export type LearningDigest = {
  agentId: string;
  lessonsPending: number;
  lessonsApproved: number;
  topLessons: string[];
  outcomeLiftPct: number | null;
  objectionsTrending: string[];
};

export async function approveLesson(lessonId: bigint, userId: string): Promise<boolean> {
  const updated = await drizzle
    .update(schema.agentLessons)
    .set({ lessonStatus: "approved", updatedAt: new Date() })
    .where(and(eq(schema.agentLessons.id, lessonId), eq(schema.agentLessons.userId, userId)))
    .returning({ id: schema.agentLessons.id });
  return updated.length > 0;
}

export async function rejectLesson(lessonId: bigint, userId: string): Promise<boolean> {
  const updated = await drizzle
    .update(schema.agentLessons)
    .set({ lessonStatus: "rejected", updatedAt: new Date() })
    .where(and(eq(schema.agentLessons.id, lessonId), eq(schema.agentLessons.userId, userId)))
    .returning({ id: schema.agentLessons.id });
  return updated.length > 0;
}

export async function getLearningDigest(userId: string, agentId: string): Promise<LearningDigest> {
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60_000);

  const [lessons, callRows] = await Promise.all([
    drizzle
      .select({
        lesson: schema.agentLessons.lesson,
        status: schema.agentLessons.lessonStatus,
      })
      .from(schema.agentLessons)
      .where(and(eq(schema.agentLessons.userId, userId), eq(schema.agentLessons.agentId, agentId)))
      .orderBy(desc(schema.agentLessons.createdAt))
      .limit(50),
    drizzle
      .select({
        outcomeTag: schema.callLogs.outcomeTag,
      })
      .from(schema.callLogs)
      .where(
        and(
          eq(schema.callLogs.userId, userId),
          eq(schema.callLogs.agentId, agentId),
          gte(schema.callLogs.createdAt, since30d),
          eq(schema.callLogs.demo, false),
        ),
      ),
  ]);

  const pending = lessons.filter((l) => l.status === "pending").length;
  const approved = lessons.filter((l) => l.status === "approved").length;
  const topLessons = lessons
    .filter((l) => l.status !== "rejected")
    .slice(0, 3)
    .map((l) => l.lesson);

  // Call volume cannot establish a lesson's effect on outcomes. Preserve the
  // response field without inventing a lift until that effect is measured.
  const outcomeLiftPct = null;

  const objectionsTrending: string[] = [];
  const objectionCount = callRows.filter((r) => r.outcomeTag === "other").length;
  if (objectionCount >= 3) objectionsTrending.push("Unresolved objections trending");

  return {
    agentId,
    lessonsPending: pending,
    lessonsApproved: approved,
    topLessons,
    outcomeLiftPct,
    objectionsTrending,
  };
}

export async function runWeeklyLearningDigest(userId: string): Promise<void> {
  try {
    const agents = await drizzle
      .select({ id: schema.agents.id })
      .from(schema.agents)
      .where(eq(schema.agents.userId, userId))
      .limit(10);

    for (const agent of agents) {
      const digest = await getLearningDigest(userId, agent.id);
      if (digest.topLessons.length === 0) continue;
      log.info("weekly learning digest", {
        userId,
        agentId: agent.id,
        lessons: digest.topLessons.length,
        lift: digest.outcomeLiftPct,
      });
    }
  } catch (err: unknown) {
    log.warn("runWeeklyLearningDigest failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
