/**
 * The owner's Playbook: the words a Bot must use, the situations it handles
 * a specific way, what it must always or never say, and what it must check
 * with the owner before it agrees to or sends.
 *
 * Knowledge and rules are background the Bot paraphrases. The Playbook is the
 * owner's direct control over wording, so every instruction builder (phone,
 * browser rehearsal, text rehearsal, SMS and email replies) appends the same
 * block from here. Pure and dependency-free so the client editor, the API and
 * every runtime share one definition.
 */

export const PLAYBOOK_MOMENTS = [
  { id: "closing", label: "Ending the call", promptLabel: "When ending the conversation" },
  {
    id: "transfer",
    label: "Before a transfer",
    promptLabel: "Right before transferring the caller to a person",
  },
  { id: "message", label: "Taking a message", promptLabel: "When taking a message" },
  {
    id: "hold",
    label: "Checking something",
    promptLabel: "When asking the caller to wait while you check something",
  },
  {
    id: "voicemail",
    label: "Leaving a voicemail",
    promptLabel: "When leaving a voicemail on an outbound call",
  },
] as const;

export type PlaybookMomentId = (typeof PLAYBOOK_MOMENTS)[number]["id"];

export const PLAYBOOK_NEXT_STEPS = [
  { id: "continue", label: "Keep helping", prompt: "" },
  { id: "take_message", label: "Take a message", prompt: "Then take a message." },
  {
    id: "transfer",
    label: "Offer a transfer",
    prompt: "Then offer to transfer them to a person, if a transfer is available.",
  },
  { id: "book", label: "Offer to book", prompt: "Then offer to book an appointment." },
  {
    id: "text_link",
    label: "Offer to text details",
    prompt: "Then offer to text them the details.",
  },
  { id: "end_call", label: "End politely", prompt: "Then politely end the conversation." },
] as const;

export type PlaybookNextStep = (typeof PLAYBOOK_NEXT_STEPS)[number]["id"];

export type PlaybookSituation = {
  id: string;
  /** What triggers it, in the owner's words ("the caller wants to cancel"). */
  when: string;
  /** What the Bot says. */
  say: string;
  /** Word for word, or the gist in the Bot's own words. */
  exact: boolean;
  then: PlaybookNextStep;
};

export type AgentPlaybook = {
  version: 1;
  exactLines: Partial<Record<PlaybookMomentId, string>>;
  situations: PlaybookSituation[];
  alwaysMention: string[];
  neverSay: string[];
  /**
   * "Check with me first when…", in the owner's words. A Bot on Auto decides
   * for itself when its owner would want a say; these are the cases the owner
   * has already decided. The Bot will not agree to them on a call, and the
   * message review holds a text or email they apply to.
   */
  checkFirst: string[];
};

export const PLAYBOOK_LIMITS = {
  lineChars: 400,
  whenChars: 160,
  itemChars: 200,
  situations: 20,
  alwaysMention: 10,
  neverSay: 15,
  checkFirst: 10,
} as const;

export const EMPTY_PLAYBOOK: AgentPlaybook = {
  version: 1,
  exactLines: {},
  situations: [],
  alwaysMention: [],
  neverSay: [],
  checkFirst: [],
};

const MOMENT_IDS = new Set<string>(PLAYBOOK_MOMENTS.map((moment) => moment.id));
const NEXT_STEP_IDS = new Set<string>(PLAYBOOK_NEXT_STEPS.map((step) => step.id));

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Collapse whitespace; the prompt is line-oriented. */
function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function cleanList(value: unknown, maxItems: number, maxChars: number): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  const items: string[] = [];
  for (const entry of value) {
    const text = clean(entry);
    if (!text) continue;
    if (text.length > maxChars) return null;
    if (!items.includes(text)) items.push(text);
  }
  return items.length > maxItems ? null : items;
}

