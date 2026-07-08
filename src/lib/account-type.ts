/**
 * account-type.ts - Personal vs Business account mode.
 *
 * A Wireline account is one of two shapes:
 *   - "personal" - one agent on your own line. You shape it in Studio and
 *     reach people over your channels (phone, email, text). No cross-team
 *     routing, no supervisor cockpit, no SDR pipeline.
 *   - "business" - the full platform: a roster of agents plus the Run surface
 *     (Recaps, Insights, Pipeline).
 *
 * The mode is a lens over the same app, not a different app. It filters which
 * navigation surfaces are offered; it is not a security boundary. Routes stay
 * protected server-side. This module is the single source of truth for what
 * each mode sees.
 */
import { NAV_GROUPS, SIDEBAR_NAV_ITEMS, type NavItem } from "../constants/navigation";

export type AccountType = "personal" | "business";

/**
 * Nav groups that only make sense for a business. The Run group is the
 * supervisor cockpit (Recaps), cross-agent intelligence (Insights), and SDR
 * pipeline. A personal, single-agent account does not need those surfaces.
 * Build (Studio), Channels, and Admin are shared by both modes.
 *
 * NOTE: this must track the group label and section names in
 * constants/navigation.ts. The account-type contract test guards it.
 */
const BUSINESS_ONLY_GROUPS = new Set<string>(["Run", "Channels"]);
const PERSONAL_ONLY_GROUPS = new Set<string>(["Personal"]);

/**
 * Resolve the account mode from the billing plan id. Only the "personal" tier
 * is a personal account; every other tier and an unknown or not-yet-loaded
 * plan resolves to "business" so an established workspace never has surfaces
 * stripped out from under it.
 */
export function resolveAccountType(planId: string | null | undefined): AccountType {
  return planId === "personal" ? "personal" : "business";
}

/** True when a nav item's section is a business-only group. */
export function isBusinessOnlySection(section: string | undefined): boolean {
  return !!section && BUSINESS_ONLY_GROUPS.has(section);
}

export function isPersonalOnlySection(section: string | undefined): boolean {
  return !!section && PERSONAL_ONLY_GROUPS.has(section);
}

/** True when a route path is offered in the given account mode. */
export function isRouteAvailableForAccount(type: AccountType, path: string): boolean {
  if (type === "business") return true;
  const item = SIDEBAR_NAV_ITEMS.find((i) => i.path === path);
  // Unknown paths (admin, deep links) stay available; only known business-only
  // rail items are withheld from a personal account.
  return item ? !isBusinessOnlySection(item.section) : true;
}

/** NAV_GROUPS filtered for the account mode (drops business-only groups for personal). */
export function accountNavGroups(type: AccountType): Array<(typeof NAV_GROUPS)[number]> {
  if (type === "business") {
    return NAV_GROUPS.filter((group) => !PERSONAL_ONLY_GROUPS.has(group.label));
  }
  return NAV_GROUPS.filter((group) => !BUSINESS_ONLY_GROUPS.has(group.label));
}

/** SIDEBAR_NAV_ITEMS filtered for the account mode. */
export function accountSidebarItems(type: AccountType): NavItem[] {
  if (type === "business") {
    return SIDEBAR_NAV_ITEMS.filter((item) => !isPersonalOnlySection(item.section));
  }
  return SIDEBAR_NAV_ITEMS.filter((item) => !isBusinessOnlySection(item.section));
}
