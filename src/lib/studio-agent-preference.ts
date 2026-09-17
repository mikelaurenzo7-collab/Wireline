export const KEY = "wireline:studio:last-agent-id";

function studioStorage(): Storage | null {
  if (typeof window !== "undefined") return window.localStorage;
  return (globalThis as { localStorage?: Storage }).localStorage ?? null;
}

export function readStudioLastAgentId(): string | null {
  try {
    return studioStorage()?.getItem(KEY) ?? null;
  } catch {
    return null;
  }
}

export function writeStudioLastAgentId(id: string): void {
  try {
    studioStorage()?.setItem(KEY, id);
  } catch {
    // Remembering a Bot is optional when storage is unavailable.
  }
}

export function clearStudioLastAgentId(): void {
  try {
    studioStorage()?.removeItem(KEY);
  } catch {
    // A cached preference must not prevent signing out.
  }
}

/**
 * Resolves the active Studio agent id from URL request, MRU, or roster order.
 * - requestedId when present in agentIds
 * - else MRU when still in roster
 * - else first agent id, or null when roster is empty
 */
export function resolveStudioActiveAgentId(
  requestedId: string | null,
  agentIds: string[],
): string | null {
  if (requestedId && agentIds.includes(requestedId)) {
    return requestedId;
  }

  const mru = readStudioLastAgentId();
  if (mru && agentIds.includes(mru)) {
    return mru;
  }

  return agentIds[0] ?? null;
}
