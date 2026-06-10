import type { ContactAgent } from "./contact-agents";

/**
 * Showcase template — extends ContactAgent with the display extras
 * the /showcase page needs. A "showcase" is a marquee demo persona
 * a prospect can call live to hear (tagline + first-message script)
 * before deploying their own.
 *
 * Lives in its own file (not contact-agents.ts) so parallel agents
 * editing the contact-agents catalog can't accidentally drop the
 * showcase exports during a rebase.
 */
export type ShowcaseAgent = ContactAgent & {
  /** Short hook sentence shown above the call button. */
  tagline: string;
  /** Voice display name shown on the card, e.g. "Bella — playful, melodic". */
  voiceLabel: string;
};

/**
 * SHOWCASE_AGENTS — playable templates surfaced on /showcase and
 * the landing-page hero. The marquee entry is the Singing
 * Receptionist: call her live and she answers with a sung jingle,
 * then catches herself with a normal greeting.
 */
export const SHOWCASE_AGENTS: ReadonlyArray<ShowcaseAgent> = [
  {
    name: "Mira",
    role: "Singing Receptionist (demo)",
    scope:
      "The fun demo. Answers with a 6-second sung jingle, then catches herself and switches to a normal professional greeting.",
    firstMessage:
      "Haha sorry about that! We like to have fun at Wireline sometimes — how can I help you?",
    handles: "demo, fun, jingle, singing, marquee",
    tel: "+12122970620",
    display: "(212) 297-0620",
    // Brand chromeGlow — playful but inside the purple/cream palette
    // (was #FF7A59 coral, the lone off-palette hue on the marketing site).
    tint: "#C77DFF",
    defaultVibe: "playful",
    tagline:
      "She answers the phone singing — then catches herself with a normal greeting. Give her a call to hear how playful a Wireline agent can be.",
    voiceLabel: "Bella — playful, melodic",
  },
];
