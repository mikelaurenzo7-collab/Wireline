import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { dedupeDirectorArtifacts } from "./director-artifact-dedupe";
import { drizzle } from "./server-context";
import * as schema from "../db/schema";

export { dedupeDirectorArtifacts } from "./director-artifact-dedupe";
export {
  buildSignedDownloadUrl,
  buildSignedPreviewUrl,
  createSignedDownloadToken,
  verifySignedDownloadToken,
} from "./director-artifact-signing";

const DIRECTOR_THREAD_KEY = "director";

export interface DirectorStoredArtifact {
  id: string;
  userId: string;
  threadKey: string;
  toolName: string;
  artifactType: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

export async function storeDirectorArtifact(input: {
  userId: string;
  toolName: string;
  artifactType: string;
  name: string;
  mimeType: string;
  data: Buffer;
  metadata?: Record<string, unknown>;
  messageId?: string;
  threadKey?: string;
}): Promise<DirectorStoredArtifact> {
  const threadKey = input.threadKey || DIRECTOR_THREAD_KEY;
  const objectKey = `director/${input.userId}/${Date.now()}-${randomUUID()}`;
  const base64Data = input.data.toString("base64");

  await drizzle.insert(schema.directorArtifactObjects).values({
    objectKey,
    userId: input.userId,
    mimeType: input.mimeType,
    base64Data,
    sizeBytes: input.data.byteLength,
  });

  const [artifact] = await drizzle
    .insert(schema.directorArtifacts)
    .values({
      userId: input.userId,
      threadKey,
      messageId: input.messageId ? BigInt(input.messageId) : null,
      toolName: input.toolName,
      artifactType: input.artifactType,
      name: input.name,
      objectKey,
      metadata: input.metadata ?? {},
    })
    .returning();

  return {
    id: String(artifact.id),
    userId: artifact.userId,
    threadKey: artifact.threadKey,
    toolName: artifact.toolName,
    artifactType: artifact.artifactType,
    name: artifact.name,
    mimeType: input.mimeType,
    sizeBytes: input.data.byteLength,
    createdAt: artifact.createdAt,
    metadata: (artifact.metadata as Record<string, unknown>) ?? {},
  };
}

export async function clearDirectorArtifacts(userId: string): Promise<number> {
  const rows = await drizzle
    .select({ objectKey: schema.directorArtifacts.objectKey })
    .from(schema.directorArtifacts)
    .where(eq(schema.directorArtifacts.userId, userId));

  if (rows.length === 0) return 0;

  await drizzle.delete(schema.directorArtifacts).where(eq(schema.directorArtifacts.userId, userId));

  for (const { objectKey } of rows) {
    await drizzle
      .delete(schema.directorArtifactObjects)
      .where(eq(schema.directorArtifactObjects.objectKey, objectKey));
  }

  return rows.length;
}

export async function listDirectorArtifacts(
  userId: string,
  limit = 100,
): Promise<DirectorStoredArtifact[]> {
  const rows = await drizzle
    .select({
      id: schema.directorArtifacts.id,
      userId: schema.directorArtifacts.userId,
      threadKey: schema.directorArtifacts.threadKey,
      toolName: schema.directorArtifacts.toolName,
      artifactType: schema.directorArtifacts.artifactType,
      name: schema.directorArtifacts.name,
      createdAt: schema.directorArtifacts.createdAt,
      metadata: schema.directorArtifacts.metadata,
      mimeType: schema.directorArtifactObjects.mimeType,
      sizeBytes: schema.directorArtifactObjects.sizeBytes,
    })
    .from(schema.directorArtifacts)
    .innerJoin(
      schema.directorArtifactObjects,
      eq(schema.directorArtifacts.objectKey, schema.directorArtifactObjects.objectKey),
    )
    .where(eq(schema.directorArtifacts.userId, userId))
    .orderBy(desc(schema.directorArtifacts.createdAt))
    .limit(limit);

  const mapped = rows.map((row) => ({
    id: String(row.id),
    userId: row.userId,
    threadKey: row.threadKey,
    toolName: row.toolName,
    artifactType: row.artifactType,
    name: row.name,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  }));

  return dedupeDirectorArtifacts(mapped).slice(0, limit);
}

export async function loadDirectorArtifactData(input: {
  artifactId: string;
  userId: string;
}): Promise<{ artifact: DirectorStoredArtifact; data: Buffer } | null> {
  const rows = await drizzle
    .select({
      id: schema.directorArtifacts.id,
      userId: schema.directorArtifacts.userId,
      threadKey: schema.directorArtifacts.threadKey,
      toolName: schema.directorArtifacts.toolName,
      artifactType: schema.directorArtifacts.artifactType,
      name: schema.directorArtifacts.name,
      createdAt: schema.directorArtifacts.createdAt,
      metadata: schema.directorArtifacts.metadata,
      mimeType: schema.directorArtifactObjects.mimeType,
      sizeBytes: schema.directorArtifactObjects.sizeBytes,
      base64Data: schema.directorArtifactObjects.base64Data,
    })
    .from(schema.directorArtifacts)
    .innerJoin(
      schema.directorArtifactObjects,
      eq(schema.directorArtifacts.objectKey, schema.directorArtifactObjects.objectKey),
    )
    .where(
      and(
        eq(schema.directorArtifacts.id, BigInt(input.artifactId)),
        eq(schema.directorArtifacts.userId, input.userId),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    artifact: {
      id: String(row.id),
      userId: row.userId,
      threadKey: row.threadKey,
      toolName: row.toolName,
      artifactType: row.artifactType,
      name: row.name,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      createdAt: row.createdAt,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
    },
    data: Buffer.from(row.base64Data, "base64"),
  };
}
