const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PendingOutboundDial = { requestKey: string };
type RecoveryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const storageKey = (userId: string) => `botbound:outbound-dial:${userId}`;

/** Only an operation ID is retained, never a phone number, instruction or permission link. */
export function readPendingOutboundDial(
  userId: string,
  storage: RecoveryStorage,
): PendingOutboundDial | null {
  const value = storage.getItem(storageKey(userId));
  if (value === null) return null;
  const record = JSON.parse(value) as Record<string, unknown>;
  if (
    record.version !== 1 ||
    typeof record.requestKey !== "string" ||
    !UUID.test(record.requestKey)
  ) {
    throw new Error(
      "Saved call status could not be read. Check call history before another request.",
    );
  }
  return { requestKey: record.requestKey };
}

export function savePendingOutboundDial(
  userId: string,
  requestKey: string,
  storage: RecoveryStorage,
): void {
  if (!UUID.test(requestKey)) throw new Error("Invalid call request.");
  storage.setItem(storageKey(userId), JSON.stringify({ version: 1, requestKey }));
  if (readPendingOutboundDial(userId, storage)?.requestKey !== requestKey) {
    throw new Error("Could not retain call status. The call was not requested.");
  }
}

export function clearPendingOutboundDial(
  userId: string,
  requestKey: string,
  storage: RecoveryStorage,
): void {
  if (readPendingOutboundDial(userId, storage)?.requestKey === requestKey)
    storage.removeItem(storageKey(userId));
}

export function isConfirmedTerminalDial(value: unknown, requestKey: string): boolean {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return (
    body.requestKey === requestKey &&
    body.terminal === true &&
    (body.status === "completed" || body.status === "failed")
  );
}
