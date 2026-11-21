/* eslint-disable @typescript-eslint/no-explicit-any -- Live tool args are vendor-defined JSON. */
/**
 * Device-action tool handlers — BotBound personal-assistant tools. When the
 * Account Holder talks to their agent and asks it to navigate, set a reminder, or
 * play music, the agent calls one of these; we dispatch the action to the
 * Account Holder's phone via push (the app deep-links Maps / writes EventKit / opens
 * music). Report push-service acceptance separately from device execution:
 * neither delivery to the phone nor completion of its action is acknowledged.
 *
 * Opt-in per agent (not in any default role set), so a customer-facing agent
 * never gains control of someone's phone.
 */
import { notifyDeviceAction, type DeviceAction } from "../mobile-push";
import { assertLiveExternalActionAllowed } from "../account-environment-policy";
import type { ToolCallContext, ToolCallResult } from "../agent-tool-types";

const LIVE_DEVICE_TOOLS = new Set(["navigate_to", "add_reminder", "play_music"]);

async function requestDeviceAction(userId: string, action: DeviceAction): Promise<string> {
  const unconfirmed =
    "Phone notification delivery was not confirmed. Check your phone before retrying; do not say the device action completed.";
  try {
    const receipt = await notifyDeviceAction(userId, action);
    if (!(receipt.sent > 0)) return unconfirmed;
    return `Phone notification accepted for delivery: ${action.title}. The phone action is not confirmed. Ask the owner to open the notification and verify it before retrying.`;
  } catch {
    return unconfirmed;
  }
}

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

  if (LIVE_DEVICE_TOOLS.has(fn)) {
    if (!agent?.user_id) return unavailable();
    try {
      await assertLiveExternalActionAllowed(agent.user_id, `vapi_${fn}`);
    } catch {
      return {
        toolCallId,
        result:
          "That phone action is disabled in this workspace. Do not claim it ran; continue without it.",
      };
    }
  }

  if (fn === "navigate_to") {
    const destination = String(args?.destination || "").trim();
    if (!destination) {
      return { toolCallId, result: "Where would you like to go?" };
    }
    if (!agent?.user_id) return unavailable();
    const result = await requestDeviceAction(agent.user_id, {
      action: "navigate",
      args: { destination },
      title: `Directions to ${destination}`,
    });
    return { toolCallId, result };
  }

  if (fn === "add_reminder") {
    const title = String(args?.title || "").trim();
    if (!title) return { toolCallId, result: "What should I remind you about?" };
    if (!agent?.user_id) return unavailable();
    const datetime = args?.datetime ? String(args.datetime) : undefined;
    const result = await requestDeviceAction(agent.user_id, {
      action: "reminder",
      args: { title, datetime },
      title: `Reminder: ${title}`,
    });
    return { toolCallId, result };
  }

  if (fn === "play_music") {
    const query = String(args?.query || "").trim();
    if (!query) return { toolCallId, result: "What would you like to hear?" };
    if (!agent?.user_id) return unavailable();
    const result = await requestDeviceAction(agent.user_id, {
      action: "play_music",
      args: { query },
      title: `Play ${query}`,
    });
    return { toolCallId, result };
  }

  return null;
}
