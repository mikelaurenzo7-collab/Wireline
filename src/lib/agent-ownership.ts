import { drizzle } from "./server-context";
import * as schema from "../db/schema";
import { and, eq } from "drizzle-orm";

/** Returns the agent id when owned by userId, otherwise null. */
export async function findOwnedAgentId(agentId: string, userId: string): Promise<string | null> {
  const [row] = await drizzle
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId)))
    .limit(1);
  return row?.id ?? null;
}
