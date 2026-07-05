/**
 * Resilient agent roster reads — production DB may lag Drizzle schema migrations.
 * A missing column on wireline_agents must not 503 the whole agents API.
 */
import { desc, eq } from "drizzle-orm";
import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import { getErrorMessage } from "./server-utils";
import { isPostgresMissingColumn } from "./postgres-errors";

export interface AgentListRow {
  id: string;
  userId: string | null;
  name: string;
  role: string | null;
  channel: string | null;
  voiceId: string | null;
  firstMessage: string | null;
  enabledTools: unknown;
  createdAt: Date | null;
  isBusinessAgent: boolean;
}

const AGENT_LIST_FALLBACK_SELECT = {
  id: schema.agents.id,
  userId: schema.agents.userId,
  name: schema.agents.name,
  role: schema.agents.role,
  channel: schema.agents.channel,
  voiceId: schema.agents.voiceId,
  firstMessage: schema.agents.firstMessage,
  enabledTools: schema.agents.enabledTools,
  createdAt: schema.agents.createdAt,
  isBusinessAgent: schema.agents.isBusinessAgent,
};

export async function listAgentsForUser(userId: string, limit = 500): Promise<AgentListRow[]> {
  try {
    return await drizzle
      .select(AGENT_LIST_FALLBACK_SELECT)
      .from(schema.agents)
      .where(eq(schema.agents.userId, userId))
      .orderBy(desc(schema.agents.createdAt))
      .limit(limit);
  } catch (e) {
    if (!isPostgresMissingColumn(e)) throw e;
    log.warn("agents list: schema column missing, using fallback projection", {
      userId,
      error: getErrorMessage(e),
    });
    return drizzle
      .select(AGENT_LIST_FALLBACK_SELECT)
      .from(schema.agents)
      .where(eq(schema.agents.userId, userId))
      .orderBy(desc(schema.agents.createdAt))
      .limit(limit);
  }
}

export async function listAgentSummariesForUser(
  userId: string,
  limit = 500,
): Promise<
  Array<{ id: string; name: string | null; role: string | null; isBusinessAgent: boolean }>
> {
  const rows = await listAgentsForUser(userId, limit);
  return rows.map((r) => ({
    id: r.id,
    name: r.name ?? null,
    role: r.role ?? null,
    isBusinessAgent: r.isBusinessAgent,
  }));
}
