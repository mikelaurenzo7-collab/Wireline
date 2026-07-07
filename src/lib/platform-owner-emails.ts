let cachedOwnerEmails: Set<string> | null = null;

/** Resolve platform owner emails from OWNER_EMAIL + optional OWNER_EMAILS (comma-separated). */
export function getOwnerEmails(): Set<string> {
  if (cachedOwnerEmails) return cachedOwnerEmails;
  const emails = new Set<string>();
  const primary = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
  if (primary) emails.add(primary);
  for (const entry of (process.env.OWNER_EMAILS || "").split(",")) {
    const normalized = entry.trim().toLowerCase();
    if (normalized) emails.add(normalized);
  }
  cachedOwnerEmails = emails;
  return emails;
}

/** Test helper — re-read OWNER_EMAIL / OWNER_EMAILS after env changes. */
export function resetOwnerEmailCacheForTests(): void {
  cachedOwnerEmails = null;
}

/**
 * True when the email matches the platform owner (OWNER_EMAIL env).
 * Case-insensitive + trimmed.
 */
export function isOwnerEmail(email: string | null | undefined): boolean {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return false;
  return getOwnerEmails().has(normalized);
}
