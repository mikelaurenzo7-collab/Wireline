import { and, eq } from "drizzle-orm";

import * as schema from "../db/schema";
import { drizzle, log } from "./server-context";

export type ClientSenderIdentity = { botName: string | null; businessName: string | null };

const NONE: ClientSenderIdentity = { botName: null, businessName: null };

function cleanName(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, 80) : null;
}

/**
 * The names a customer sees on a message the Bot sends: the business (brand
 * name first, as email rendering uses), then the Bot. Runs in the caller's
 * tenant scope and filters by tenant explicitly. A lookup failure returns no
 * names, so review continues with neutral wording instead of failing the send.
 */
export async function resolveClientSenderIdentity(
  userId: string | null | undefined,
  agentId: string | null | undefined,
): Promise<ClientSenderIdentity> {
  if (!userId) return NONE;
  try {
    const [settings] = await drizzle
      .select({
        businessName: schema.settings.businessName,
        brandName: schema.settings.brandName,
      })
      .from(schema.settings)
      .where(eq(schema.settings.userId, userId))
      .limit(1);
    const [agent] = agentId
      ? await drizzle
          .select({ name: schema.agents.name })
          .from(schema.agents)
          .where(and(eq(schema.agents.userId, userId), eq(schema.agents.id, agentId)))
          .limit(1)
      : [];
    return {
      businessName: cleanName(settings?.brandName) ?? cleanName(settings?.businessName),
      botName: cleanName(agent?.name),
    };
  } catch (error) {
    log.warn("Sender names for message review could not be loaded", {
      errorClass: error instanceof Error ? error.name : typeof error,
    });
    return NONE;
  }
}
