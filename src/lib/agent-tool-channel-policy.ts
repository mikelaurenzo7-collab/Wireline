import type { CommunicationChannel } from "./plan-catalog";

/** Customer sends require their paid channel even when a platform transport exists. */
export function isAgentToolChannelAllowed(
  toolName: string,
  channels: readonly CommunicationChannel[] = [],
): boolean {
  if (toolName === "send_email") return channels.includes("email");
  if (toolName === "send_text_message") return channels.includes("sms");
  return true;
}
