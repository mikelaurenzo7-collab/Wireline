/**
 * Normalize Vapi tool-calls webhook payloads.
 *
 * Vapi has shipped multiple shapes over time:
 *   - message.toolCalls[].function.{ name, arguments }
 *   - message.toolCallList[].{ id, name, arguments }
 *
 * Arguments may arrive as a JSON object or a JSON string. Showcase +
 * tenant handlers must accept all variants or tools silently no-op.
 */

export interface NormalizedVapiToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export function parseVapiToolArguments(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return {};
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
    return {};
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

/** Vapi/LLMs may send boolean true as string "true". */
export function isEmailConfirmed(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

export function normalizeVapiToolCalls(
  message: Record<string, unknown> | undefined,
): NormalizedVapiToolCall[] {
  if (!message) return [];

  const byId = new Map<string, NormalizedVapiToolCall>();

  const legacy = message.toolCalls;
  if (Array.isArray(legacy)) {
    for (const tc of legacy) {
      const row = tc as Record<string, unknown>;
      const fn = row.function as Record<string, unknown> | undefined;
      const id = typeof row.id === "string" ? row.id : "";
      const name =
        (typeof fn?.name === "string" && fn.name) ||
        (typeof row.name === "string" && row.name) ||
        "";
      const args = parseVapiToolArguments(fn?.arguments ?? row.arguments);
      if (id && name) byId.set(id, { id, name, arguments: args });
    }
  }

  const list = message.toolCallList;
  if (Array.isArray(list)) {
    for (const tc of list) {
      const row = tc as Record<string, unknown>;
      const id = typeof row.id === "string" ? row.id : "";
      const name = typeof row.name === "string" ? row.name : "";
      const args = parseVapiToolArguments(row.arguments ?? row.parameters);
      if (id && name) byId.set(id, { id, name, arguments: args });
    }
  }

  return [...byId.values()];
}
