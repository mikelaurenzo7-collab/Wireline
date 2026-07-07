/**
 * Opaque browser-extension handoff identifiers.
 *
 * The extension can only pass captured page context through a client-readable
 * fragment on `/studio/handoff`. Once authenticated, the bridge exchanges that
 * fragment for a one-time server-side handoff id. Studio never receives the
 * captured context in the URL.
 */

import { createHmac, randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret, getDataKey, isVaultConfigured } from "./secret-vault";
import type { BrowserCommandContext } from "./browser-command-context";
import { BROWSER_COMMAND_CONTEXT_MAX_AGE_MS } from "./browser-command-context";

const HANDOFF_LABEL = "browser-handoff-v2";
export const BROWSER_HANDOFF_ID_PREFIX = "wlbh_";
export const BROWSER_HANDOFF_TTL_MS = BROWSER_COMMAND_CONTEXT_MAX_AGE_MS;

function handoffKey(): Buffer {
  return createHmac("sha256", getDataKey()).update(HANDOFF_LABEL).digest();
}

function appBase(): string {
  return (process.env.APP_URL || "https://trywireline.com").replace(/\/+$/, "");
}

export function isBrowserHandoffVaultConfigured(): boolean {
  return isVaultConfigured();
}

export function createBrowserHandoffId(): string {
  return `${BROWSER_HANDOFF_ID_PREFIX}${randomBytes(24).toString("base64url")}`;
}

export function hashBrowserHandoffId(handoffId: string): string {
  return createHmac("sha256", handoffKey()).update(handoffId).digest("base64url");
}

export function encryptBrowserHandoffContext(context: BrowserCommandContext): string {
  return encryptSecret(JSON.stringify(context));
}

export function decryptBrowserHandoffContext(encrypted: string): BrowserCommandContext | null {
  try {
    const parsed = JSON.parse(decryptSecret(encrypted)) as BrowserCommandContext;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.title !== "string" || typeof parsed.url !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function studioHandoffUrl(handoffId: string): string {
  return `${appBase()}/studio?create=1&handoff_id=${encodeURIComponent(handoffId)}`;
}
