import { createHash } from "node:crypto";

export const MAILBOX_SCOPED_ID_PREFIX = "mailbox:v1:" as const;

/**
 * Provider thread/message ids are scoped to a mailbox and provider, not to a
 * Wireline tenant. Persist a fixed-length opaque namespace so two connected
 * accounts may emit the same provider id without colliding in the existing
 * tenant-wide unique indexes. Provider is included because reconnecting the
 * same email address through another provider preserves the mailbox row UUID.
 * Account ownership/provider are verified separately before persistence.
 */
export function mailboxScopedExternalId(
  accountId: string,
  provider: string,
  externalId: string,
): string {
  const normalizedAccountId = accountId.trim().toLowerCase();
  const normalizedProvider = provider.trim().toLowerCase();
  if (!normalizedAccountId) throw new Error("mailbox account id is required");
  if (!normalizedProvider) throw new Error("mailbox provider is required");
  if (!externalId || !externalId.trim()) throw new Error("mailbox external id is required");

  const digest = createHash("sha256")
    .update("wireline-mailbox-identity-v1\0", "utf8")
    .update(normalizedAccountId, "utf8")
    .update("\0", "utf8")
    .update(normalizedProvider, "utf8")
    .update("\0", "utf8")
    .update(externalId, "utf8")
    .digest("hex");

  return `${MAILBOX_SCOPED_ID_PREFIX}${digest}`;
}

export function isMailboxScopedExternalId(value: unknown): value is string {
  return typeof value === "string" && /^mailbox:v1:[0-9a-f]{64}$/.test(value);
}
