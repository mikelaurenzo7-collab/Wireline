import { useSyncExternalStore } from "react";

/**
 * Which Studio chat is open, and a counter that moves when the saved chat list
 * may have changed. The workspace rail lists chats beside the conversation, so
 * it needs both without owning the conversation's state. Page-session memory
 * only: nothing here is persisted.
 */
export type ActiveStudioChat = { agentId: string; threadId: string } | null;

type Snapshot = { active: ActiveStudioChat; version: number };

let snapshot: Snapshot = { active: null, version: 0 };
const listeners = new Set<() => void>();

function publish(next: Snapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

export function setActiveStudioChat(active: ActiveStudioChat) {
  const current = snapshot.active;
  if (current?.agentId === active?.agentId && current?.threadId === active?.threadId) return;
  publish({ ...snapshot, active });
}

/** Call after a message is saved, a chat is cleared, or a chat is filed in a project. */
export function notifyStudioChatsChanged() {
  publish({ ...snapshot, version: snapshot.version + 1 });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => snapshot;

export function useStudioChatState(): Snapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Studio accepts `?conversation=new`, `?conversation=legacy`, or a saved chat's UUID. */
export const STUDIO_THREAD_PARAM = "conversation";
const THREAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `null` opens a fresh chat; `undefined` means the link is not a valid chat. */
export function parseStudioThreadParam(value: string | null): string | null | undefined {
  if (!value) return undefined;
  if (value === "new") return null;
  if (value === "legacy" || THREAD_ID.test(value)) return value;
  return undefined;
}

/**
 * The `?conversation=` request Studio still has to apply, or `null` when there
 * is nothing to do. `applied` is the request Studio applied last.
 *
 * A request is applied once per Bot. The router removes the parameter in a
 * transition, which React renders only after Studio's own change to the open
 * chat, so Studio sees the same request again with a different chat open.
 * `new` never equals the open chat: applied on every pass, it opened another
 * fresh chat each time, rebuilt the conversation, and never let the removal
 * land. That loop is the "Something broke" screen behind the rail's New chat.
 */
export function pendingStudioThreadRequest(input: {
  param: string | null;
  agentId: string | null;
  openThreadId: string;
  applied: string | null;
}): string | null {
  if (!input.param || !input.agentId || !input.openThreadId) return null;
  const request = JSON.stringify([input.agentId, input.param]);
  return request === input.applied ? null : request;
}
