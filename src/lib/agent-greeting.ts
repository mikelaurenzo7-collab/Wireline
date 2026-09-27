/** One greeting across saved setup, private rehearsals, and phone calls. */
export const OPENING_GREETING_PREFIX = "Opening greeting:";

export function resolveAgentGreeting(
  agent: { name?: string | null; firstMessage?: string | null },
  directives: ReadonlyArray<{ content?: string | null }> = [],
): string {
  const savedDirective = directives
    .find((directive) => directive.content?.startsWith(OPENING_GREETING_PREFIX))
    ?.content?.slice(OPENING_GREETING_PREFIX.length)
    .trim();
  return (
    savedDirective ||
    agent.firstMessage?.trim() ||
    `Hi, this is ${agent.name?.trim() || "your Bot"}. How can I help?`
  );
}
