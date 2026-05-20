import type { ContactAgent } from "./contact-agents";

/**
 * Browser-playable showcase template — extends ContactAgent with
 * the audio + display extras the /showcase page needs. A "showcase"
 * is auditioned in-browser (pre-roll MP3 + first-message script)
 * before the prospect ever picks up the phone.
 *
 * Lives in its own file (not contact-agents.ts) so parallel agents
 * editing the contact-agents catalog can't accidentally drop the
 * showcase exports during a rebase.
 */
export type ShowcaseAgent = ContactAgent & {
  /** Public path of a pre-recorded audio sample (jingle, intro). */
  preRollAudio?: string;
  /** Short hook sentence shown above the play button. */
  tagline: string;
  /** Voice display name shown on the card, e.g. "Bella — playful, melodic". */
  voiceLabel: string;
};

/**
 * SHOWCASE_AGENTS — playable templates surfaced on /showcase and
 * the landing-page hero. The marquee entry is the Singing
 * Receptionist: a pre-baked ElevenLabs Music jingle plays the
 * moment the prospect clicks "Hear her sing", then the agent's
 * first-message catches itself with a normal greeting.
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
    tint: "#FF7A59",
    defaultVibe: "playful",
    tagline:
      "She answers the phone singing. Then catches herself with a normal greeting. A taste of how playful Wireline agents can be.",
    voiceLabel: "Bella — playful, melodic",
    preRollAudio: "/sounds/wireline-jingle.mp3",
  },
];
