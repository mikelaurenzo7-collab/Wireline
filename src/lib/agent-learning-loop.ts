/**
 * Customer learning loop — compound moat from calls → lessons → outcomes.
 */
import { and, desc, eq, gte } from "drizzle-orm";
import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import { computeScorecard, type CallLogRow } from "./agent-scorecard";

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
        id: schema.callLogs.id,
        outcomeTag: schema.callLogs.outcomeTag,
        qaScore: schema.callLogs.qaScore,
        durationSeconds: schema.callLogs.durationSeconds,
        createdAt: schema.callLogs.createdAt,
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
  const approved = lessons.filter((l) => l.status !== "rejected").length;
  const topLessons = lessons
    .filter((l) => l.status !== "rejected")
    .slice(0, 3)
    .map((l) => l.lesson);

  const logs: CallLogRow[] = callRows.map((r) => ({
    id: String(r.id),
    durationSeconds: r.durationSeconds,
    createdAt: r.createdAt ?? undefined,
  }));

  const midpoint = Math.floor(logs.length / 2);
  const prior = logs.slice(0, midpoint);
  const current = logs.slice(midpoint);

  let outcomeLiftPct: number | null = null;
  if (current.length >= 3 && prior.length >= 3) {
    const priorScore = computeScorecard({
      focus: "general",
      windowDays: 15,
      now: Date.now(),
      currentLogs: prior,
      priorLogs: [],
      appointments: [],
      openFollowUps: [],
    });
    const currentScore = computeScorecard({
      focus: "general",
      windowDays: 15,
      now: Date.now(),
      currentLogs: current,
      priorLogs: prior,
      appointments: [],
      openFollowUps: [],
    });
    const priorVal = priorScore.primary.value;
    const curVal = currentScore.primary.value;
    if (priorVal > 0) {
      outcomeLiftPct = Math.round(((curVal - priorVal) / priorVal) * 100);
    }
  }

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
