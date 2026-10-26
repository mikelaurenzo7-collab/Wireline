import { and, eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { drizzle, tenantStore } from "../server-context";
import { customVoiceSelection, resolveRuntimeCustomVoice } from "./live-voice-service";
import { phoneCatalogService } from "./phone-catalog-service";
import {
  CLONED_MEDIA_PATH,
  clonedMediaOrigin,
  elevenLabsCallsConfigured,
  catalogCallsConfigured,
} from "./cloned-media-config";

const xml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/**
 * Which mouth the media bridge may use. An ElevenLabs user clone never rides
 * a Cartesia-only bridge: that bridge would speak a stock voice. An xAI clone
 * returns null so the call stays on native speech-to-speech.
 */
export function mediaBridgeEngine(input: {
  customEngine: string | null;
  catalogEngine: string | null;
  elevenLabsCalls: boolean;
  catalogCalls: boolean;
}): "elevenlabs" | "cartesia" | null {
  if (input.customEngine)
    return input.customEngine === "elevenlabs" && input.elevenLabsCalls ? "elevenlabs" : null;
  if (input.catalogEngine === "elevenlabs" && input.elevenLabsCalls) return "elevenlabs";
  if (input.catalogEngine === "cartesia" && input.catalogCalls) return "cartesia";
  return null;
}

/** Routing is resolved server-side. Neither voice ids nor tenant ids go to the carrier. */
export async function clonedCallTwiml(input: {
  userId: string;
  agentId: string;
  token: string;
  direction: "inbound" | "outbound";
}): Promise<string | null> {
  const choice = await tenantStore.run(input.userId, async () => {
    const [agent] = await drizzle
      .select({ variables: schema.agents.businessVariables })
      .from(schema.agents)
      .where(and(eq(schema.agents.id, input.agentId), eq(schema.agents.userId, input.userId)))
      .limit(1);
    if (!agent) return null;
    const custom = await resolveRuntimeCustomVoice(input.userId, agent.variables);
    // A saved clone owns the call. If it cannot be spoken, stay on the native
    // session instead of substituting a catalog voice.
    if (custom || customVoiceSelection(agent.variables))
      return { customEngine: custom?.engine ?? "unavailable", catalogEngine: null };
    const catalog = await phoneCatalogService.resolve(agent.variables);
    return { customEngine: null, catalogEngine: catalog?.provider ?? null };
  });
  if (!choice) return null;
  const engine = mediaBridgeEngine({
    ...choice,
    elevenLabsCalls: elevenLabsCallsConfigured(),
    catalogCalls: catalogCallsConfigured(),
  });
  if (!engine) return null;
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
