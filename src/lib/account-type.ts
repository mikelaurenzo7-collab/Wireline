/**
 * account-type.ts - Personal vs Business account mode.
 *
 * A Wireline account is one of two shapes:
 *   - "personal" - one Bot on the user's own channels. Studio, Inbox, Calls,
 *     Connections, and Settings remain available; team-oriented analytics and
 *     approvals stay out of the primary experience.
 *   - "business" - the full workspace, including multi-Bot operating activity.
 *
 * The mode is a product lens over the same app, not a security boundary.
 * Server-side authorization still owns data access. This module owns which
 * destinations the shell offers for each mode.
 */
import { NAV_GROUPS, SIDEBAR_NAV_ITEMS, type NavItem } from "../constants/navigation";

export type AccountType = "personal" | "business";

const PERSONAL_HIDDEN_PATHS = new Set<string>(["/insights"]);

/**
 * Resolve the account mode from the billing plan id. Only the "personal" tier
 * is a personal account; every other tier and an unknown/not-yet-loaded plan
 * resolves to business so an established workspace never has surfaces removed
 * transiently while billing state loads.
 */
export function resolveAccountType(planId: string | null | undefined): AccountType {
  return planId === "personal" ? "personal" : "business";
}

/** Retained for callers that classify arbitrary legacy section labels. */
export function isBusinessOnlySection(section: string | undefined): boolean {
  return section === "Run" || section === "Analytics";
}

export function isPersonalOnlySection(section: string | undefined): boolean {
  return section === "Personal";
}

/** True when a route path is offered in the given account mode. */
export function isRouteAvailableForAccount(type: AccountType, path: string): boolean {
  if (type === "business") return true;
  return !PERSONAL_HIDDEN_PATHS.has(path);
}

/** NAV_GROUPS filtered for the account mode while preserving the shared IA. */
export function accountNavGroups(type: AccountType): Array<(typeof NAV_GROUPS)[number]> {
  if (type === "business") {
    return NAV_GROUPS.filter((group) => !isPersonalOnlySection(group.label));
  }

  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !PERSONAL_HIDDEN_PATHS.has(item.path)),
  })).filter((group) => group.items.length > 0);
}

/** SIDEBAR_NAV_ITEMS filtered for the account mode. */
export function accountSidebarItems(type: AccountType): NavItem[] {
  if (type === "business") {
    return SIDEBAR_NAV_ITEMS.filter((item) => !isPersonalOnlySection(item.section));
  }
  return SIDEBAR_NAV_ITEMS.filter((item) => !PERSONAL_HIDDEN_PATHS.has(item.path));
}
