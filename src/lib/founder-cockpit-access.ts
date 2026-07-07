/**
 * Founder operating cockpit — strictly limited to the platform founder and
 * explicitly approved operators. Never infer from tenant admin or is_admin.
 */
import { getOwnerEmails } from "./platform-owner-emails";

let cachedAllowlistEmails: Set<string> | null = null;

function getApprovedCockpitEmails(): Set<string> {
  if (cachedAllowlistEmails) return cachedAllowlistEmails;
  const emails = new Set(getOwnerEmails());
  for (const entry of (process.env.FOUNDER_COCKPIT_EMAILS || "").split(",")) {
    const normalized = entry.trim().toLowerCase();
    if (normalized) emails.add(normalized);
  }
  cachedAllowlistEmails = emails;
  return emails;
}

function getApprovedCockpitUserIds(): Set<string> {
  const ids = new Set<string>();
  for (const entry of (process.env.FOUNDER_COCKPIT_USER_IDS || "").split(",")) {
    const trimmed = entry.trim();
    if (trimmed) ids.add(trimmed);
  }
  return ids;
}

/** Test helper — re-read allowlist env after changes. */
export function resetFounderCockpitAccessCacheForTests(): void {
  cachedAllowlistEmails = null;
}

export function canAccessFounderCockpit(
  user: { email?: string | null; id?: string } | null | undefined,
): boolean {
  if (!user?.id) return false;
  const email = user.email?.trim().toLowerCase();
  if (email && getApprovedCockpitEmails().has(email)) return true;
  return getApprovedCockpitUserIds().has(user.id);
}
