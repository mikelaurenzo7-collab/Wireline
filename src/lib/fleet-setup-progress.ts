import { authFetch } from "./api";

export type FleetSetupProgress = {
  agents: number;
  knowledge: number;
  numbers: number;
  calls: number;
};

export const FLEET_SETUP_STEP_COUNT = 4;

export async function fetchFleetSetupProgress(): Promise<FleetSetupProgress> {
  const [agents, knowledge, numbers, calls] = await Promise.all([
    authFetch("/api/agents")
      .then((r) => r.json())
      .then((d) => d.agents?.length ?? 0)
      .catch(() => 0),
    authFetch("/api/agent-config/default-agent")
      .then((r) => r.json())
      .then((d) => d.knowledge?.length ?? 0)
      .catch(() => 0),
    authFetch("/api/phone-numbers")
      .then((r) => r.json())
      .then((d) => d.numbers?.length ?? 0)
      .catch(() => 0),
    authFetch("/api/calls?limit=1")
      .then((r) => r.json())
      .then((d) => d.total ?? 0)
      .catch(() => 0),
  ]);
  return { agents, knowledge, numbers, calls };
}

export function fleetSetupCompletedCount(progress: FleetSetupProgress): number {
  let n = 0;
  if (progress.agents > 0) n++;
  if (progress.knowledge > 0) n++;
  if (progress.numbers > 0) n++;
  if (progress.calls > 0) n++;
  return n;
}

export function isFleetSetupComplete(progress: FleetSetupProgress): boolean {
  return fleetSetupCompletedCount(progress) >= FLEET_SETUP_STEP_COUNT;
}
