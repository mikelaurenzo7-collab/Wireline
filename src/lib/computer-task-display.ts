/** A display label only. The stored task brief and execution input stay intact. */
export function shortComputerTaskLabel(goal: string, limit = 80): string {
  const text = goal.replace(/\s+/g, " ").trim();
  const characters = Array.from(text);
  if (characters.length <= limit) return text;
  const prefix = characters.slice(0, Math.max(1, limit - 1)).join("");
  const wordEnd = prefix.lastIndexOf(" ");
  return `${(wordEnd >= limit / 2 ? prefix.slice(0, wordEnd) : prefix).trimEnd()}…`;
}
