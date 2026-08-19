/**
 * account-type.ts - Account mode compatibility.
 *
 * Wireline is one workspace of Voice Agents. Customers configure each agent by
 * role. Stored `accounts.type` values (`personal` | `business`) remain for
 * compatibility; they are not a customer-facing product split and do not hide
 * navigation. Routes stay protected server-side.
 */
import { NAV_GROUPS, SIDEBAR_NAV_ITEMS, type NavItem } from "../constants/navigation";

export type AccountType = "personal" | "business";

/**
 * Legacy Work / Run labels. Kept so older call sites compile; the live
 * workspace always offers the full nav.
 */
const BUSINESS_ONLY_ITEM_SECTIONS = new Set<string>(["Run"]);
const PERSONAL_ONLY_GROUPS = new Set<string>(["Personal"]);

/**
 * Resolve the account mode from the billing plan id. Only the "personal" tier
 * is a personal account record; every other tier and an unknown or not-yet-loaded
 * plan resolves to "business". Navigation no longer depends on this split.
 */
export function resolveAccountType(planId: string | null | undefined): AccountType {
  return planId === "personal" ? "personal" : "business";
}

/** True when a nav item's section is a legacy Operate section. */
export function isBusinessOnlySection(section: string | undefined): boolean {
  return !!section && BUSINESS_ONLY_ITEM_SECTIONS.has(section);
}

export function isPersonalOnlySection(section: string | undefined): boolean {
  return !!section && PERSONAL_ONLY_GROUPS.has(section);
}

/** One workspace: every authenticated route stays available. */
export function isRouteAvailableForAccount(_type: AccountType, _path: string): boolean {
  return true;
}

/** Full NAV_GROUPS for every account. Drop unused Personal-only groups. */
export function accountNavGroups(_type: AccountType): Array<(typeof NAV_GROUPS)[number]> {
  return NAV_GROUPS.filter((group) => !PERSONAL_ONLY_GROUPS.has(group.label));
}

/** Full SIDEBAR_NAV_ITEMS for every account. */
export function accountSidebarItems(_type: AccountType): NavItem[] {
  return SIDEBAR_NAV_ITEMS.filter((item) => !isPersonalOnlySection(item.section));
}
