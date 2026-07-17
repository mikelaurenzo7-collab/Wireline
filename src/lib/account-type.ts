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
 * Business-only operating destinations (Activity / Insights) use the legacy
 * item `section: "Run"` from `toLegacyItem(..., "Run")`. Group labels in
 * NAV_GROUPS are "Set up" | "Work" — filter groups by label, items by section.
 *
 * Personal accounts keep Calls, Inbox, and Settings on Work.
 */
const BUSINESS_ONLY_GROUP_LABELS = new Set<string>(["Work"]);
const BUSINESS_ONLY_ITEM_SECTIONS = new Set<string>(["Run"]);
const PERSONAL_ONLY_GROUPS = new Set<string>(["Personal"]);
const PERSONAL_OPERATE_PATHS = new Set<string>(["/phone", "/inbox", "/settings"]);

/**
 * Resolve the account mode from the billing plan id. Only the "personal" tier
 * is a personal account; every other tier and an unknown or not-yet-loaded
 * plan resolves to "business" so an established workspace never has surfaces
 * stripped out from under it.
 */
export function resolveAccountType(planId: string | null | undefined): AccountType {
  return planId === "personal" ? "personal" : "business";
}

/** True when a nav item's section is a business-only Operate section. */
export function isBusinessOnlySection(section: string | undefined): boolean {
  return !!section && BUSINESS_ONLY_ITEM_SECTIONS.has(section);
}

export function isPersonalOnlySection(section: string | undefined): boolean {
  return !!section && PERSONAL_ONLY_GROUPS.has(section);
}

/** True when a route path is offered in the given account mode. */
export function isRouteAvailableForAccount(type: AccountType, path: string): boolean {
  if (type === "business") return true;
  const item = SIDEBAR_NAV_ITEMS.find((i) => i.path === path);
  if (!item) return true;
  if (!isBusinessOnlySection(item.section)) return true;
  return PERSONAL_OPERATE_PATHS.has(item.path);
}

/** NAV_GROUPS filtered for the account mode (Work kept, business-only items trimmed). */
export function accountNavGroups(type: AccountType): Array<(typeof NAV_GROUPS)[number]> {
  if (type === "business") {
    return NAV_GROUPS.filter((group) => !PERSONAL_ONLY_GROUPS.has(group.label));
  }
  return NAV_GROUPS.map((group) => {
    if (!BUSINESS_ONLY_GROUP_LABELS.has(group.label)) return group;
    return {
      ...group,
      items: group.items.filter(
        (item) => !isBusinessOnlySection(item.section) || PERSONAL_OPERATE_PATHS.has(item.path),
      ),
    };
  }).filter((group) => group.items.length > 0);
}

/** SIDEBAR_NAV_ITEMS filtered for the account mode. */
export function accountSidebarItems(type: AccountType): NavItem[] {
  if (type === "business") {
    return SIDEBAR_NAV_ITEMS.filter((item) => !isPersonalOnlySection(item.section));
  }
  return SIDEBAR_NAV_ITEMS.filter(
    (item) => !isBusinessOnlySection(item.section) || PERSONAL_OPERATE_PATHS.has(item.path),
  );
}
