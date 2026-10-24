import { and, eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { drizzle, tenantStore } from "../server-context";
import { resolveRuntimeCustomVoice } from "./live-voice-service";
import {
  CLONED_MEDIA_PATH,
  clonedMediaOrigin,
  elevenLabsCallsConfigured,
} from "./cloned-media-config";

const xml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/** Routing is resolved server-side. Neither voice ids nor tenant ids go to the carrier. */
export async function clonedCallTwiml(input: {
  userId: string;
  agentId: string;
  token: string;
  direction: "inbound" | "outbound";
}): Promise<string | null> {
  if (!elevenLabsCallsConfigured()) return null;
  const voice = await tenantStore.run(input.userId, async () => {
    const [agent] = await drizzle
      .select({ variables: schema.agents.businessVariables })
      .from(schema.agents)
      .where(and(eq(schema.agents.id, input.agentId), eq(schema.agents.userId, input.userId)))
      .limit(1);
    return agent ? resolveRuntimeCustomVoice(input.userId, agent.variables) : null;
  });
  if (voice?.engine !== "elevenlabs") return null;
  const url = new URL(CLONED_MEDIA_PATH, clonedMediaOrigin());
  url.protocol = "wss:";
  return (
    '<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="' +
    xml(url.toString()) +
    '">' +
    '<Parameter name="token" value="' +
    xml(input.token) +
    '"/><Parameter name="direction" value="' +
    input.direction +
    '"/></Stream></Connect><Hangup/></Response>'
  );
}
