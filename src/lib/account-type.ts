/**
 * account-type.ts - legacy account-profile compatibility.
 *
 * Historical records persist one of two internal shapes, "personal" or
 * "business". They no longer select different customer language or a second
 * product. Both resolve into the same BotBound workspace and Bot journey.
 *
 * The value is not a security boundary. Server-side authorization still owns
 * data access; route filtering below is limited to plan capability.
 */
import { NAV_GROUPS, SIDEBAR_NAV_ITEMS, type NavItem } from "../constants/navigation";

export type AccountType = "personal" | "business";

/**
 * Resolve the persisted compatibility value from the billing plan id. The
 * free Builder keeps its legacy storage id; paid and unknown plans use the
 * established workspace id. Neither changes customer-facing product language.
 */
export function resolveAccountType(planId: string | null | undefined): AccountType {
  return planId === "personal" ? "personal" : "business";
}

/** Retained for callers that classify arbitrary legacy section labels. */
export function isBusinessOnlySection(_section: string | undefined): boolean {
  return false;
}

export function isPersonalOnlySection(_section: string | undefined): boolean {
  return false;
}

/** Legacy signature; both stored account values use the same workspace routes. */
export function isRouteAvailableForAccount(_type: AccountType, _path: string): boolean {
  return true;
}

/** NAV_GROUPS retained behind a compatibility signature; the IA is shared. */
export function accountNavGroups(_type: AccountType): Array<(typeof NAV_GROUPS)[number]> {
  return [...NAV_GROUPS];
}

/** SIDEBAR_NAV_ITEMS retained behind a compatibility signature; the IA is shared. */
export function accountSidebarItems(_type: AccountType): NavItem[] {
  return [...SIDEBAR_NAV_ITEMS];
}
