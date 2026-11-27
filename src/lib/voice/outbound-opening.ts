/**
 * The first spoken line of a call the Bot places. It is one breath: who is
 * calling and for which business, then only the notices this call needs, then
 * a question that hands the turn to the person who answered.
 *
 * What stays is what a rule asks for. 47 CFR 64.1200(b)(1) asks for the
 * responsible business at the start of an artificial-voice call, so the
 * business is named in the first sentence. A marketing call's spoken opt-out
 * follows the identification directly, as (b)(3) requires, and is the one
 * kind of call that also gives its number here: (b)(2) and (d)(4) ask for a
 * number the person can call, and a marketing call may end before a goodbye.
 * Every other call gives the number in its goodbye or when asked, which the
 * call's instructions require. The recording notice is spoken only when the
 * call is recorded.
 *
 * "An AI assistant" is said once, inside the introduction, not as a sentence
 * of its own. Several states require it on calls a business places, and it
 * matches the declarative patterns in `detectAiDisclosure`, so the compliance
 * ledger can prove it from the transcript.
 */
export const OUTBOUND_OPT_OUT_NOTICE = "If you'd rather we not call again, just say stop calling.";
export const OUTBOUND_RECORDING_NOTICE = "This call may be recorded.";
export const OUTBOUND_OPENING_QUESTION = "Is now a good time?";

function clean(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

/** Ends a sentence without doubling the period of a name such as "Acme Inc.". */
export function endSentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
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
  const withBusiness = business ? ` with ${business}` : "";
  const identity = endSentence(
    agentNameAddsToBusiness(agent, business)
      ? `${hello} this is ${agent}, an AI assistant${withBusiness}`
      : `${hello} I'm an AI assistant${withBusiness}`,
  );
  const callback = clean(input.callbackNumberSpoken);
  return [
    identity,
    input.telemarketing ? OUTBOUND_OPT_OUT_NOTICE : "",
    input.recordingEnabled ? OUTBOUND_RECORDING_NOTICE : "",
    input.telemarketing && callback ? `You can reach us at ${callback}.` : "",
    OUTBOUND_OPENING_QUESTION,
  ]
    .filter(Boolean)
    .join(" ");
}
