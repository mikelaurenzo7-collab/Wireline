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

export type ActivationNudgeStatus = {
  activated: boolean;
  activatedAt: string | null;
  activationChannel: "inbound" | "outbound" | null;
  firstActivationCallId: string | null;
  hasAgent: boolean;
  phoneNumber: string | null;
};

export async function fetchActivationNudgeStatus(): Promise<ActivationNudgeStatus | null> {
  try {
    const res = await authFetch("/api/activation/nudge-status");
    if (!res.ok) return null;
    return (await res.json()) as ActivationNudgeStatus;
  } catch {
    return null;
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
