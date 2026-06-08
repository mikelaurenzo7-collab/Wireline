/**
 * Director proposal card state — keys, pending counts, and clear-thread copy.
 *
 * Applied agent config is persisted via /workspace/apply-change on the agent row.
 * Proposal cards live in Director message metadata; resolved state is stored
 * per message so approvals survive reload until the thread is cleared.
 */
import type { DirectorProposalsMeta } from "./director-message-metadata";

export type DirectorProposalKind = "change" | "toggle" | "action" | "integration";
export type DirectorProposalResolution = "done" | "dismissed";

export interface DirectorProposalMessage {
  id: string;
  role: string;
  proposals?: DirectorProposalsMeta;
  resolved?: Record<string, DirectorProposalResolution>;
}

export function directorProposalKey(
  messageId: string,
  kind: DirectorProposalKind,
  index: number,
): string {
  return `${messageId}:${kind}:${index}`;
}

export function relativeDirectorProposalKey(kind: DirectorProposalKind, index: number): string {
  return `${kind}:${index}`;
}

export function parseDirectorProposalKey(
  key: string,
): { messageId: string; relativeKey: string } | null {
  const match = key.match(/^([^:]+):(change|toggle|action|integration):(\d+)$/);
  if (!match) return null;
  return {
    messageId: match[1]!,
    relativeKey: relativeDirectorProposalKey(match[2] as DirectorProposalKind, Number(match[3])),
  };
}

export function isPersistedDirectorMessageId(messageId: string): boolean {
  return /^\d+$/.test(messageId);
}

export function mergeResolvedFromDirectorMessages(
  messages: DirectorProposalMessage[],
): Record<string, DirectorProposalResolution> {
  const merged: Record<string, DirectorProposalResolution> = {};
  for (const message of messages) {
    if (!message.resolved) continue;
    for (const [relativeKey, state] of Object.entries(message.resolved)) {
      merged[`${message.id}:${relativeKey}`] = state;
    }
  }
  return merged;
}

function countUnresolvedProposalsForMessage(
  message: DirectorProposalMessage,
  resolved: Record<string, DirectorProposalResolution>,
): number {
  if (message.role !== "director" || !message.proposals) return 0;
  const groups: Array<[DirectorProposalKind, number]> = [
    ["change", message.proposals.changes.length],
    ["toggle", message.proposals.toolToggles.length],
    ["action", message.proposals.actions.length],
    ["integration", message.proposals.integrationJobs.length],
  ];
  let pending = 0;
  for (const [kind, length] of groups) {
    for (let index = 0; index < length; index++) {
      const key = directorProposalKey(message.id, kind, index);
      if (!resolved[key]) pending++;
    }
  }
  return pending;
}

export function countPendingDirectorProposalsForMessage(
  message: DirectorProposalMessage,
  resolved: Record<string, DirectorProposalResolution>,
): number {
  return countUnresolvedProposalsForMessage(message, resolved);
}

export function countPendingDirectorProposals(
  messages: DirectorProposalMessage[],
  resolved: Record<string, DirectorProposalResolution>,
): number {
  let pending = 0;
  for (const message of messages) {
    pending += countUnresolvedProposalsForMessage(message, resolved);
  }
  return pending;
}

export type DirectorConfigProposalRef = {
  key: string;
  kind: "change" | "toggle";
  messageId: string;
  index: number;
};

export function planBulkDirectorConfigApprovals(
  messages: DirectorProposalMessage[],
  resolved: Record<string, DirectorProposalResolution>,
  opts: { messageHasCoachAgent?: (message: DirectorProposalMessage) => boolean } = {},
): { keys: DirectorConfigProposalRef[]; skippedMissingCoach: number } {
  const hasCoach = opts.messageHasCoachAgent ?? (() => true);
  const keys: DirectorConfigProposalRef[] = [];
  let skippedMissingCoach = 0;

  for (const message of messages) {
    if (message.role !== "director" || !message.proposals) continue;
    if (!hasCoach(message)) {
      skippedMissingCoach +=
        message.proposals.changes.length + message.proposals.toolToggles.length;
      continue;
    }
    for (let index = 0; index < message.proposals.changes.length; index++) {
      const key = directorProposalKey(message.id, "change", index);
      if (!resolved[key]) keys.push({ key, kind: "change", messageId: message.id, index });
    }
    for (let index = 0; index < message.proposals.toolToggles.length; index++) {
      const key = directorProposalKey(message.id, "toggle", index);
      if (!resolved[key]) keys.push({ key, kind: "toggle", messageId: message.id, index });
    }
  }

  return { keys, skippedMissingCoach };
}

export function buildDirectorApproveAllConfigConfirm(
  applyCount: number,
  skippedMissingCoach: number,
): string {
  const lines = [
    `Apply ${applyCount} pending agent update${applyCount === 1 ? "" : "s"}?`,
    "",
    "Each card saves to the coached agent immediately (greeting, tone, knowledge, capabilities, etc.).",
    "Outbound calls, emails, and integration runs still need per-card approval.",
  ];
  if (skippedMissingCoach > 0) {
    lines.push(
      "",
      `${skippedMissingCoach} update${skippedMissingCoach === 1 ? "" : "s"} skipped on messages without a coached agent.`,
    );
  }
  lines.push("", "This cannot be undone from Director — you can edit agents later in Fleet.");
  return lines.join("\n");
}

export function buildDirectorClearThreadConfirm(pendingApprovals: number): string {
  const lines = [
    "Clear your Director conversation and generated artifacts?",
    "",
    "Kept: agent settings you already applied (greeting, tone, email signature, etc.) stay on each agent.",
    "Kept: calls, emails, and integrations you already approved and ran.",
    "Removed: chat history, unapproved proposal cards, and artifacts in this thread.",
  ];
  if (pendingApprovals > 0) {
    lines.push(
      "",
      `${pendingApprovals} approval card${pendingApprovals === 1 ? "" : "s"} still pending — clearing will discard ${pendingApprovals === 1 ? "it" : "them"}.`,
    );
  }
  lines.push("", "This cannot be undone.");
  return lines.join("\n");
}
