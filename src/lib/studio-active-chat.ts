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
