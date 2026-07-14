import { authFetch } from "./api";

export type AssistantSetupProgress = {
  agentId: string | null;
  agents: number;
  essentialsReady: boolean;
  knowledge: number;
  numbers: number;
  calls: number;
  browserTested: boolean;
  activated: boolean;
  approvedAction: boolean;
};

export const FLEET_SETUP_STEP_COUNT = 6;

export type ActivationStatusResponse = {
  ok?: boolean;
  activated?: boolean;
};

export async function fetchActivationStatus(): Promise<boolean> {
  try {
    const res = await authFetch("/api/activation/status");
    if (!res.ok) return false;
    const data = (await res.json()) as ActivationStatusResponse;
    return data.activated === true;
  } catch {
    return false;
  }
}

export async function fetchAssistantSetupProgress(): Promise<AssistantSetupProgress> {
  const agentRows = await authFetch("/api/agents")
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => (Array.isArray(data?.agents) ? data.agents : []))
    .catch(() => []);
  const primaryAgentId = typeof agentRows[0]?.id === "string" ? agentRows[0].id : "";

  const [numbers, calls, activation, essentials] = await Promise.all([
    authFetch("/api/phone-numbers")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) =>
        Array.isArray(d?.numbers)
          ? d.numbers.filter((number: { agent_id?: unknown }) => number.agent_id === primaryAgentId)
              .length
          : 0,
      )
      .catch(() => 0),
    primaryAgentId
      ? authFetch(`/api/calls?limit=1&agentId=${encodeURIComponent(primaryAgentId)}`)
          .then((r) => (r.ok ? r.json() : { calls: [] }))
          .then((d) => (Array.isArray(d.calls) && d.calls.length > 0 ? 1 : 0))
          .catch(() => 0)
      : Promise.resolve(0),
    authFetch("/api/activation/status")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
    primaryAgentId
      ? authFetch(`/api/agent-config/${encodeURIComponent(primaryAgentId)}`)
          .then((response) => (response.ok ? response.json() : null))
          .catch(() => null)
      : Promise.resolve(null),
  ]);
  return {
    agentId: primaryAgentId || null,
    agents: agentRows.length,
    essentialsReady:
      essentials?.readiness?.jobDefined === true && essentials?.readiness?.greetingDefined === true,
    knowledge: Number(essentials?.readiness?.knowledgeCount ?? 0),
    numbers,
    calls,
    browserTested: Boolean(essentials?.readiness?.lastBrowserTestAt),
    activated: activation?.activated === true,
    approvedAction: activation?.activationWithApprovedAction === true,
  };
}

export function fleetSetupCompletedCount(progress: AssistantSetupProgress): number {
  let n = 0;
  if (progress.essentialsReady) n++;
  if (progress.knowledge > 0) n++;
  if (progress.numbers > 0) n++;
  if (progress.browserTested || progress.calls > 0) n++;
  if (progress.activated) n++;
  if (progress.approvedAction) n++;
  return n;
}

export function isAssistantSetupComplete(progress: AssistantSetupProgress): boolean {
  return fleetSetupCompletedCount(progress) >= FLEET_SETUP_STEP_COUNT;
}
