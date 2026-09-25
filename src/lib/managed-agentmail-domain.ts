/** New mailboxes use .app; existing first-party identities can retain .me. */
export function isBotBoundManagedEmailDomain(domain: string, allowLegacy = false): boolean {
  if (
    domain.length > 253 ||
    !domain.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  )
    return false;
  const roots = allowLegacy ? ["botbound.app", "botbound.me"] : ["botbound.app"];
  return roots.some((root) => domain === root || domain.endsWith(`.${root}`));
}

export function existingManagedEmailDomain(address: string): string | null {
  const parts = address.trim().toLowerCase().split("@");
  if (parts.length !== 2 || !parts[0] || /\s/.test(parts[0])) return null;
  return isBotBoundManagedEmailDomain(parts[1], true) ? parts[1] : null;
}
