/**
 * SSRF guards for Vapi live-call monitor URLs (control + listen).
 * Both are externally issued capabilities and must stay on the TLS-only vapi.ai host allowlist.
 */
import { isSsrfUrl } from "./webhook-validators";

function parseVapiMonitorUrl(raw: string, protocols: Set<string>): URL | null {
  if (!raw || isSsrfUrl(raw)) return null;
  try {
    const parsed = new URL(raw);
    if (!protocols.has(parsed.protocol)) return null;
    const host = parsed.hostname;
    if (host !== "vapi.ai" && !host.endsWith(".vapi.ai")) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isAllowedVapiControlUrl(raw: string): boolean {
  return parseVapiMonitorUrl(raw, new Set(["https:"])) !== null;
}

export function isAllowedVapiListenUrl(raw: string): boolean {
  return parseVapiMonitorUrl(raw, new Set(["wss:"])) !== null;
}
