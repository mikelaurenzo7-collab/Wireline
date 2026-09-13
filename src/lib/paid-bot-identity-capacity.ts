/**
 * Choose a stable, bounded identity roster before any mailbox/carrier work.
 * Callers supply Bots in creation order, with the id as a deterministic tie-break.
 * Existing assigned lines take priority; detached lines can be reused. Extra
 * lines on one Bot or orphan assignments still consume the account's slots.
 */
export function selectPaidBotIdentityAgents(
  agents: ReadonlyArray<{ id: string }>,
  lines: ReadonlyArray<{ agentId: string | null }>,
  phoneSlots: number,
): string[] {
  if (!Number.isFinite(phoneSlots) || phoneSlots < 1) return [];
  const capacity = Math.floor(phoneSlots);
  const assigned = new Set(lines.map((line) => line.agentId).filter(Boolean));
  const existing = agents.filter((agent) => assigned.has(agent.id)).slice(0, capacity);
  const reusable = lines.filter((line) => line.agentId === null).length;
  const available = Math.max(0, capacity - lines.length) + reusable;
  const newCount = Math.min(capacity - existing.length, available);
  const next = agents.filter((agent) => !assigned.has(agent.id)).slice(0, newCount);
  return [...existing, ...next].map((agent) => agent.id);
}
