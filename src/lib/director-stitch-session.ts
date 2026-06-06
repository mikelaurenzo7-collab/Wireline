/**
 * Persisted Stitch project/screen handles for edit + variant follow-ups.
 */
import { desc, eq } from "drizzle-orm";
import { drizzle } from "./server-context";
import * as schema from "../db/schema";
import { parseDirectorMetadata } from "./director-message-metadata";
import type { StitchSession } from "./director-stitch-intent";

export async function loadLatestStitchSession(userId: string): Promise<StitchSession | null> {
  const rows = await drizzle
    .select({
      metadata: schema.directorConversationMessages.metadata,
    })
    .from(schema.directorConversationMessages)
    .where(eq(schema.directorConversationMessages.userId, userId))
    .orderBy(desc(schema.directorConversationMessages.id))
    .limit(40);

  for (const row of rows) {
    const meta = parseDirectorMetadata(row.metadata);
    const session = meta.stitchSession;
    if (session?.projectId && session?.screenId) {
      return session;
    }
  }
  return null;
}
