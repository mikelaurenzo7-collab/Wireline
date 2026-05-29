/**
 * Knowledge scoping — the single source of truth for "which knowledge rows
 * does an agent see at runtime".
 *
 * An agent reads its OWN knowledge plus the operator's company-wide shared
 * knowledge (rows with agent_id = NULL, same owner) — so a fact the Director
 * adds once flows to every agent on live calls. The owner is resolved via a
 * scalar (uncorrelated) subquery so callers don't need the userId in scope and
 * it evaluates once per query, not per row. Centralized here so the voice
 * runtime (assistant factory + outbound client) can't drift apart.
 */
import { and, eq, isNull, or, sql } from "drizzle-orm";
import * as schema from "../db/schema";

export function agentOrSharedKnowledge(agentId: string) {
  return or(
    eq(schema.knowledge.agentId, agentId),
    and(
      isNull(schema.knowledge.agentId),
      eq(schema.knowledge.userId, sql`(SELECT user_id FROM wireline_agents WHERE id = ${agentId})`),
    ),
  );
}
