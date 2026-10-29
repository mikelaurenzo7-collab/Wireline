import { and, asc, eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { drizzle } from "./server-context";
import { AppError } from "./api-error";
import { OWNER_MEMORY_LIMIT, OWNER_MEMORY_SOURCE, type OwnerMemory } from "./owner-memory";

const scope = (userId: string, agentId: string) =>
  and(
    eq(schema.agentLessons.userId, userId),
    eq(schema.agentLessons.agentId, agentId),
    eq(schema.agentLessons.source, OWNER_MEMORY_SOURCE),
  );

export async function loadOwnerMemories(userId: string, agentId: string): Promise<OwnerMemory[]> {
  const rows = await drizzle
    .select({ id: schema.agentLessons.id, content: schema.agentLessons.lesson })
    .from(schema.agentLessons)
    .where(scope(userId, agentId))
    .orderBy(asc(schema.agentLessons.id))
    .limit(OWNER_MEMORY_LIMIT);
  return rows.map((row) => ({ id: String(row.id), content: row.content }));
}

/** Lock the owned Bot to serialize admission and deletion. No model can write memory. */
export async function changeOwnerMemory(
  userId: string,
  agentId: string,
  change: { action: "add"; content: string } | { action: "delete"; id: bigint },
): Promise<void> {
  await drizzle.transaction(async (tx) => {
    const [agent] = await tx
      .select({ id: schema.agents.id })
      .from(schema.agents)
      .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId)))
      .limit(1)
      .for("update");
    if (!agent) throw AppError.notFound("Bot not found.");
    if (change.action === "delete") {
      await tx
        .delete(schema.agentLessons)
        .where(and(scope(userId, agentId), eq(schema.agentLessons.id, change.id)));
      return;
    }
    const rows = await tx
      .select({ content: schema.agentLessons.lesson })
      .from(schema.agentLessons)
      .where(scope(userId, agentId))
      .limit(OWNER_MEMORY_LIMIT);
    // Repeating an ambiguous save is idempotent, including when the roster is full.
    if (rows.some((row) => row.content === change.content)) return;
    if (rows.length >= OWNER_MEMORY_LIMIT)
      throw AppError.fromHttpStatus(
        409,
        "Remove a memory before adding another. Each Bot can remember 20 notes.",
      );
    const inserted = await tx
      .insert(schema.agentLessons)
      .values({
        userId,
        agentId,
        lesson: change.content,
        source: OWNER_MEMORY_SOURCE,
        lessonStatus: "approved",
      })
      .onConflictDoNothing({ target: [schema.agentLessons.agentId, schema.agentLessons.lesson] })
      .returning({ id: schema.agentLessons.id });
    if (!inserted.length)
      throw AppError.fromHttpStatus(
        409,
        "This text is already saved as a learning note. Use a different memory.",
      );
  });
}
