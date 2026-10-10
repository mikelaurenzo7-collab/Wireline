const PENDING_REPLY_PREFIX = "botbound:email-reply:pending:v1:";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ReplySessionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserSessionStorage(): ReplySessionStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function storageKey(threadId: string): string {
  return `${PENDING_REPLY_PREFIX}${encodeURIComponent(threadId)}`;
}

/** Persist only the random idempotency key, never the customer's reply text. */
export function savePendingEmailReplyOperation(
  threadId: string,
  operationKey: string,
  storage = browserSessionStorage(),
): boolean {
  if (!storage || !UUID_PATTERN.test(operationKey)) return false;
  try {
    const key = storageKey(threadId);
    storage.setItem(key, operationKey);
    return storage.getItem(key) === operationKey;
  } catch {
    return false;
  }
}

export function loadPendingEmailReplyOperation(
  threadId: string,
  storage = browserSessionStorage(),
): string | null {
  if (!storage) return null;
  try {
    const operationKey = storage.getItem(storageKey(threadId));
    return operationKey && UUID_PATTERN.test(operationKey) ? operationKey : null;
  } catch {
    return null;
  }
}

export function clearPendingEmailReplyOperation(
  threadId: string,
  storage = browserSessionStorage(),
): boolean {
  if (!storage) return false;
  try {
    const key = storageKey(threadId);
    storage.removeItem(key);
    return storage.getItem(key) === null;
  } catch {
    return false;
  }
}
