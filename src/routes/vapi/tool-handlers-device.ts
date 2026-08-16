/* eslint-disable @typescript-eslint/no-explicit-any -- Vapi tool args are vendor-defined JSON. */
/**
 * Device-action tool handlers — Wireline's personal-assistant tools. When the
 * Account Holder talks to their agent and asks it to navigate, set a reminder, or
 * play music, the agent calls one of these; we dispatch the action to the
 * Account Holder's phone via push (the app deep-links Maps / writes EventKit / opens
 * music) and speak a short confirmation. The phone can only LAUNCH those apps,
 * not control them — so we confirm we've "sent it to your phone".
 *
 * Opt-in per agent (not in any default role set), so a customer-facing agent
 * never gains control of someone's phone.
 */
import { notifyDeviceAction } from "../../lib/mobile-push";
import type { ToolCallContext, ToolCallResult } from "./types";

export async function handleDeviceToolCall(
  fn: string,
  args: any,
  context: ToolCallContext,
): Promise<ToolCallResult | null> {
  const { agent, toolCallId } = context;

  const unavailable = (): ToolCallResult => ({
    toolCallId,
    result: "I can't reach your phone right now, try again in a moment.",
  });

  if (fn === "navigate_to") {
    const destination = String(args?.destination || "").trim();
    if (!destination) {
      return { toolCallId, result: "Where would you like to go?" };
    }
    if (!agent?.user_id) return unavailable();
    void notifyDeviceAction(agent.user_id, {
      action: "navigate",
      args: { destination },
      title: `Directions to ${destination}`,
    });
    return { toolCallId, result: `Sending directions to ${destination} to your phone now.` };
  }

  if (fn === "add_reminder") {
    const title = String(args?.title || "").trim();
    if (!title) return { toolCallId, result: "What should I remind you about?" };
    if (!agent?.user_id) return unavailable();
    const datetime = args?.datetime ? String(args.datetime) : undefined;
    void notifyDeviceAction(agent.user_id, {
      action: "reminder",
      args: { title, datetime },
      title: `Reminder: ${title}`,
    });
    return { toolCallId, result: `Done, I'll add a reminder to ${title} on your phone.` };
  }

  if (fn === "play_music") {
    const query = String(args?.query || "").trim();
    if (!query) return { toolCallId, result: "What would you like to hear?" };
    if (!agent?.user_id) return unavailable();
    void notifyDeviceAction(agent.user_id, {
      action: "play_music",
      args: { query },
      title: `Playing ${query}`,
    });
    return { toolCallId, result: `Starting ${query} on your phone.` };
  }

  return null;
}