/** Validate an owner's save. Returns the normalized Playbook or a plain-language error. */
export function parseAgentPlaybook(
  input: unknown,
): { ok: true; value: AgentPlaybook } | { ok: false; error: string } {
  const root = asRecord(input);

  const exactLines: AgentPlaybook["exactLines"] = {};
  for (const [moment, value] of Object.entries(asRecord(root.exactLines))) {
    if (!MOMENT_IDS.has(moment))
      return { ok: false, error: "That exact-line moment isn't supported." };
    const text = clean(value);
    if (!text) continue;
    if (text.length > PLAYBOOK_LIMITS.lineChars)
      return {
        ok: false,
        error: `Keep each exact line under ${PLAYBOOK_LIMITS.lineChars} characters.`,
      };
    exactLines[moment as PlaybookMomentId] = text;
  }

  const rawSituations = root.situations ?? [];
  if (!Array.isArray(rawSituations)) return { ok: false, error: "Situations must be a list." };
  const situations: PlaybookSituation[] = [];
  for (const entry of rawSituations) {
    const situation = asRecord(entry);
    const when = clean(situation.when);
    const say = clean(situation.say);
    if (!when && !say) continue;
    if (!when) return { ok: false, error: 'Each situation needs a "When".' };
    if (!say) return { ok: false, error: `Add what your Bot says when ${when}.` };
    if (when.length > PLAYBOOK_LIMITS.whenChars)
      return { ok: false, error: `Keep "When" under ${PLAYBOOK_LIMITS.whenChars} characters.` };
    if (say.length > PLAYBOOK_LIMITS.lineChars)
      return {
        ok: false,
        error: `Keep each response under ${PLAYBOOK_LIMITS.lineChars} characters.`,
      };
    const then =
      typeof situation.then === "string" && NEXT_STEP_IDS.has(situation.then)
        ? (situation.then as PlaybookNextStep)
        : "continue";
    const id = clean(situation.id).slice(0, 40) || `s${situations.length + 1}`;
    situations.push({ id, when, say, exact: situation.exact === true, then });
  }
  if (situations.length > PLAYBOOK_LIMITS.situations)
    return { ok: false, error: `A Playbook holds up to ${PLAYBOOK_LIMITS.situations} situations.` };

  const alwaysMention = cleanList(
    root.alwaysMention,
    PLAYBOOK_LIMITS.alwaysMention,
    PLAYBOOK_LIMITS.itemChars,
  );
  if (!alwaysMention)
    return {
      ok: false,
      error: `"Always mention" holds up to ${PLAYBOOK_LIMITS.alwaysMention} items of up to ${PLAYBOOK_LIMITS.itemChars} characters each.`,
    };
  const neverSay = cleanList(root.neverSay, PLAYBOOK_LIMITS.neverSay, PLAYBOOK_LIMITS.itemChars);
  if (!neverSay)
    return {
      ok: false,
      error: `"Never say" holds up to ${PLAYBOOK_LIMITS.neverSay} items of up to ${PLAYBOOK_LIMITS.itemChars} characters each.`,
    };

  const checkFirst = cleanList(
    root.checkFirst,
    PLAYBOOK_LIMITS.checkFirst,
    PLAYBOOK_LIMITS.itemChars,
  );
  if (!checkFirst)
    return {
      ok: false,
      error: `"Check with me first" holds up to ${PLAYBOOK_LIMITS.checkFirst} items of up to ${PLAYBOOK_LIMITS.itemChars} characters each.`,
    };

  return {
    ok: true,
    value: { version: 1, exactLines, situations, alwaysMention, neverSay, checkFirst },
  };
}

/** Tolerant read of the stored column; anything malformed reads as empty. */
export function readStoredAgentPlaybook(value: unknown): AgentPlaybook {
  const parsed = parseAgentPlaybook(value);
  return parsed.ok ? parsed.value : EMPTY_PLAYBOOK;
}

export function isPlaybookEmpty(playbook: AgentPlaybook): boolean {
  return (
    Object.keys(playbook.exactLines).length === 0 &&
    playbook.situations.length === 0 &&
    playbook.alwaysMention.length === 0 &&
    playbook.neverSay.length === 0 &&
    playbook.checkFirst.length === 0
  );
}

/** The owner's "check with me first" rules, for the review that holds a message. */
export function playbookCheckFirstRules(stored: unknown): string[] {
  return readStoredAgentPlaybook(stored).checkFirst;
}

const quote = (text: string) => `"${text.replace(/"/g, "'")}"`;

/**
 * The instruction block every runtime appends. The owner's wording wins over
 * general rules and knowledge, but never over safety: an exact line cannot be
 * used to claim an action that no tool confirmed.
 */
export function playbookPromptBlock(stored: unknown): string {
  const playbook = readStoredAgentPlaybook(stored);
  if (isPlaybookEmpty(playbook)) return "";
  const lines = [
    "PLAYBOOK (set by the account holder; follow it over general rules and knowledge when they differ):",
  ];

  const moments = PLAYBOOK_MOMENTS.filter((moment) => playbook.exactLines[moment.id]);
  if (moments.length) {
    lines.push(
      "Exact lines. When the moment comes, say these word for word, with nothing changed:",
    );
    for (const moment of moments) {
      lines.push(`- ${moment.promptLabel}: ${quote(playbook.exactLines[moment.id]!)}`);
    }
  }

  if (playbook.situations.length) {
    lines.push("Situations:");
    for (const situation of playbook.situations) {
      const step = PLAYBOOK_NEXT_STEPS.find((candidate) => candidate.id === situation.then);
      const delivery = situation.exact ? "say word for word" : "cover this in your own words";
      lines.push(
        `- When ${situation.when}: ${delivery}: ${quote(situation.say)}${step?.prompt ? ` ${step.prompt}` : ""}`,
      );
    }
  }

  if (playbook.alwaysMention.length) {
    lines.push("Always mention, when it fits the conversation:");
    for (const item of playbook.alwaysMention) lines.push(`- ${item}`);
  }

  if (playbook.neverSay.length) {
    lines.push("Never say, claim, or promise:");
    for (const item of playbook.neverSay) lines.push(`- ${item}`);
  }

  if (playbook.checkFirst.length) {
    lines.push(
      "Check with the account holder first. When any of these applies, do not agree to it, promise it, or send it yourself. Say you will check and get back to them, and take the details:",
    );
    for (const item of playbook.checkFirst) lines.push(`- ${item}`);
  }

  lines.push(
    "Safety still applies: never use a Playbook line to claim a booking, transfer, message, or other action happened unless a tool confirmed it, and keep every required disclosure.",
  );
  return lines.join("\n");
}
