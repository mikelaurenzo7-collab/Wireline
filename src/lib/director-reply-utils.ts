/** Shared assistant reply heuristics, safe for client and server. */

export const DIRECTOR_STUB_REPLY =
  "I'm here — tell me what you want to move forward and I'll help you shape it.";

const SUBSTANTIVE_REPLY_MIN_CHARS = 160;

export function isDirectorStubReply(content: string): boolean {
  return content.trim() === DIRECTOR_STUB_REPLY;
}

export function isSubstantiveDirectorReply(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed || isDirectorStubReply(trimmed)) return false;
  if (trimmed === "(empty)" || trimmed === "(empty reply)") return false;
  return trimmed.length >= SUBSTANTIVE_REPLY_MIN_CHARS;
}

export function directorPayloadHasProposals(data: Record<string, unknown>): boolean {
  const changes = data.changes;
  const toolToggles = data.toolToggles;
  const actions = data.actions;
  const integrationJobs = data.integrationJobs;
  const clarifyingQuestions = data.clarifyingQuestions;
  return (
    (Array.isArray(changes) && changes.length > 0) ||
    (Array.isArray(toolToggles) && toolToggles.length > 0) ||
    (Array.isArray(actions) && actions.length > 0) ||
    (Array.isArray(integrationJobs) && integrationJobs.length > 0) ||
    (Array.isArray(clarifyingQuestions) && clarifyingQuestions.length > 0)
  );
}

export function isTerminalDirectorStreamPayload(
  data: Record<string, unknown> | undefined,
): boolean {
  if (!data) return false;
  if (directorPayloadHasProposals(data)) return true;
  if (data.deliverableArtifact && typeof data.deliverableArtifact === "object") return true;
  if (Array.isArray(data.approvals) && data.approvals.length > 0) return true;
  return false;
}

export function isRecoverableDirectorPayload(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  if (isTerminalDirectorStreamPayload(data)) return true;
  const reply = data.reply;
  if (typeof reply !== "string") return false;
  const trimmed = reply.trim();
  return Boolean(trimmed && !isDirectorStubReply(trimmed));
}

export function isSubstantiveDirectorPayload(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  if (directorPayloadHasProposals(data)) return true;
  const reply = data.reply;
  return typeof reply === "string" && isSubstantiveDirectorReply(reply);
}

type AssistantThreadMessage = {
  role: string;
  content: string;
  clarifyingQuestions?: string[];
  proposals?: {
    changes?: unknown[];
    toolToggles?: unknown[];
    actions?: unknown[];
    integrationJobs?: unknown[];
  };
};

function messageHasRecoverableContent(message: AssistantThreadMessage): boolean {
  if (message.role !== "director") return false;
  if (isSubstantiveDirectorReply(message.content)) return true;
  const trimmed = message.content.trim();
  if (trimmed && !isDirectorStubReply(trimmed)) return true;
  const proposals = message.proposals;
  if (
    proposals &&
    ((proposals.changes?.length ?? 0) > 0 ||
      (proposals.toolToggles?.length ?? 0) > 0 ||
      (proposals.actions?.length ?? 0) > 0 ||
      (proposals.integrationJobs?.length ?? 0) > 0)
  ) {
    return true;
  }
  return Array.isArray(message.clarifyingQuestions) && message.clarifyingQuestions.length > 0;
}

export function accountHolderTurnHasDirectorReply(
  messages: AssistantThreadMessage[],
  accountHolderContent: string,
): boolean {
  const needle = accountHolderContent.trim();
  const index = messages.findIndex(
    (message) => message.role === "Account Holder" && message.content.trim() === needle,
  );
  if (index < 0) return false;

  for (const message of messages.slice(index + 1)) {
    if (message.role === "Account Holder") break;
    if (messageHasRecoverableContent(message)) return true;
  }
  return false;
}

export function collapseDirectorThreadDuplicates<T extends { role: string; content: string }>(
  messagesAsc: T[],
): T[] {
  let lastAccountHolderIndex = -1;
  return messagesAsc.filter((message, index) => {
    if (message.role === "Account Holder") {
      lastAccountHolderIndex = index;
      return true;
    }
    if (message.role !== "director" || !isDirectorStubReply(message.content)) return true;
    if (lastAccountHolderIndex < 0) return true;
    for (let cursor = index - 1; cursor > lastAccountHolderIndex; cursor--) {
      const prior = messagesAsc[cursor];
      if (prior.role === "director" && isSubstantiveDirectorReply(prior.content)) return false;
    }
    return true;
  });
}
