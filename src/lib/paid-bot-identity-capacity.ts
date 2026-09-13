/**
 * Choose a stable, bounded identity roster before any mailbox/carrier work.
 * Callers supply Bots in creation order, with the id as a deterministic tie-break.
 * Existing assigned lines take priority; detached lines can be reused. Extra
 * lines on one Bot or orphan assignments still consume the account's slots.
 */
export function selectPaidBotIdentityAgents(
  agents: ReadonlyArray<{ id: string; businessVariables?: unknown }>,
  lines: ReadonlyArray<{ agentId: string | null }>,
  phoneSlots: number,
): string[] {
  if (!Number.isFinite(phoneSlots) || phoneSlots < 1) return [];
  const capacity = Math.floor(phoneSlots);
  const assigned = new Set(lines.map((line) => line.agentId).filter(Boolean));
  const existing = agents.filter((agent) => assigned.has(agent.id)).slice(0, capacity);
  const reusable = lines.filter((line) => line.agentId === null).length;
  const available = Math.max(0, capacity - (lines.length - reusable));
  const newCount = Math.min(capacity - existing.length, available);
  const next = agents
    .filter((agent) => {
      if (assigned.has(agent.id)) return false;
      // The shared draft service persists this profile for MCP/connected-client
      // drafts. Its existing live boundary is an owned phone line; account-wide
      // Stripe reconciliation must not silently cross that boundary. Web-created
      // Bots retain their existing paid-account automatic setup behavior.
      // Legacy connected drafts use the immutable 16-byte hex ID minted by
      // createAgentDraft. Keep that provenance when a business-profile edit
      // replaces customization metadata; ordinary web creation uses a UUID ID.
      if (/^agent-[0-9a-f]{32}$/i.test(agent.id)) return false;
      const variables = agent.businessVariables;
      if (variables && typeof variables === "object" && "customizationProfile" in variables) {
        return false;
      }
      return true;
    })
    .slice(0, newCount);
  return [...existing, ...next].map((agent) => agent.id);
}
