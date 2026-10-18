import { OUTBOUND_CALL_PURPOSES } from "./outbound-call-purpose";
import type { VoicePermissionSummary } from "./recipient-voice-permission-contract";
import { authFetch } from "./api";

export function isVoicePermissionSummary(value: unknown): value is VoicePermissionSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    ["id", "agent_id", "bot_name", "recipient_phone_masked"].every(
      (key) => typeof row[key] === "string" && row[key].length > 0,
    ) &&
    OUTBOUND_CALL_PURPOSES.includes(row.purpose as VoicePermissionSummary["purpose"]) &&
    ["pending", "granted", "revoked", "expired", "used"].includes(String(row.status)) &&
    ["request_expires_at", "expires_at", "created_at"].every(
      (key) => typeof row[key] === "string" && Number.isFinite(Date.parse(row[key])),
    ) &&
    row.identity_assurance === "bearer_link_and_typed_signature"
  );
}

export async function listVoicePermissions(
  signal?: AbortSignal,
): Promise<VoicePermissionSummary[]> {
  const response = await authFetch("/api/voice-permissions", { signal });
  const body = (await response.json().catch(() => null)) as {
    permissions?: unknown;
    error?: string;
  } | null;
  if (!response.ok) throw new Error(body?.error || "Could not load recipient permissions.");
  if (!Array.isArray(body?.permissions) || !body.permissions.every(isVoicePermissionSummary)) {
    throw new Error("Could not confirm recipient permissions. Refresh to try again.");
  }
  return body.permissions;
}

/** Capability links must stay on this application and out of query-string telemetry. */
export function checkedVoicePermissionLink(value: unknown, origin: string): string {
  if (typeof value !== "string") throw new Error("Could not confirm the permission link.");
  const url = new URL(value);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const token = fragment.get("token");
  if (
    url.origin !== origin ||
    url.pathname !== "/voice-permission" ||
    url.search ||
    url.username ||
    url.password ||
    fragment.size !== 1 ||
    !token ||
    token.length < 32 ||
    token.length > 1_024
  ) {
    throw new Error("Could not confirm the permission link.");
  }
  return url.href;
}
