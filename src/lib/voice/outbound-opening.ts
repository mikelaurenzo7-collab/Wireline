/**
 * The first spoken line of an outbound call. It says this is an AI assistant
 * and who it is calling for, naming the business once, then the notices the
 * call requires, the callback number, and a question that hands the turn to
 * the person who answered.
 *
 * 47 CFR 64.1200(b) asks for the responsible business at the start of an
 * artificial-voice call and its number during or after it. Both stay in this
 * line, which the phone connection speaks word for word. A marketing call's
 * opt-out notice follows the identification directly, as (b)(3) requires.
 *
 * The phrasing matches the declarative patterns in `detectAiDisclosure`, so
 * the compliance ledger can prove delivery from the transcript.
 */
export const OUTBOUND_OPT_OUT_NOTICE =
  "You can say stop calling at any time to be placed on the do not call list.";
export const OUTBOUND_RECORDING_NOTICE = "This call may be recorded for quality and compliance.";
export const OUTBOUND_OPENING_QUESTION = "Is now a good time?";

function clean(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

/**
 * Whether saying the Bot's own name adds anything beside the business name.
 * A Bot named for its owner ("Michael" at "Michael Laurenzo") or for the
 * business would otherwise say the same name twice in one breath.
 */
export function agentNameAddsToBusiness(
  agentName: string | null | undefined,
  businessName: string | null | undefined,
): boolean {
  const agent = clean(agentName).toLowerCase();
  if (!agent) return false;
  const business = clean(businessName).toLowerCase();
  if (!business) return true;
  if (agent === business) return false;
  const words = business.split(/[^\p{L}\p{N}']+/u).filter(Boolean);
  return !agent.split(/\s+/).every((part) => words.includes(part));
}

export function composeOutboundOpening(input: {
  agentName: string;
  businessName?: string | null;
  contactName?: string | null;
  /** The number already written out for speech, or empty when none is configured. */
  callbackNumberSpoken?: string | null;
  recordingEnabled: boolean;
  /** Marketing calls announce the spoken opt-out right after the identification. */
  telemarketing: boolean;
}): string {
  const agent = clean(input.agentName);
  const business = clean(input.businessName);
  const contact = clean(input.contactName);
  const hello = contact ? `Hi ${contact},` : "Hi,";
  const callingFor = business ? ` calling for ${business}` : "";
  const identity = agentNameAddsToBusiness(agent, business)
    ? `${hello} this is ${agent}. I'm an AI assistant${callingFor}.`
    : `${hello} I'm an AI assistant${callingFor}.`;
  const callback = clean(input.callbackNumberSpoken);
  return [
    identity,
    input.telemarketing ? OUTBOUND_OPT_OUT_NOTICE : "",
    input.recordingEnabled ? OUTBOUND_RECORDING_NOTICE : "",
    callback ? `You can call us back at ${callback}.` : "",
    OUTBOUND_OPENING_QUESTION,
  ]
    .filter(Boolean)
    .join(" ");
}
