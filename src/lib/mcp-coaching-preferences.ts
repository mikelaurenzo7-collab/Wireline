import { eq } from "drizzle-orm";

import * as schema from "../db/schema";
import { updatePreferenceEnvelope } from "./preference-envelope";
import { drizzle } from "./server-context";

export const MCP_COACHING_WRITES_KEY = "mcp_coaching_writes";

type PreferenceEnvelope = Record<string, unknown>;

function preferenceEnvelope(value: unknown): PreferenceEnvelope {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as PreferenceEnvelope) }
    : {};
}

export function mcpCoachingWritesEnabled(preferences: unknown): boolean {
  return preferenceEnvelope(preferences)[MCP_COACHING_WRITES_KEY] === true;
}

export async function readMcpCoachingWritesEnabled(userId: string): Promise<boolean> {
  const [row] = await drizzle
    .select({ preferences: schema.userPreferences.preferences })
    .from(schema.userPreferences)
    .where(eq(schema.userPreferences.userId, userId))
    .limit(1);
  return mcpCoachingWritesEnabled(row?.preferences);
}

export async function writeMcpCoachingWritesEnabled(
  userId: string,
  enabled: boolean,
): Promise<boolean> {
  // Shared envelope: read and write under the lock every preferences writer takes.
  return updatePreferenceEnvelope(userId, (envelope) => {
    envelope[MCP_COACHING_WRITES_KEY] = enabled;
    return enabled;
  });
}
