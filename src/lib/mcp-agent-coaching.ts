import { and, desc, eq, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { AppError } from "./api-error";
import { drizzle } from "./server-context";

const FACT_MAX = 4000;
const RULE_MAX = 2000;
const BRIEF_ITEM_LIMIT = 20;
const BRIEF_CONTENT_MAX = 400;

export type AgentCoachingKind = "fact" | "rule";

export type AgentCoachingBrief = {
  agent_id: string;
  agent_name: string;
  role: string;
  channel: string;
  on_phone_network: boolean;
  training_fact_count: number;
  operating_rule_count: number;
  training_facts: Array<{ id: string; content: string }>;
  operating_rules: Array<{ id: string; content: string; priority: number }>;
  next_step: string;
};

function clip(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

export async function assertOwnedAgent(
  userId: string,
  agentId: string,
): Promise<{ id: string; name: string; role: string | null; channel: string | null }> {
  const [agent] = await drizzle
    .select({
      id: schema.agents.id,
      name: schema.agents.name,
      role: schema.agents.role,
      channel: schema.agents.channel,
    })
    .from(schema.agents)
    .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId)))
    .limit(1);
  if (!agent) throw AppError.notFound("BotBound Bot not found.");
  return agent;
}

export async function addAgentTrainingItem(input: {
  userId: string;
  agentId: string;
  kind: AgentCoachingKind;
  content: string;
}): Promise<{
  agent_id: string;
  kind: AgentCoachingKind;
  item_id: string;
  content: string;
}> {
  const content = input.content.trim();
  const max = input.kind === "fact" ? FACT_MAX : RULE_MAX;
  if (!content) {
    throw AppError.fromHttpStatus(400, "Provide the training fact or operating rule to save.");
  }
  if (content.length > max) {
    throw AppError.fromHttpStatus(400, `Keep that ${input.kind} under ${max} characters.`);
  }
  const agent = await assertOwnedAgent(input.userId, input.agentId);
  if (input.kind === "fact") {
    const [row] = await drizzle
      .insert(schema.knowledge)
      .values({ userId: input.userId, agentId: agent.id, content })
      .returning({ id: schema.knowledge.id });
    return {
      agent_id: agent.id,
      kind: "fact",
      item_id: String(row.id),
      content,
    };
  }
  const [row] = await drizzle
    .insert(schema.directives)
    .values({ userId: input.userId, agentId: agent.id, content, priority: 5 })
    .returning({ id: schema.directives.id });
  return {
    agent_id: agent.id,
    kind: "rule",
    item_id: String(row.id),
    content,
  };
}

export async function getAgentCoachingBrief(
  userId: string,
  agentId: string,
): Promise<AgentCoachingBrief> {
  const agent = await assertOwnedAgent(userId, agentId);
  const [line] = await drizzle
    .select({ id: schema.phoneNumbers.id })
    .from(schema.phoneNumbers)
    .where(and(eq(schema.phoneNumbers.agentId, agent.id), eq(schema.phoneNumbers.userId, userId)))
    .limit(1);
  const [factCountRow] = await drizzle
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.knowledge)
    .where(and(eq(schema.knowledge.agentId, agent.id), eq(schema.knowledge.userId, userId)));
  const [ruleCountRow] = await drizzle
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.directives)
    .where(and(eq(schema.directives.agentId, agent.id), eq(schema.directives.userId, userId)));
  const facts = await drizzle
    .select({ id: schema.knowledge.id, content: schema.knowledge.content })
    .from(schema.knowledge)
    .where(and(eq(schema.knowledge.agentId, agent.id), eq(schema.knowledge.userId, userId)))
    .orderBy(desc(schema.knowledge.createdAt))
    .limit(BRIEF_ITEM_LIMIT);
  const rules = await drizzle
    .select({
      id: schema.directives.id,
      content: schema.directives.content,
      priority: schema.directives.priority,
    })
    .from(schema.directives)
    .where(and(eq(schema.directives.agentId, agent.id), eq(schema.directives.userId, userId)))
    .orderBy(desc(schema.directives.priority))
    .limit(BRIEF_ITEM_LIMIT);
  const onPhoneNetwork = Boolean(line);
  const factCount = Number(factCountRow?.count ?? 0);
  const ruleCount = Number(ruleCountRow?.count ?? 0);
  return {
    agent_id: agent.id,
    agent_name: agent.name,
    role: agent.role || "assistant",
    channel: agent.channel || "voice",
    on_phone_network: onPhoneNetwork,
    training_fact_count: factCount,
    operating_rule_count: ruleCount,
    training_facts: facts.map((fact) => ({
      id: String(fact.id),
      content: clip(fact.content, BRIEF_CONTENT_MAX),
    })),
    operating_rules: rules.map((rule) => ({
      id: String(rule.id),
      content: clip(rule.content, BRIEF_CONTENT_MAX),
      priority: rule.priority ?? 5,
    })),
    next_step: onPhoneNetwork
      ? "This Bot is on the phone network. Coach it here, then operate live work in its BotBound Workspace."
      : factCount + ruleCount === 0
        ? "Add Training facts and operating rules, then open BotBound Connections to attach a number and launch."
        : "Training is landing in BotBound. Open Connections to attach a number when you are ready to launch.",
  };
}
