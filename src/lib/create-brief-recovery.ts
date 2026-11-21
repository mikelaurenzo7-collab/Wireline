import { useSyncExternalStore } from "react";

/** A first brief stays in this browser tab until extraction is confirmed. */
export const CREATE_BRIEF_MAX_CHARS = 10_000;
const PREFIX = "wireline:create-brief:v1:";
const memory = new Map<string, string>();
const activeTraining = new Set<string>();
const trainingListeners = new Set<() => void>();
let currentOwner: string | null | undefined;

function notifyTraining() {
  for (const listener of trainingListeners) listener();
}

function subscribeToTraining(listener: () => void) {
  trainingListeners.add(listener);
  return () => trainingListeners.delete(listener);
}

export function isCreateBriefTraining(userId: string, agentId: string): boolean {
  const key = keyFor(userId, agentId);
  return key !== null && activeTraining.has(key);
}

export function useCreateBriefTraining(userId: string, agentId: string): boolean {
  return useSyncExternalStore(
    subscribeToTraining,
    () => isCreateBriefTraining(userId, agentId),
    () => false,
  );
}

/** In-flight work is tab-local. A reload can recover the brief without assuming it saved. */
export function beginCreateBriefTraining(userId: string, agentId: string): () => void {
  const key = keyFor(userId, agentId);
  if (!key) return () => {};
  activeTraining.add(key);
  notifyTraining();
  return () => {
    if (activeTraining.delete(key)) notifyTraining();
  };
}

export function isCreateBriefRecoveryOwner(userId: string): boolean {
  return Boolean(userId) && (currentOwner === undefined || currentOwner === userId);
}

/** A failed session probe cannot establish ownership or erase a private draft. */
export function suspendCreateBriefRecovery(): void {
  currentOwner = null;
  notifyTraining();
}

function keyFor(userId: string, agentId: string): string | null {
  if (!userId || !agentId || userId.length > 200 || agentId.length > 200) return null;
  if (!isCreateBriefRecoveryOwner(userId)) return null;
  return `${PREFIX}${encodeURIComponent(userId)}:${encodeURIComponent(agentId)}`;
}

/** Hydration retains this account's drafts; logout or switching accounts clears the rest. */
export function setCreateBriefRecoveryOwner(userId: string | null): void {
  currentOwner = userId;
  const keepPrefix = userId ? `${PREFIX}${encodeURIComponent(userId)}:` : null;
  for (const key of memory.keys()) {
    if (!keepPrefix || !key.startsWith(keepPrefix)) memory.delete(key);
  }
  for (const key of activeTraining) {
    if (!keepPrefix || !key.startsWith(keepPrefix)) activeTraining.delete(key);
  }
  notifyTraining();
  try {
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = sessionStorage.key(index);
      if (key?.startsWith(PREFIX) && (!keepPrefix || !key.startsWith(keepPrefix))) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Memory still preserves the current tab when browser storage is denied.
  }
}

export function rememberCreateBrief(userId: string, agentId: string, text: string): boolean {
  const key = keyFor(userId, agentId);
  const brief = text.trim();
  if (!key || !brief || brief.length > CREATE_BRIEF_MAX_CHARS) return false;
  memory.set(key, brief);
  try {
    sessionStorage.setItem(key, brief);
  } catch {
    // No persistent or cross-tab fallback for private business input.
  }
  return true;
}

export function readCreateBrief(userId: string, agentId: string): string {
  const key = keyFor(userId, agentId);
  if (!key) return "";
  let brief = memory.get(key) ?? "";
  if (!memory.has(key)) {
    try {
      brief = sessionStorage.getItem(key) || "";
    } catch {
      return "";
    }
  }
  return brief.length <= CREATE_BRIEF_MAX_CHARS ? brief : "";
}

/** A late confirmation must not erase an edited recovery draft. */
export function clearCreateBrief(userId: string, agentId: string, expectedText?: string): void {
  const key = keyFor(userId, agentId);
  if (
    !key ||
    (expectedText !== undefined && readCreateBrief(userId, agentId) !== expectedText.trim())
  )
    return;
  memory.set(key, "");
  try {
    sessionStorage.removeItem(key);
  } catch {
    // The memory tombstone prevents stale storage from restoring a saved brief.
  }
}
