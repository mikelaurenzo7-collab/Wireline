/**
 * Client-safe agent line-readiness labelling — no server/db imports.
 * Shared by OverviewPage and WorkspaceShell.
 *
 * `agent.phone_number` is populated by joining the roster against
 * `/api/phone-numbers`. When that lookup fails, AgentsContext leaves the field
 * null for every agent and raises `phoneLookupDegraded` — so "no number" and
 * "we could not ask" arrive as the same value. Reading it as a bare boolean
 * labelled a customer's working line "Needs setup" and pointed them at buying
 * another number, which is billed. Three states, not two.
 */

export type AgentLineStatus = "live" | "unavailable" | "needs-setup";

export function agentLineStatus(
  agent: { phone_number?: string | null } | undefined,
  phoneLookupDegraded: boolean,
): AgentLineStatus {
  if (agent?.phone_number) return "live";
  if (phoneLookupDegraded) return "unavailable";
  return "needs-setup";
}

const LINE_STATUS_LABELS: Record<AgentLineStatus, string> = {
  live: "Live",
  // Matches the vocabulary already used for the other degraded notices rather
  // than inventing a third way to say the same thing.
  unavailable: "Status unavailable",
  "needs-setup": "Needs setup",
};

export function agentReadinessLabel(
  agent: { phone_number?: string | null } | undefined,
  phoneLookupDegraded: boolean,
): string {
  return LINE_STATUS_LABELS[agentLineStatus(agent, phoneLookupDegraded)];
}
