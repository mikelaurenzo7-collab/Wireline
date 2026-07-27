import { authFetch } from "./api";

export type AssistantSetupProgress = {
  agents: number;
  knowledge: number;
  numbers: number;
  calls: number;
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
  const [agents, knowledge, numbers, calls, activation] = await Promise.all([
    authFetch("/api/agents")
      .then(async (r) => {
        if (!r.ok) return 0;
        const d = await r.json();
        return d.agents?.length ?? 0;
      })
      .catch(() => 0),
    authFetch("/api/knowledge")
      .then(async (r) => {
        if (!r.ok) return 0;
        const d = await r.json();
        return d.total ?? d.knowledge?.length ?? 0;
      })
      .catch(() => 0),
    authFetch("/api/phone-numbers")
      .then(async (r) => {
        if (!r.ok) return 0;
        const d = await r.json();
        return d.numbers?.length ?? 0;
      })
      .catch(() => 0),
    authFetch("/api/calls?limit=1")
      .then((r) => (r.ok ? r.json() : { calls: [] }))
      .then((d) => (Array.isArray(d.calls) && d.calls.length > 0 ? 1 : 0))
      .catch(() => 0),
    authFetch("/api/activation/status")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ]);
  return {
    agents,
    knowledge,
    numbers,
    calls,
    activated: activation?.activated === true,
    approvedAction: activation?.activationWithApprovedAction === true,
  };
}

export function fleetSetupCompletedCount(progress: AssistantSetupProgress): number {
  let n = 0;
  if (progress.agents > 0) n++;
  if (progress.knowledge > 0) n++;
  if (progress.numbers > 0) n++;
  if (progress.calls > 0) n++;
  if (progress.activated) n++;
  if (progress.approvedAction) n++;
  return n;
}

export function isAssistantSetupComplete(progress: AssistantSetupProgress): boolean {
  return fleetSetupCompletedCount(progress) >= FLEET_SETUP_STEP_COUNT;
}
