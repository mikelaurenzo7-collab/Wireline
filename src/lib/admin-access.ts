/** Legacy Admin deep-link tabs that redirect into the active tenant surface. */
export const LEGACY_ADMIN_TAB_REDIRECTS = ["cockpit", "system"] as const;

export type LegacyAdminTabRedirect = (typeof LEGACY_ADMIN_TAB_REDIRECTS)[number];

export function isWirelineAccountHolder(user: { is_owner?: boolean } | null | undefined): boolean {
  return user?.is_owner === true;
}

/**
 * `/admin` is the console for BotBound's own platform admins. Every other
 * account has the same controls in Settings, Lines and Compliance, so an old
 * Admin link lands on the matching page instead of a second copy of it.
 */
export function settingsPathForAdminTab(tab: string | null | undefined): string {
  switch (tab) {
    case "subscription":
      return "/settings/billing";
    case "team":
      return "/settings/team";
    case "branding":
      return "/settings/customization";
    case "carrier":
      return "/phone?tab=lines";
    case "activity":
    case "dnc":
    case "audit":
      return "/settings/compliance";
    case "voices":
      return "/knowledge?tab=voice";
    default:
      return "/settings";
  }
}

export function isLegacyAdminTabRedirect(tab: string): tab is LegacyAdminTabRedirect {
  return (LEGACY_ADMIN_TAB_REDIRECTS as readonly string[]).includes(tab);
}
