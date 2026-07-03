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

/** Returns agent workspace fields when owned by userId, otherwise null. */
export async function findOwnedAgentProfile(
  agentId: string,
  userId: string,
): Promise<{
  id: string;
  name: string;
  role: string | null;
  enabledTools: string[] | null;
} | null> {
  const [row] = await drizzle
    .select({
      id: schema.agents.id,
      name: schema.agents.name,
      role: schema.agents.role,
      enabledTools: schema.agents.enabledTools,
    })
    .from(schema.agents)
    .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId)))
    .limit(1);
  return (
    (row as
      | { id: string; name: string; role: string | null; enabledTools: string[] | null }
      | undefined) ?? null
  );
}
