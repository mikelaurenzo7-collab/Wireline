/** Shared Director reply heuristics (safe for client + server). */

export const DIRECTOR_STUB_REPLY =
  "I'm here — tell me what you want to move forward and I'll orchestrate it.";

const SUBSTANTIVE_REPLY_MIN_CHARS = 160;

export function isDirectorStubReply(content: string): boolean {
  return content.trim() === DIRECTOR_STUB_REPLY;
}

export function isSubstantiveDirectorReply(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed || isDirectorStubReply(trimmed)) return false;
  if (trimmed === "(empty)" || trimmed === "(empty reply)") return false;
  return trimmed.length >= SUBSTANTIVE_REPLY_MIN_CHARS;
}

export function isSubstantiveDirectorPayload(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  const reply = data.reply;
  return typeof reply === "string" && isSubstantiveDirectorReply(reply);
}

/** Drop stub director rows that follow a substantive reply for the same operator turn. */
export function operatorTurnHasDirectorReply(
  messages: {
    role: string;
    content: string;
    modelLabel?: string;
    previews?: unknown[];
  }[],
  operatorContent: string,
  options?: { requireStitch?: boolean },
): boolean {
  const needle = operatorContent.trim();
  const idx = messages.findIndex((m) => m.role === "operator" && m.content.trim() === needle);
  if (idx < 0) return false;

  for (const m of messages.slice(idx + 1)) {
    if (m.role === "operator") break;
    if (m.role !== "director") continue;

    if (options?.requireStitch) {
      const previews = Array.isArray(m.previews) ? m.previews : [];
      const isStitch =
        m.modelLabel === "Google Stitch" ||
        previews.some(
          (p) =>
            !!p &&
            typeof p === "object" &&
            (p as { kind?: string }).kind === "stitch",
        );
      if (isStitch && isSubstantiveDirectorReply(m.content)) return true;
      continue;
    }

    if (isSubstantiveDirectorReply(m.content)) return true;
  }
  return false;
}

export function collapseDirectorThreadDuplicates<T extends { role: string; content: string }>(
  messagesAsc: T[],
): T[] {
  let lastOperatorIdx = -1;
  return messagesAsc.filter((msg, i) => {
    if (msg.role === "operator") {
      lastOperatorIdx = i;
      return true;
    }
    if (msg.role !== "director" || !isDirectorStubReply(msg.content)) return true;
    if (lastOperatorIdx < 0) return true;
    for (let j = i - 1; j > lastOperatorIdx; j--) {
      const prior = messagesAsc[j];
      if (prior.role === "director" && isSubstantiveDirectorReply(prior.content)) {
        return false;
      }
    }
    return true;
  });
}
