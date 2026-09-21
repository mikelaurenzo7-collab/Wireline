import { authFetch } from "./api";

export type EmailOutcomeStatus = "open" | "waiting" | "escalated" | "booked" | "resolved";
type PendingOutcome = EmailOutcomeStatus | "handoff";

export type EmailOutcomeResult = {
  thread: Record<string, unknown>;
  handoff?: { id: string; status: string } | null;
};

type OutcomeEvent =
  | { kind: "pending"; threadId: string }
  | { kind: "saved"; threadId: string; result: EmailOutcomeResult }
  | { kind: "failed"; threadId: string; message: string };

// Email/Text navigation unmounts the Inbox. The request and its ownership must
// survive that view so returning cannot dispatch a competing write.
let pending: ReadonlyMap<string, PendingOutcome> = new Map();
const listeners = new Set<(event: OutcomeEvent) => void>();

export const getPendingEmailOutcomes = () => pending;

export function subscribeEmailOutcomes(listener: (event: OutcomeEvent) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function publish(event: OutcomeEvent) {
  for (const listener of listeners) listener(event);
}

export async function saveEmailOutcome(
  threadId: string,
  status: EmailOutcomeStatus,
  handoff = false,
): Promise<EmailOutcomeResult> {
  if (pending.has(threadId)) throw new Error("This conversation is still saving.");
  pending = new Map(pending).set(threadId, handoff ? "handoff" : status);
  publish({ kind: "pending", threadId });

  let result: EmailOutcomeResult;
  try {
    const response = await authFetch(`/api/emails/threads/${threadId}/outcome`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, handoff }),
    });
    const body = (await response.json().catch(() => null)) as
      (Partial<EmailOutcomeResult> & { error?: string }) | null;
    if (!response.ok || !body?.thread)
      throw new Error(body?.error || "Could not update this conversation.");
    result = { thread: body.thread, handoff: body.handoff ?? null };
  } catch (cause) {
    const next = new Map(pending);
    next.delete(threadId);
    pending = next;
    const message = cause instanceof Error ? cause.message : "Could not update this conversation.";
    publish({ kind: "failed", threadId, message });
    throw cause;
  }

  const next = new Map(pending);
  next.delete(threadId);
  pending = next;
  publish({ kind: "saved", threadId, result });
  return result;
}
