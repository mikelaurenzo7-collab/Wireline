import { and, eq } from "drizzle-orm";

import * as schema from "../db/schema";
import {
  WIRELINE_CONTACT_AGENTS,
  WIRELINE_DEMO_AGENTS,
  type ContactAgent,
} from "../data/contact-agents";
import { drizzle } from "./server-context";
import {
  buildShowcaseSystemPrompt,
  showcaseToolNamesForKind,
  type ShowcaseKind,
} from "./showcase-assistant";

export const FOUNDER_SHOWCASE_RUNTIME_VERSION = "openai-realtime-v1-2026-08-29" as const;

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function founderShowcaseAgentId(userId: string, agentName: string): string {
  return `founder-showcase:${userId}:${slug(agentName)}`;
}

function managedRows(): Array<{ agent: ContactAgent; kind: ShowcaseKind }> {
  return [
    ...WIRELINE_CONTACT_AGENTS.map((agent) => ({ agent, kind: "cs" as const })),
    ...WIRELINE_DEMO_AGENTS.map((agent) => ({ agent, kind: "demo" as const })),
  ];
}

/** Persist the founder's public bot identities in BotBound; OpenAI is stateless. */
export async function ensureFounderShowcaseBots(userId: string): Promise<void> {
  for (const { agent, kind } of managedRows()) {
    const id = founderShowcaseAgentId(userId, agent.name);
    const patch = {
      name: agent.name,
      role: agent.role,
      archetype: kind === "cs" ? "Customer Service" : "Showcase Demo",
      firstMessage: agent.firstMessage,
      systemPromptOverride: buildShowcaseSystemPrompt(agent, kind),
      personalityVibe: agent.defaultVibe,
      voiceId: agent.openaiVoiceId,
      voiceProvider: "openai",
      phoneVoiceId: agent.openaiVoiceId,
      phoneVoiceProvider: "openai",
      enabledTools: showcaseToolNamesForKind(kind),
      isBusinessAgent: true,
      businessVariables: {
        founder_showcase: true,
        founder_showcase_kind: kind,
        founder_showcase_runtime_version: FOUNDER_SHOWCASE_RUNTIME_VERSION,
        public_phone_number: agent.tel,
      },
      updatedAt: new Date(),
    };

    await drizzle
      .insert(schema.agents)
      .values({ id, userId, ...patch })
      .onConflictDoNothing({ target: schema.agents.id });
    await drizzle
      .update(schema.agents)
      .set(patch)
      .where(and(eq(schema.agents.id, id), eq(schema.agents.userId, userId)));
  }
}
