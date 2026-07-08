/** Legacy Admin deep-link tabs that redirect into the active tenant surface. */
export const LEGACY_ADMIN_TAB_REDIRECTS = ["cockpit", "system"] as const;

export type LegacyAdminTabRedirect = (typeof LEGACY_ADMIN_TAB_REDIRECTS)[number];

export function isWirelineAccountHolder(user: { is_owner?: boolean } | null | undefined): boolean {
  return user?.is_owner === true;
}

export function isLegacyAdminTabRedirect(tab: string): tab is LegacyAdminTabRedirect {
  return (LEGACY_ADMIN_TAB_REDIRECTS as readonly string[]).includes(tab);
}
