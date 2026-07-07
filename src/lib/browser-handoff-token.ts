/**
 * Signed browser-extension handoff tokens.
 *
 * The extension cannot hold secrets, so it opens `/studio/handoff` with a
 * client-readable fragment. An authenticated exchange endpoint signs the
 * captured context to the current user; Studio redeems it server-side.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isVaultConfigured, getDataKey } from "./secret-vault";
import type { BrowserCommandContext } from "./browser-command-context";
import { BROWSER_COMMAND_CONTEXT_MAX_AGE_MS } from "./browser-command-context";

const TOKEN_LABEL = "browser-handoff-v1";
const TOKEN_VERSION = 1;

type HandoffPayload = {
  v: number;
  uid: string;
  exp: number;
  nonce: string;
  ctx: BrowserCommandContext;
};

function handoffKey(): string {
  const base = isVaultConfigured()
    ? getDataKey().toString("base64")
    : "wireline-dev-browser-handoff-secret";
  return createHmac("sha256", base).update(TOKEN_LABEL).digest("hex");
}

function appBase(): string {
  return (process.env.APP_URL || "https://trywireline.com").replace(/\/+$/, "");
}

function encodePayload(payload: HandoffPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodePayload(encoded: string): HandoffPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as HandoffPayload;
    if (parsed?.v !== TOKEN_VERSION) return null;
    if (!parsed.uid || typeof parsed.exp !== "number") return null;
    if (!parsed.ctx || typeof parsed.ctx !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function signBrowserHandoffToken(userId: string, context: BrowserCommandContext): string {
  const payload: HandoffPayload = {
    v: TOKEN_VERSION,
    uid: userId,
    exp: Date.now() + BROWSER_COMMAND_CONTEXT_MAX_AGE_MS,
    nonce: randomBytes(12).toString("base64url"),
    ctx: context,
  };
  const encoded = encodePayload(payload);
  const sig = createHmac("sha256", handoffKey()).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifyBrowserHandoffToken(
  token: string | undefined | null,
  userId: string,
): BrowserCommandContext | null {
  if (!token || typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const encoded = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!encoded || !sig) return null;

  const expected = createHmac("sha256", handoffKey()).update(encoded).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const payload = decodePayload(encoded);
  if (!payload) return null;
  if (payload.uid !== userId) return null;
  if (payload.exp < Date.now()) return null;
  return payload.ctx;
}

export function studioHandoffUrl(token: string): string {
  return `${appBase()}/studio?create=1&handoff=${encodeURIComponent(token)}`;
}
