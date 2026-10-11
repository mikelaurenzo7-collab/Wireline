import type {
  StudioConversationSession,
  StudioMessage,
  StudioWorkroomDraft,
} from "../components/StudioWorkroom";
import { createStudioSetupDrafts } from "./studio-setup-drafts";

export const STUDIO_RECENT_BOT_LIMIT = 32;
export const STUDIO_CONVERSATION_MESSAGE_LIMIT = 80;

/** Keep unsaved reviews visible in the current session as older turns roll out of view. */
function reviewableMessageIds(session: StudioConversationSession, messages: StudioMessage[]) {
  const retained = new Set(
    [...session.operations]
      .filter(([, operation]) => operation.snapshot.pending || !operation.snapshot.saved)
      .map(([key]) => key.slice(0, key.lastIndexOf(":"))),
  );
  for (const message of messages) {
    const proposals = message.proposals;
    if (!proposals) continue;
    if (proposals.actions?.length) retained.add(message.id);
    for (const [kind, items] of [
      ["change", proposals.changes],
      ["tool", proposals.toolToggles],
    ] as const) {
      if (
        items?.some((_, index) => {
          const key = `${kind}-${index}`;
          const operation = session.operations.get(`${message.id}:${key}`);
          // New cards may not have mounted and created their operation yet.
          return operation
            ? operation.snapshot.pending || !operation.snapshot.saved
            : !message.savedProposalKeys?.includes(key);
        })
      ) {
        retained.add(message.id);
      }
    }
  }
  return retained;
}

/** Page-session memory only. Never persist private conversations in browser storage. */
export function createStudioSessionState(ownerId: string | null) {
  const setupDrafts = createStudioSetupDrafts(ownerId);
  const drafts = new Map<string, StudioWorkroomDraft>();
  const conversations = new Map<string, StudioConversationSession>();
  const recentBots = new Set<string>();

  return {
    ownerId,
    setupDrafts,
    drafts,
    conversations,
    visitBot(agentId: string) {
      recentBots.delete(agentId);
      recentBots.add(agentId);
      for (const candidate of recentBots) {
        if (recentBots.size <= STUDIO_RECENT_BOT_LIMIT) break;
        if (candidate === agentId || setupDrafts.isRetained(candidate)) continue;
        const keys = [`${candidate}:configure`, `${candidate}:test`];
        if (
          keys.some((key) => {
            const session = conversations.get(key);
            return (
              Boolean(drafts.get(key)?.text.trim()) ||
              (session &&
                (session.listeners.size > 0 ||
                  session.snapshot.clearing ||
                  reviewableMessageIds(session, session.snapshot.messages).size > 0))
            );
          })
        )
          continue;
        // The limit is soft while drafts, reviews or writes are outstanding. Revisit it
        // on navigation after they settle instead of silently discarding work.
        recentBots.delete(candidate);
        setupDrafts.forget(candidate);
        keys.forEach((key) => {
          drafts.delete(key);
          conversations.delete(key);
        });
      }
    },
  };
}

/** Keep recent history plus draft reviews and pending saves in this page session. */
export function retainStudioConversationMessages(
  session: StudioConversationSession,
  messages: StudioMessage[],
): StudioMessage[] {
  const reviewableIds = reviewableMessageIds(session, messages);
  const retained = messages.filter(
    (message, index) =>
      index >= messages.length - STUDIO_CONVERSATION_MESSAGE_LIMIT || reviewableIds.has(message.id),
  );
  const retainedIds = new Set(retained.map((message) => message.id));
  for (const [key, operation] of session.operations) {
    if (!operation.snapshot.pending && !retainedIds.has(key.slice(0, key.lastIndexOf(":")))) {
      session.operations.delete(key);
    }
  }
  return retained;
}

export type StudioSessionState = ReturnType<typeof createStudioSessionState>;
