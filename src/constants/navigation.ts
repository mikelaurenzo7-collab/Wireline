import type { CSSProperties, ComponentType } from "react";
import {
  BarChart3,
  Bot,
  CheckSquare,
  GraduationCap,
  Home,
  Inbox,
  LayoutGrid,
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
  icon: ComponentType<{ className?: string; strokeWidth?: number; style?: CSSProperties }>;
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

export const WORKSPACE_NAV: ShellNavItem[] = [
  {
    href: "/overview",
    label: "Overview",
    shortLabel: "Home",
    icon: Home,
    matches: ["/overview", "/agents"],
  },
  {
    href: "/knowledge",
    label: "Training",
    shortLabel: "Train",
    icon: GraduationCap,
    matches: ["/knowledge", "/training"],
  },
  { href: "/connections", label: "Wire", icon: Workflow, matches: ["/connections", "/actions"] },
];

export const OPERATE_NAV: ShellNavItem[] = [
  { href: "/phone", label: "Phone", icon: Phone },
  { href: "/approvals", label: "Approvals", shortLabel: "Approve", icon: CheckSquare },
  { href: "/insights", label: "Insights", icon: BarChart3 },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/apps", label: "Apps", icon: LayoutGrid },
  { href: "/settings", label: "Settings", icon: Settings, matches: ["/settings", "/admin"] },
];

export const MOBILE_PRIMARY_NAV: ShellNavItem[] = [
  {
    href: "/overview",
    label: "Overview",
    shortLabel: "Home",
    icon: Home,
    matches: ["/overview", "/agents"],
  },
  { href: "/studio", label: "Studio", icon: Bot, matches: ["/studio", "/agents"] },
  { href: "/phone", label: "Phone", icon: Phone },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: MOBILE_MORE_HREF, label: "More", icon: MoreHorizontal },
];

export const MOBILE_MORE_NAV: ShellNavItem[] = [
  {
    href: "/knowledge",
    label: "Training",
    shortLabel: "Train",
    icon: GraduationCap,
    matches: ["/knowledge", "/training"],
  },
  { href: "/connections", label: "Wire", icon: Workflow, matches: ["/connections", "/actions"] },
  { href: "/approvals", label: "Approvals", shortLabel: "Approve", icon: CheckSquare },
  { href: "/insights", label: "Insights", icon: BarChart3 },
  { href: "/apps", label: "Apps", icon: LayoutGrid },
  { href: "/settings", label: "Settings", icon: Settings, matches: ["/settings", "/admin"] },
];

function toLegacyItem(item: ShellNavItem, section: string): NavItem {
  return {
    label: item.label,
    path: item.href,
    icon: item.icon,
    matches: item.matches,
    // Settings is shared across personal and business workspaces (legacy sidebar filter).
    section: item.href === "/settings" ? "Workspace" : section,
  };
}

export const NAV_GROUPS = [
  {
    label: "Workspace",
    items: WORKSPACE_NAV.map((item) => toLegacyItem(item, "Workspace")),
  },
  {
    label: "Operate",
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
      current.startsWith("/admin/")
    );
  }
  if (target === "/studio") {
    return current === "/studio" || current.startsWith("/studio/") || current === "/agents";
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
  return SIDEBAR_NAV_ITEMS.find(
    (item) =>
      pathname === item.path ||
      item.matches?.some((match) => pathname === match || pathname.startsWith(`${match}/`)),
  );
}

export const PAGE_TITLES: Record<string, string> = {
  "/overview": "Overview",
  "/studio": "Studio",
  "/knowledge": "Training",
  "/connections": "Wire",
  "/phone": "Phone",
  "/approvals": "Approvals",
  "/insights": "Insights",
  "/inbox": "Inbox",
  "/apps": "Apps",
  "/settings": "Settings",
};

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
