import { complianceFirstMessagePrefix, formatCallbackNumberForSpeech } from "../agent-runtime";
import { callDeliverySelection, type CallDelivery } from "../phone-voices";
import { composeInboundOpening } from "./inbound-opening";
import { composeOutboundOpening } from "./outbound-opening";

/**
 * A pronunciation changes what is spoken, not what is written, so the
 * transcript and the disclosure record would still read correctly after one
 * altered the line every call must speak: that this is an AI assistant, who
 * it calls for, the recording and opt-out notices, the callback number.
 *
 * Speech engines match a listed word only where it stands as a whole word. So
 * an entry that shares no word with those lines can never match inside them,
 * and can only ever change a name or the owner's own text. Any entry that
 * does share a word is refused when saved and left out when a call starts.
 */
const WORDS = /[\p{L}\p{N}]+/gu;
const wordsOf = (text: string): string[] => text.toLowerCase().match(WORDS) ?? [];

// Stand-ins for the names an owner supplies, which are theirs to pronounce.
const STAND_IN = { agent: "qzagentname", business: "qzbusinessname", contact: "qzcontactname" };

let requiredWords: Set<string> | null = null;

/** Every word of every scripted opening, read from the functions that compose them. */
function requiredOpeningWords(): Set<string> {
  if (requiredWords) return requiredWords;
  const names = { agentName: STAND_IN.agent, businessName: STAND_IN.business };
  const lines = [
    composeOutboundOpening({
      ...names,
      contactName: STAND_IN.contact,
      // All ten digits, so each word a callback number can be read with is covered.
      callbackNumberSpoken: formatCallbackNumberForSpeech("0123456789"),
      recordingEnabled: true,
      telemarketing: true,
    }),
    composeInboundOpening({ ...names, greeting: "", recordingEnabled: true }),
    composeInboundOpening({ ...names, greeting: "", recordingEnabled: true, leg: "resume" }),
    complianceFirstMessagePrefix("tcpa", STAND_IN.business, {
      outboundAiCall: true,
      recordingEnabled: true,
      telemarketing: true,
    }),
  ];
  const standIns = new Set(Object.values(STAND_IN));
  requiredWords = new Set(lines.flatMap(wordsOf).filter((word) => !standIns.has(word)));
  return requiredWords;
}

/** Whether saying this differently could change a line every call must speak as written. */
export function pronunciationTouchesRequiredWording(word: string): boolean {
  const required = requiredOpeningWords();
  return wordsOf(word).some((part) => required.has(part));
}

export const REQUIRED_WORDING_REFUSAL =
  "That includes a word from the required call opening, which is always spoken as written. Add only the word that is said wrong.";

/**
 * A Bot's call delivery as calls, rehearsals and samples use it: what is
 * stored, without any pronunciation that could touch the required wording.
 * Saving already refuses those, so this only matters for a stored value that
 * predates a change to the opening or was written some other way.
 */
export function callDeliveryFor(variables: unknown): CallDelivery {
  const delivery = callDeliverySelection(variables);
  if (!delivery.pronunciations.length) return delivery;
  return {
    ...delivery,
    pronunciations: delivery.pronunciations.filter(
      (entry) => !pronunciationTouchesRequiredWording(entry.word),
    ),
  };
}
