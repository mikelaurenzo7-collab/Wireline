import { authFetch } from "./api";
import type { ConversationOutcomeStatus } from "./conversation-outcome";

type PendingOutcome = ConversationOutcomeStatus | "handoff";

export type ConversationOutcomeResult = {
  thread: Record<string, unknown>;
  handoff: { id: string; status: string } | null;
};

type OutcomeEvent =
  | { kind: "pending"; threadId: string }
  | { kind: "saved"; threadId: string; result: ConversationOutcomeResult }
  | { kind: "failed"; threadId: string; message: string };

function createOutcomeOperations(channel: "emails" | "sms") {
  // Navigation can unmount either Inbox while the server still owns a write.
  // Keep request ownership outside the view, separately for each channel.
  let pending: ReadonlyMap<string, PendingOutcome> = new Map();
  const listeners = new Set<(event: OutcomeEvent) => void>();

  const getPending = () => pending;
  const subscribe = (listener: (event: OutcomeEvent) => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const publish = (event: OutcomeEvent) => {
    for (const listener of listeners) listener(event);
  };
  const release = (threadId: string) => {
    const next = new Map(pending);
    next.delete(threadId);
    pending = next;
  };

  async function save(
    threadId: string,
    status: ConversationOutcomeStatus,
    handoff = false,
  ): Promise<ConversationOutcomeResult> {
    if (pending.has(threadId)) throw new Error("This conversation is still saving.");
    pending = new Map(pending).set(threadId, handoff ? "handoff" : status);
    publish({ kind: "pending", threadId });

    let result: ConversationOutcomeResult;
    try {
      const response = await authFetch(`/api/${channel}/threads/${threadId}/outcome`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, handoff }),
      });
      const body = (await response.json().catch(() => null)) as
        | (Partial<ConversationOutcomeResult> & { handoff_task_id?: string | null; error?: string })
        | null;
      if (!response.ok || !body?.thread)
        throw new Error(body?.error || "Could not update this conversation.");
      result = {
        thread: body.thread,
        handoff:
          body.handoff ??
          (body.handoff_task_id ? { id: body.handoff_task_id, status: "pending" } : null),
      };
    } catch (cause) {
      release(threadId);
      const message =
        cause instanceof Error ? cause.message : "Could not update this conversation.";
      publish({ kind: "failed", threadId, message });
      throw cause;
    }

    release(threadId);
    publish({ kind: "saved", threadId, result });
    return result;
  }

  return { getPending, subscribe, save };
}

export const emailOutcomeOperations = createOutcomeOperations("emails");
export const smsOutcomeOperations = createOutcomeOperations("sms");
