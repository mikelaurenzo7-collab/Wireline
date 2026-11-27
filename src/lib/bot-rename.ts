import { and, eq, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import {
  compileAgentRuntimeInstructions,
  isAgentCustomizationProfile,
  profileToBusinessVariables,
} from "./agent-customization";
import { OPENING_GREETING_PREFIX } from "./agent-greeting";
import { planBotRename } from "./bot-name";
import type { drizzle } from "./server-context";

type RenameTx = Pick<Parameters<Parameters<typeof drizzle.transaction>[0]>[0], "select" | "update">;

/**
 * Renames a Bot everywhere its name is kept, inside the caller's transaction.
 * Set Up's Name field and a rename approved in chat both come through here, so
 * neither can leave a caller hearing the old name.
 *
 * - The greeting follows while it is still the one the Bot was created with,
 *   in both places it is saved: the Bot itself, and the opening greeting rule
 *   that a call reads first.
 * - A Bot made in a connected app keeps a profile of itself and instructions
 *   compiled from it ("You are Bo, a receptionist for…"). Both take the new
 *   name, or the next edit from that app would put the old one back.
 *
 * Returns null when the owner has no such Bot.
 */
export async function renameBot(
  tx: RenameTx,
  input: { agentId: string; userId: string; name: string },
): Promise<{ name: string; greeting: string | null } | null> {
  const owned = and(eq(schema.agents.id, input.agentId), eq(schema.agents.userId, input.userId));
  const [current] = await tx
    .select({
      name: schema.agents.name,
      firstMessage: schema.agents.firstMessage,
      businessVariables: schema.agents.businessVariables,
      systemPromptOverride: schema.agents.systemPromptOverride,
    })
    .from(schema.agents)
    .where(owned)
    .limit(1)
    .for("update");
  if (!current) return null;

  const greetingRules = await tx
    .select({ id: schema.directives.id, content: schema.directives.content })
    .from(schema.directives)
    .where(
      and(
        eq(schema.directives.agentId, input.agentId),
        eq(schema.directives.userId, input.userId),
        sql`left(${schema.directives.content}, ${OPENING_GREETING_PREFIX.length}) = ${OPENING_GREETING_PREFIX}`,
      ),
    );
  const greetingRule =
    greetingRules
      .map((rule) => (rule.content ?? "").slice(OPENING_GREETING_PREFIX.length).trim())
      .find(Boolean) ?? null;

  const plan = planBotRename(
    { name: current.name, firstMessage: current.firstMessage, greetingRule },
    input.name,
  );
  const changes: Partial<typeof schema.agents.$inferInsert> = { name: plan.name };
  if (plan.greeting) changes.firstMessage = plan.greeting;

  const variables =
    current.businessVariables && typeof current.businessVariables === "object"
      ? (current.businessVariables as Record<string, unknown>)
      : null;
  const profile = variables?.customizationProfile;
  if (variables && isAgentCustomizationProfile(profile)) {
    const renamed = { ...profile, identity: { ...profile.identity, name: plan.name } };
    changes.businessVariables = {
      ...variables,
      ...profileToBusinessVariables(renamed),
      customizationProfile: renamed,
    };
    // Instructions the owner has since edited by hand are left as they wrote them.
    if (current.systemPromptOverride === compileAgentRuntimeInstructions(profile)) {
      changes.systemPromptOverride = compileAgentRuntimeInstructions(renamed);
    }
  }

  await tx.update(schema.agents).set(changes).where(owned);
  if (plan.greeting) {
    for (const rule of greetingRules) {
      await tx
        .update(schema.directives)
        .set({ content: `${OPENING_GREETING_PREFIX} ${plan.greeting}` })
        .where(and(eq(schema.directives.id, rule.id), eq(schema.directives.userId, input.userId)));
    }
  }
  return { name: plan.name, greeting: plan.greeting ?? null };
}
