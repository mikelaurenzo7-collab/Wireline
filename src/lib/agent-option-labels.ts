import { formatAgentRoleLabel } from "./product-copy";

export type AgentOptionLabelInput = {
  id: string;
  name: string;
  role?: string | null;
};

/**
 * Keep the Studio switcher understandable when a workspace intentionally has
 * multiple Bots with the same display name. Role disambiguates the ordinary
 * case; a stable roster-order suffix handles the rarer same-name/same-role
 * case without exposing internal ids.
 */
export function buildAgentOptionLabels(agents: AgentOptionLabelInput[]): Map<string, string> {
  const nameCounts = new Map<string, number>();
  for (const agent of agents) {
    const key = agent.name.trim().toLocaleLowerCase("en-US");
    nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
  }

  const baseLabels = agents.map((agent) => {
    const name = agent.name.trim() || "Untitled Bot";
    const duplicated = (nameCounts.get(name.toLocaleLowerCase("en-US")) || 0) > 1;
    return duplicated ? `${name} · ${formatAgentRoleLabel(agent.role)}` : name;
  });
  const baseCounts = new Map<string, number>();
  for (const label of baseLabels) {
    baseCounts.set(label, (baseCounts.get(label) || 0) + 1);
  }

  const ordinals = new Map<string, number>();
  return new Map(
    agents.map((agent, index) => {
      const base = baseLabels[index];
      if ((baseCounts.get(base) || 0) === 1) return [agent.id, base];
      const ordinal = (ordinals.get(base) || 0) + 1;
      ordinals.set(base, ordinal);
      return [agent.id, `${base} · ${ordinal}`];
    }),
  );
}
