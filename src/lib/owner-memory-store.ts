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

type OwnerMemoryTx = Parameters<Parameters<typeof drizzle.transaction>[0]>[0];

/**
 * Add one owner memory inside a transaction that already holds this Bot's row
 * lock. Repeating a save is idempotent, including when the list is full.
 */
export async function addOwnerMemoryInTransaction(
  tx: OwnerMemoryTx,
  userId: string,
  agentId: string,
  content: string,
): Promise<void> {
  const rows = await tx
    .select({ content: schema.agentLessons.lesson })
    .from(schema.agentLessons)
    .where(scope(userId, agentId))
    .limit(OWNER_MEMORY_LIMIT);
  if (rows.some((row) => row.content === content)) return;
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
      lesson: content,
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
}

/** Serialize confirmed owner writes and deletion. Models cannot invent write authority. */
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
    await addOwnerMemoryInTransaction(tx, userId, agentId, change.content);
  });
}
