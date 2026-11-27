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

/** What the owner ruled out: the never-say list and the check-first list. */
function playbookLimitLines(playbook: AgentPlaybook): string[] {
  const lines: string[] = [];
  if (playbook.neverSay.length) {
    lines.push("Never say, claim, or promise:");
    for (const item of playbook.neverSay) lines.push(`- ${item}`);
  }
  if (playbook.checkFirst.length) {
    lines.push(
      "Check with the account holder first. When any of these applies, do not agree to it, promise it, or send it yourself. Say you will check with the team, take the details, and save a follow-up for the team:",
    );
    for (const item of playbook.checkFirst) lines.push(`- ${item}`);
  }
  return lines;
}

/**
 * The instruction block every runtime appends. The owner's wording wins over
 * general rules and knowledge, but never over safety: an exact line cannot be
 * used to claim an action that no tool confirmed.
 *
 * A voice prompt prints the two limit lists in their own block (see
 * `ownerLimitsBlock`) and asks for this one without them.
 */
export function playbookPromptBlock(
  stored: unknown,
  options: { withoutLimits?: boolean } = {},
): string {
  const playbook = readStoredAgentPlaybook(stored);
  if (isPlaybookEmpty(playbook)) return "";
  const header =
    "PLAYBOOK (set by the account holder; follow it over general rules and knowledge when they differ):";
  const lines = [header];

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

  if (!options.withoutLimits) lines.push(...playbookLimitLines(playbook));
  // A Playbook that holds only limits has nothing left to say here.
  if (lines.length === 1) return "";

  lines.push(
    "Safety still applies: never use a Playbook line to claim a booking, transfer, message, or other action happened unless a tool confirmed it, and keep every required disclosure.",
  );
  return lines.join("\n");
}

/** Marks the owner's limits in a voice prompt, so a prompt cut to fit keeps them. */
export const OWNER_LIMITS_HEADING = "## LIMITS SET BY THE ACCOUNT HOLDER";
/** What Set Up accepts for a list of topics or triggers. A row saved another way is bounded the same. */
const MAX_LIMIT_LIST_ITEMS = 24;
const MAX_LIMIT_ITEM_CHARS = 120;

function limitList(heading: string, values: readonly string[]): string[] {
  const items = values
    .map((value) =>
      String(value ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_LIMIT_ITEM_CHARS),
    )
    .filter(Boolean)
    .slice(0, MAX_LIMIT_LIST_ITEMS);
  return items.length ? [heading, ...items.map((item) => `- ${item}`)] : [];
}

/**
 * What the owner ruled out, in one block: the compliance mode, topics not to
 * discuss, what to hand to a person, and the Playbook's never-say and
 * check-first lists. A voice prompt that is too long is cut from the end of
 * the owner's content, and these were the first things lost. The block sits
 * with the fixed safety text, which the cut keeps.
 *
 * One item to a line, the most binding first. When even this block has to
 * give way it is cut from its end by whole lines, so what goes first is the
 * check-first list, which the message review also enforces on its own.
 */
export function ownerLimitsBlock(input: {
  /**
   * The conduct rules for the owner's compliance mode (`complianceRulesText`).
   * A Bot used to be told the mode's name and nothing to do.
   */
  complianceRules?: string | null;
  disallowedTopics: readonly string[];
  escalationKeywords: readonly string[];
  playbook: unknown;
  /** A handoff number or address is saved, so a person can take over. */
  humanRoute?: boolean;
}): string {
  // The rules lead the block: when it has to give way, it is cut from its end.
  const rules = String(input.complianceRules ?? "")
    .split("\n")
    .map((line) => line.replace(/^#+\s*/, "").trimEnd())
    .filter(Boolean);
  const lines = [
    ...rules,
    ...limitList("Do not discuss:", input.disallowedTopics),
    ...limitList("Escalate or take a message when the caller raises:", input.escalationKeywords),
    ...playbookLimitLines(readStoredAgentPlaybook(input.playbook)),
    input.humanRoute
      ? "A human escalation route exists; offer a callback or handoff only when policy permits."
      : "",
  ].filter(Boolean);
  if (!lines.length) return "";
  return [
    OWNER_LIMITS_HEADING,
    "These hold for the whole conversation, whatever else is asked.",
    ...lines,
  ].join("\n");
}
