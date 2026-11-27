/**
 * A Bot's name. Every Bot starts as Bo, the one name callers come to know as
 * a BotBound Bot, until its owner gives it another. Shared by the create
 * dialog, the API and Set Up, so each means the same thing by "default".
 */
export const DEFAULT_BOT_NAME = "Bo";
export const BOT_NAME_MAX_CHARS = 100;

const key = (value: string | null | undefined) =>
  (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/** A name as it is stored: one line, single spaces, within the limit. */
export function cleanBotName(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, BOT_NAME_MAX_CHARS).trim()
    : "";
}

/**
 * The name a new Bot starts with when its owner gives none. A workspace's
 * first Bot is Bo. One that already has a Bo names the next for its role, and
 * numbers a role it already has, so two Bots in one list are never told apart
 * only by their picture.
 */
export function startingBotName(
  existingNames: readonly (string | null | undefined)[],
  roleName: string,
): string {
  const taken = new Set(existingNames.map(key));
  if (!taken.has(key(DEFAULT_BOT_NAME))) return DEFAULT_BOT_NAME;
  const role = cleanBotName(roleName) || "My Bot";
  if (!taken.has(key(role))) return role;
  for (let number = 2; ; number += 1) {
    const suffix = ` ${number}`;
    const candidate = `${role.slice(0, BOT_NAME_MAX_CHARS - suffix.length).trim()}${suffix}`;
    if (!taken.has(key(candidate))) return candidate;
  }
}

/** The greeting a Bot is created with. It carries the Bot's name. */
export function generatedBotGreeting(name: string | null | undefined): string {
  return `Hi, this is ${(name ?? "").replace(/\s+/g, " ").trim() || "your Bot"}. How can I help?`;
}

/** Whether a greeting is the one a Bot of this name was created with, which no owner wrote. */
export function isGeneratedBotGreeting(
  greeting: string | null | undefined,
  name: string | null | undefined,
): boolean {
  return key(greeting) === key(generatedBotGreeting(name));
}

/**
 * Names BotBound itself gives a Bot: Bo, the role names Bots were given before
 * Bo, and the "<role> Bot" names the create dialog uses. A greeting in the
 * created shape with one of them in it was written by BotBound, not an owner,
 * even when the Bot has since been renamed some other way (a rename in chat
 * before this release left such greetings behind).
 */
function isBotBoundGivenName(name: string): boolean {
  const named = key(name);
  return (
    ["bo", "front desk", "my bot", "personal assistant", "your bot"].includes(named) ||
    /^[a-z][a-z &'-]{0,40} bot$/.test(named)
  );
}

/**
 * Whether no owner chose this greeting: it is the one created for this Bot's
 * name, or for a name BotBound gave it. Such a greeting follows a rename, and
 * "Your Greeting As Written" does not speak it.
 */
export function isUnchosenBotGreeting(
  greeting: string | null | undefined,
  name: string | null | undefined,
): boolean {
  if (isGeneratedBotGreeting(greeting, name)) return true;
  const match = /^hi, this is (.+)\. how can i help\?$/.exec(key(greeting));
  return Boolean(match && isBotBoundGivenName(match[1]));
}

export interface BotNameState {
  name: string | null;
  firstMessage: string | null;
  /** The saved "Opening greeting:" rule without its prefix. A call speaks it before `firstMessage`. */
  greetingRule?: string | null;
}

/**
 * What a rename changes: the name, and the greeting only while the one a
 * caller would hear is still the one the Bot was created with. A greeting the
 * owner wrote is theirs, even when it mentions the old name.
 */
export function planBotRename(
  current: BotNameState,
  name: string,
): { name: string; greeting?: string } {
  const spoken = current.greetingRule?.trim() || current.firstMessage?.trim() || "";
  const follows = !spoken || isUnchosenBotGreeting(spoken, current.name);
  return follows ? { name, greeting: generatedBotGreeting(name) } : { name };
}
