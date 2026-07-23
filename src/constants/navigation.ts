import type { CSSProperties, ComponentType } from "react";
import {
  BarChart3,
  Bot,
  CheckSquare,
  GraduationCap,
  Home,
  Inbox,
  MoreHorizontal,
  Phone,
  Settings,
  Workflow,
} from "lucide-react";

/** Canonical shell nav item — single source for rail, dock, and shortcuts. */
export type ShellNavItem = {
  href: string;
  label: string;
  shortLabel?: string;
  icon: ComponentType<{
    className?: string;
    size?: number | string;
    strokeWidth?: number;
    style?: CSSProperties;
    "aria-hidden"?: boolean | "true" | "false";
  }>;
  matches?: string[];
};

/** Legacy nav item shape for account-type filtering and deep links. */
export type NavItem = {
  label: string;
  path: string;
  icon: ShellNavItem["icon"];
  matches?: string[];
  section?: string;
};

export const MOBILE_MORE_HREF = "__more__" as const;

const DESKTOP_ROUTE_PARENTS: ReadonlyArray<{
  route: string;
  parentHref: string;
}> = [
  { route: "/templates", parentHref: "/studio" },
  { route: "/knowledge", parentHref: "/studio" },
  { route: "/approvals", parentHref: "/inbox" },
  { route: "/apps", parentHref: "/settings" },
];

/** Keeps secondary tools anchored to a visible desktop-rail destination. */
export function desktopNavParentHref(pathname: string): string | null {
  const current = cleanNavPath(pathname);
  return (
    DESKTOP_ROUTE_PARENTS.find(({ route }) => current === route || current.startsWith(`${route}/`))
      ?.parentHref ?? null
  );
}

/**
 * Primary setup destinations. Knowledge remains available as a contextual deep
 * link from the employee workspace rather than competing in the main rail.
 */
export const WORKSPACE_NAV: ShellNavItem[] = [
  {
    href: "/overview",
    label: "Overview",
    shortLabel: "Home",
    icon: Home,
    matches: ["/overview"],
  },
  {
    href: "/studio",
    label: "AI Employee",
    shortLabel: "Employee",
    icon: Bot,
    matches: ["/studio", "/agents"],
  },
  {
    href: "/connections",
    label: "Connections",
    shortLabel: "Connect",
    icon: Workflow,
    matches: ["/connections", "/actions"],
  },
];

/** Daily operating destinations. Approvals and training are secondary tools. */
export const OPERATE_NAV: ShellNavItem[] = [
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/phone", label: "Calls", icon: Phone },
  { href: "/insights", label: "Activity", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings, matches: ["/settings", "/admin"] },
];

export const MOBILE_PRIMARY_NAV: ShellNavItem[] = [
  {
    href: "/overview",
    label: "Overview",
    shortLabel: "Home",
    icon: Home,
    matches: ["/overview"],
  },
  {
    href: "/studio",
    label: "AI Employee",
    shortLabel: "Employee",
    icon: Bot,
    matches: ["/studio", "/agents"],
  },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/phone", label: "Calls", icon: Phone },
  { href: MOBILE_MORE_HREF, label: "More", icon: MoreHorizontal },
];

export const MOBILE_MORE_NAV: ShellNavItem[] = [
  {
    href: "/connections",
    label: "Connections",
    shortLabel: "Connect",
    icon: Workflow,
    matches: ["/connections", "/actions"],
  },
  {
    href: "/knowledge",
    label: "Knowledge",
    shortLabel: "Train",
    icon: GraduationCap,
    matches: ["/knowledge", "/training"],
  },
  { href: "/approvals", label: "Approvals", shortLabel: "Approve", icon: CheckSquare },
  { href: "/insights", label: "Activity", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings, matches: ["/settings", "/admin"] },
];

function toLegacyItem(item: ShellNavItem, section: string): NavItem {
  return {
    label: item.label,
    path: item.href,
    icon: item.icon,
    matches: item.matches,
    section: item.href === "/settings" ? "Workspace" : section,
  };
}

export const NAV_GROUPS = [
  {
    label: "Set up",
    items: WORKSPACE_NAV.map((item) => toLegacyItem(item, "Workspace")),
  },
  {
    label: "Work",
    items: OPERATE_NAV.map((item) => toLegacyItem(item, "Run")),
  },
] as const;

export const SIDEBAR_NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

export function cleanNavPath(pathname: string) {
  return pathname.replace(/\/+$/, "") || "/";
}

export function isNavActive(pathname: string, href: string) {
  const current = cleanNavPath(pathname);
  const target = cleanNavPath(href);
  if (target === "/settings") {
    return (
      current === "/settings" ||
      current.startsWith("/settings/") ||
      current === "/admin" ||
      current.startsWith("/admin/") ||
      current === "/apps" ||
      current.startsWith("/apps/")
    );
  }
  if (target === "/studio") {
    return (
      current === "/studio" ||
      current.startsWith("/studio/") ||
      current === "/agents" ||
      current === "/templates" ||
      current.startsWith("/templates/")
    );
  }
  const item = [...WORKSPACE_NAV, ...OPERATE_NAV, ...MOBILE_MORE_NAV].find(
    (nav) => nav.href === target,
  );
  if (item?.matches?.length) {
    return item.matches.some((match) => current === match || current.startsWith(`${match}/`));
  }
  return current === target || current.startsWith(`${target}/`);
}

export function isMobileMoreActive(pathname: string) {
  return MOBILE_MORE_NAV.some((item) => isNavActive(pathname, item.href));
}

export function findNavItemForPath(pathname: string): NavItem | undefined {
  const allItems = [
    ...SIDEBAR_NAV_ITEMS,
    ...MOBILE_MORE_NAV.map((item) => toLegacyItem(item, "More")),
  ];
  return allItems.find(
    (item) =>
      pathname === item.path ||
      item.matches?.some((match) => pathname === match || pathname.startsWith(`${match}/`)),
  );
}

export const PAGE_TITLES: Record<string, string> = {
  "/overview": "Overview",
  "/studio": "AI Employee",
  "/studio/handoff": "Browser handoff",
  "/templates": "Templates",
  "/knowledge": "Knowledge",
  "/connections": "Connections",
  "/connections/salesforce": "Salesforce connection",
  "/phone": "Calls",
  "/approvals": "Approvals",
  "/insights": "Activity",
  "/inbox": "Inbox",
  "/apps": "Apps",
  "/settings": "Settings",
  "/settings/billing": "Billing settings",
  "/settings/phone": "Call settings",
  "/settings/team": "Team settings",
  "/settings/compliance": "Compliance center",
  "/settings/customization": "Appearance & brand",
  "/settings/apps": "App settings",
  "/admin": "Admin",
};

export function workspacePageTitle(pathname: string) {
  const current = cleanNavPath(pathname);
  let bestMatch = "";
  let title = "Workspace";

  for (const [route, routeTitle] of Object.entries(PAGE_TITLES)) {
    if ((current === route || current.startsWith(`${route}/`)) && route.length > bestMatch.length) {
      bestMatch = route;
      title = routeTitle;
    }
  }

  return title;
}

export const APP_KEYBOARD_SHORTCUTS: Record<string, string> = {
  A: "/overview",
  S: "/studio",
  T: "/knowledge",
  W: "/connections",
  P: "/phone",
  I: "/inbox",
  G: "/settings",
};

export const NAV_SHORTCUT_HINTS: Record<string, string> = {
  "/overview": "g a",
  "/studio": "g s",
  "/knowledge": "g t",
  "/connections": "g w",
  "/phone": "g p",
  "/inbox": "g i",
  "/settings": "g g",
};
