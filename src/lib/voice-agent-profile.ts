/**
 * Compose the only voicemail message BotBound is willing to leave.
 *
 * 47 CFR 64.1200(b) requires an artificial-voice answering-machine message to
 * identify the responsible business and provide a callback number.
 * Telemarketing voicemail also requires an automated toll-free opt-out path;
 * BotBound does not operate that path yet, so marketing voicemail fails closed.
 */
export function buildOutboundVoicemailMessage(
  agentName: string,
  businessName?: string | null,
  callbackNumberSpoken?: string | null,
  telemarketing = false,
): string {
  if (telemarketing) return "";
  const business = (businessName ?? "").trim();
  const identity =
    business && business.toLowerCase() !== agentName.trim().toLowerCase()
      ? `${agentName} with ${business}`
      : agentName;
  const callback = callbackNumberSpoken?.trim()
    ? `you can reach us at ${callbackNumberSpoken.trim()}`
    : "you can reach us back at this number";
  return `Hi, this is ${identity}. Sorry I missed you. I'll try you again soon, or ${callback}. Thank you!`;
}
