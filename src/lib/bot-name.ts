/**
 * A Bot's name. Every Bot starts as Bo, the one name callers come to know as
 * a BotBound Bot, until its owner gives it another. Shared by the create
 * dialog, the API and Set Up, so each means the same thing by "default".
 */
export const DEFAULT_BOT_NAME = "Bo";
export const BOT_NAME_MAX_CHARS = 100;

const sameName = (left: string | null | undefined, right: string) =>
  (left ?? "").trim().toLowerCase() === right.toLowerCase();

/**
 * The name a new Bot starts with. A workspace's first Bot is Bo. One that
 * already has a Bo names the next for its role, so two Bots in one list are
 * never told apart only by their picture.
 */
export function startingBotName(
  existingNames: readonly (string | null | undefined)[],
  roleName: string,
): string {
  return existingNames.some((name) => sameName(name, DEFAULT_BOT_NAME))
    ? roleName
    : DEFAULT_BOT_NAME;
}

/** The greeting a Bot is created with. It carries the Bot's name. */
export function generatedBotGreeting(name: string): string {
  return `Hi, this is ${name}. How can I help?`;
}

/**
 * What a rename changes: the name, and the greeting only while it is still
 * the one the Bot was created with. A greeting the owner wrote is theirs.
 */
export function renamedBotFields(
  current: { name: string | null; firstMessage: string | null },
  name: string,
): { name: string; firstMessage?: string } {
  const greeting = current.firstMessage?.trim() ?? "";
  const generated = !greeting || greeting === generatedBotGreeting(current.name?.trim() ?? "");
  return generated ? { name, firstMessage: generatedBotGreeting(name) } : { name };
}
