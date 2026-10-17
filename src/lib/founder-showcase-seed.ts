import * as schema from "../db/schema";
import { and, eq } from "drizzle-orm";
import {
  WIRELINE_CONTACT_AGENTS,
  WIRELINE_DEMO_AGENTS,
  type ContactAgent,
} from "../data/contact-agents";
import { drizzle } from "./server-context";
import {
  buildShowcaseSystemPrompt,
  isLegacyFounderShowcaseToolSelection,
  showcaseToolNamesForKind,
  type ShowcaseKind,
} from "./showcase-assistant";

export const FOUNDER_SHOWCASE_RUNTIME_VERSION = "openai-realtime-v1-2026-08-29" as const;

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
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

/**
 * Persist creation defaults for the founder's public Bot identities in BotBound.
 *
 * Existing rows keep their saved voice, prompt, tone, tools, and training. The
 * one exception below replaces the exact old CS seed tool list with its safe
 * manual follow-up counterpart, leaving every customized list untouched.
 */
export async function ensureFounderShowcaseBots(userId: string): Promise<void> {
  for (const { agent, kind } of managedRows()) {
    const id = founderShowcaseAgentId(userId, agent.name);
    const creationDefaults = {
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
      },
      updatedAt: new Date(),
    };

    await drizzle
      .insert(schema.agents)
      .values({ id, userId, ...creationDefaults })
      .onConflictDoNothing({ target: schema.agents.id });

    if (kind !== "cs") continue;
    const [existing] = await drizzle
      .select({ enabledTools: schema.agents.enabledTools })
      .from(schema.agents)
      .where(and(eq(schema.agents.id, id), eq(schema.agents.userId, userId)))
      .limit(1);
    if (!existing || !isLegacyFounderShowcaseToolSelection(existing.enabledTools)) continue;
    await drizzle
      .update(schema.agents)
      .set({ enabledTools: showcaseToolNamesForKind("cs") })
      .where(
        and(
          eq(schema.agents.id, id),
          eq(schema.agents.userId, userId),
          eq(schema.agents.enabledTools, existing.enabledTools),
        ),
      );
  }
}
