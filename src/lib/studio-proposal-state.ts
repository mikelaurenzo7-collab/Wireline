import type {
  ProposedAction,
  ProposedChange,
  ProposedToolToggle,
  WorkspacePlan,
} from "./workspace-planner";

export type StoredStudioProposals = {
  changes: ProposedChange[];
  toolToggles: ProposedToolToggle[];
  actions: ProposedAction[];
};

export type StoredStudioMessageMetadata = {
  proposals: StoredStudioProposals;
  savedProposalKeys: string[];
};

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** Older assistant turns claimed an approval existed without storing its card. */
export const claimsStudioReview = (text: string) =>
  /\b(?:i(?:'ve| have) drafted|approve it when ready|ready for (?:your )?approval)\b/i.test(text);

/** Only normalized, actionable cards are stored with an assistant turn. */
export function storedStudioProposals(
  plan: Pick<WorkspacePlan, "changes" | "toolToggles" | "actions">,
): StoredStudioProposals | null {
  if (!plan.changes.length && !plan.toolToggles.length && !plan.actions.length) return null;
  return { changes: plan.changes, toolToggles: plan.toolToggles, actions: plan.actions };
}

export function readStoredStudioProposals(value: unknown): StoredStudioProposals | null {
  if (!record(value)) return null;
  const state = value;
  if (
    !Array.isArray(state.changes) ||
    !Array.isArray(state.toolToggles) ||
    !Array.isArray(state.actions) ||
    !state.changes.every(
      (item: unknown) =>
        record(item) &&
        typeof item.field === "string" &&
        typeof item.label === "string" &&
        typeof item.value === "string" &&
        typeof item.summary === "string",
    ) ||
    !state.toolToggles.every(
      (item: unknown) =>
        record(item) &&
        typeof item.tool === "string" &&
        typeof item.enable === "boolean" &&
        typeof item.label === "string" &&
        typeof item.reason === "string",
    ) ||
    !state.actions.every(
      (item: unknown) =>
        record(item) &&
        ["send_email", "send_text_message", "make_call"].includes(String(item.kind)) &&
        typeof item.label === "string",
    )
  ) {
    return null;
  }
  return state as StoredStudioProposals;
}

export function storedStudioMessageMetadata(
  plan: Pick<WorkspacePlan, "changes" | "toolToggles" | "actions">,
): StoredStudioMessageMetadata | null {
  const proposals = storedStudioProposals(plan);
  return proposals ? { proposals, savedProposalKeys: [] } : null;
}

export function readStoredStudioMessageMetadata(
  value: unknown,
): StoredStudioMessageMetadata | null {
  if (!record(value)) return null;
  const proposals = readStoredStudioProposals(value.proposals);
  if (
    !proposals ||
    !Array.isArray(value.savedProposalKeys) ||
    !value.savedProposalKeys.every(
      (key: unknown) => typeof key === "string" && /^(?:change|tool)-(?:0|[1-9]\d*)$/.test(key),
    )
  ) {
    return null;
  }
  return { proposals, savedProposalKeys: value.savedProposalKeys };
}

export function proposalMatchesReview(
  proposals: StoredStudioProposals,
  key: string,
  expected: { field: string; value: string } | { tool: string; enable: boolean },
): boolean {
  const match = /^(change|tool)-(0|[1-9]\d*)$/.exec(key);
  if (!match) return false;
  const index = Number(match[2]);
  if (!Number.isSafeInteger(index)) return false;
  if (match[1] === "change") {
    if (!("field" in expected)) return false;
    const proposal = proposals.changes[index];
    return proposal?.field === expected.field && proposal.value === expected.value;
  }
  if (!("tool" in expected)) return false;
  const proposal = proposals.toolToggles[index];
  return proposal?.tool === expected.tool && proposal.enable === expected.enable;
}
