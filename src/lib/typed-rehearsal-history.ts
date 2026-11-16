const PREFIX = "wireline:typed-rehearsal:v1:";
const HISTORY_LIMIT = 12;
const LINE_LIMIT = 4_000;
let currentOwner: string | null = null;

export type TextRehearsalLine = { id: string; role: "You" | "Bot"; text: string };

function keyFor(ownerId: string | undefined, agentId: string): string | null {
  if (!ownerId || ownerId !== currentOwner) return null;
  return `${PREFIX}${encodeURIComponent(ownerId)}:${encodeURIComponent(agentId)}`;
}

/** Only the verified account can restore its rehearsal in this browser tab. */
export function setTypedRehearsalOwner(ownerId: string | null): void {
  currentOwner = ownerId;
  const keep = ownerId ? `${PREFIX}${encodeURIComponent(ownerId)}:` : null;
  try {
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = sessionStorage.key(index);
      if (key?.startsWith(PREFIX) && (!keep || !key.startsWith(keep))) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    // The open rehearsal remains usable when browser storage is unavailable.
  }
}

function isTextRehearsalLine(value: unknown): value is TextRehearsalLine {
  if (!value || typeof value !== "object") return false;
  const line = value as Partial<TextRehearsalLine>;
  return (
    typeof line.id === "string" &&
    (line.role === "You" || line.role === "Bot") &&
    typeof line.text === "string" &&
    line.text.length > 0 &&
    line.text.length <= LINE_LIMIT
  );
}

export function readTypedRehearsal(
  ownerId: string | undefined,
  agentId: string,
): TextRehearsalLine[] {
  const key = keyFor(ownerId, agentId);
  if (!key) return [];
  try {
    const raw = sessionStorage.getItem(key);
    const lines: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(lines) && lines.length <= HISTORY_LIMIT && lines.every(isTextRehearsalLine)
      ? lines
      : [];
  } catch {
    return [];
  }
}

export function saveTypedRehearsal(
  ownerId: string | undefined,
  agentId: string,
  lines: readonly TextRehearsalLine[],
): void {
  const key = keyFor(ownerId, agentId);
  if (!key) return;
  try {
    if (lines.length === 0) {
      sessionStorage.removeItem(key);
      return;
    }
    const recent = lines.slice(-HISTORY_LIMIT).map(({ id, role, text }) => ({
      id,
      role,
      text: text.slice(0, LINE_LIMIT),
    }));
    sessionStorage.setItem(key, JSON.stringify(recent));
  } catch {
    // Retain the transcript in the current rehearsal even without storage.
  }
}
