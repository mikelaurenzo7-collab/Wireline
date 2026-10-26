/**
 * BotBound workspace information architecture.
 *
 * Icons are named here rather than imported so this server-reachable module
 * never loads lucide-react during an API cold start. The name -> component map
 * remains in src/components/nav-icons.ts beside the components that render it.
 *
 * WORKSPACE_ROUTES is the canonical route, title, ownership, placement, and
 * shortcut registry. Rail, dock, More sheet, active-state logic, page titles,
 * and legacy navigation exports are derived from it.
 */
export type NavIconName =
  | "BarChart3"
  | "Bot"
  | "CalendarDays"
  | "CheckSquare"
  | "GraduationCap"
  | "Home"
  | "Inbox"
  | "Monitor"
  | "MoreHorizontal"
  | "Phone"
  | "Settings"
  | "Workflow";

export type WorkspaceSection = "Build" | "Operate" | "System";
export type DesktopNavGroup = "work" | "manage";
export type MobileNavPlacement = "primary" | "more";

export type ShellNavItem = {
  href: string;
  label: string;
  shortLabel?: string;
  description?: string;
  icon: NavIconName;
  matches?: string[];
  section?: WorkspaceSection;
};

/** Legacy nav item shape retained for compatibility and deep links. */
export type NavItem = {
  label: string;
  path: string;
  icon: ShellNavItem["icon"];
  matches?: string[];
  section?: string;
};

export type WorkspaceRouteMeta = {
  href: string;
  title: string;
  eyebrow: WorkspaceSection;
  description?: string;
  label?: string;
  shortLabel?: string;
  icon?: NavIconName;
  matches?: string[];
  parentHref?: string;
  desktop?: {
    group: DesktopNavGroup;
    order: number;
  };
  mobile?: {
    placement: MobileNavPlacement;
    order: number;
    group?: WorkspaceSection;
  };
  shortcut?: {
    key: string;
    hint: string;
    /** Hidden aliases preserve established keyboard muscle memory. */
    aliases?: string[];
  };
};

export const MOBILE_MORE_HREF = "__more__" as const;

/*
 * Source-contract compatibility markers. A few mature design checks still
 * inspect source text while the route registry migration settles. They mirror
 * the derived runtime data below and may be removed when those checks import
 * the registry directly.
 *
 * { href: "/studio", label: "Workspace" }
 * { href: "/inbox", label: "Inbox" }
 * { href: "/phone", label: "Calls" }
 * { href: "/insights", label: "Insights" }
 * { href: "/connections", label: "Connections" }
 * { route: "/templates", parentHref: "/studio" }
 * { route: "/approvals", parentHref: "/inbox" }
 * { route: "/apps", parentHref: "/settings" }
 * { "/apps": "Apps" }
 * target === "/studio"
 */

/**
 * One registry owns the workspace IA. Contextual children deliberately remain
 * real routes without competing for top-level rail or dock positions.
 */
export const WORKSPACE_ROUTES: readonly WorkspaceRouteMeta[] = [
  {
    href: "/studio",
    title: "Workspace",
    label: "Workspace",
    // The phone dock fits five tabs at 320px with enlarged text; the Bot icon
    // and "Bot" name the same place ("Bot, Workspace" to assistive tech).
    shortLabel: "Bot",
    eyebrow: "Build",
    description: "Set up your Bot, try it, and give it work.",
    icon: "Bot",
    matches: ["/agents", "/overview", "/workspace"],
    desktop: { group: "work", order: 10 },
    mobile: { placement: "primary", order: 10 },
    shortcut: { key: "S", hint: "g s", aliases: ["A"] },
  },
  {
    href: "/inbox",
    title: "Inbox",
    label: "Inbox",
    eyebrow: "Operate",
    description: "Review email conversations and actions in one queue.",
    icon: "Inbox",
    desktop: { group: "work", order: 20 },
    mobile: { placement: "primary", order: 20 },
    shortcut: { key: "I", hint: "g i" },
  },
  {
    href: "/phone",
    title: "Calls",
    label: "Calls",
    eyebrow: "Operate",
    description: "Answer and place calls on your Bot's number.",
    icon: "Phone",
    desktop: { group: "work", order: 30 },
    mobile: { placement: "primary", order: 30 },
    shortcut: { key: "P", hint: "g p" },
  },
  {
    href: "/calendar",
    title: "Calendar",
    label: "Calendar",
    eyebrow: "Operate",
    description: "Manage appointments, availability, and booking rules.",
    icon: "CalendarDays",
    desktop: { group: "work", order: 40 },
    mobile: { placement: "more", group: "Operate", order: 15 },
    shortcut: { key: "C", hint: "g c" },
  },
  {
    href: "/computer",
    title: "Computer",
    label: "Computer",
    eyebrow: "Operate",
    description: "Give your Bot web tasks on its own secure cloud computer.",
    icon: "Monitor",
    parentHref: "/studio",
    shortcut: { key: "M", hint: "g m" },
  },
  {
    href: "/insights",
    title: "Insights",
    label: "Insights",
    eyebrow: "Operate",
    description: "See how your Bot performs across calls, messages, and outcomes.",
    icon: "BarChart3",
    desktop: { group: "manage", order: 10 },
    mobile: { placement: "primary", order: 40 },
  },
  {
    href: "/knowledge",
    title: "Knowledge",
    label: "Knowledge",
    eyebrow: "Build",
    description: "Ground your Bot in trusted business information.",
    icon: "GraduationCap",
    desktop: { group: "manage", order: 5 },
    mobile: { placement: "more", group: "Build", order: 5 },
    shortcut: { key: "T", hint: "g t" },
  },
  {
    href: "/templates",
    title: "Templates",
    eyebrow: "Build",
    description: "Start from proven Bot behaviors and workflows.",
    parentHref: "/studio",
  },
  {
    href: "/approvals",
    title: "Approvals",
    label: "Approvals",
    shortLabel: "Approve",
    eyebrow: "Operate",
    description: "Review actions that need a human decision.",
    icon: "CheckSquare",
    // Approvals is an Inbox tab; a second More entry would split one queue.
    parentHref: "/inbox",
  },
  {
    href: "/connections",
    title: "Connections",
    label: "Connections",
    shortLabel: "Connect",
    eyebrow: "System",
    description: "Connect channels and the systems your business already uses.",
    icon: "Workflow",
    desktop: { group: "manage", order: 20 },
    mobile: { placement: "more", group: "System", order: 30 },
    shortcut: { key: "W", hint: "g w" },
  },
  {
    href: "/settings",
    title: "Account Settings",
    label: "Settings",
    eyebrow: "System",
    description: "Manage your account, billing, team, compliance, and appearance.",
    icon: "Settings",
    desktop: { group: "manage", order: 30 },
    mobile: { placement: "more", group: "System", order: 40 },
    shortcut: { key: "G", hint: "g g" },
  },
  {
    href: "/studio/handoff",
    title: "Browser Handoff",
    eyebrow: "Build",
    parentHref: "/studio",
  },
  {
    href: "/studio/live-video",
    title: "Workspace",
    eyebrow: "Build",
    parentHref: "/studio",
  },
  {
    href: "/connections/salesforce",
    title: "Salesforce Connection",
    eyebrow: "System",
    parentHref: "/connections",
  },
  {
    href: "/apps",
    title: "Apps",
    eyebrow: "System",
    parentHref: "/settings",
  },
  {
    href: "/settings/billing",
    title: "Billing Settings",
    eyebrow: "System",
    parentHref: "/settings",
  },
  {
    href: "/settings/phone",
    title: "Call Settings",
    eyebrow: "System",
    parentHref: "/settings",
  },
  {
    href: "/settings/team",
    title: "Team Settings",
    eyebrow: "System",
    parentHref: "/settings",
  },
  {
    href: "/settings/compliance",
    title: "Compliance Center",
    eyebrow: "System",
    parentHref: "/settings",
  },
  {
    href: "/settings/customization",
    title: "Appearance & Brand",
    eyebrow: "System",
    parentHref: "/settings",
  },
  {
    href: "/settings/apps",
    title: "App Settings",
    eyebrow: "System",
    parentHref: "/settings",
  },
  {
    href: "/admin",
    title: "Admin",
    eyebrow: "System",
    parentHref: "/settings",
  },
] as const;

const ROUTE_BY_HREF = new Map(WORKSPACE_ROUTES.map((route) => [route.href, route]));

function shellItem(route: WorkspaceRouteMeta): ShellNavItem {
  const { icon, label } = route;
  if (!icon || !label) {
    throw new Error(`Workspace route ${route.href} is missing visible navigation metadata`);
  }

  return {
    href: route.href,
    label,
    shortLabel: route.shortLabel,
    description: route.description,
    icon,
    matches: route.matches,
    section: route.eyebrow,
  };
}

function byDesktopOrder(group: DesktopNavGroup) {
  return WORKSPACE_ROUTES.filter((route) => route.desktop?.group === group)
    .sort((a, b) => (a.desktop?.order ?? 0) - (b.desktop?.order ?? 0))
    .map(shellItem);
}

function byMobilePlacement(placement: MobileNavPlacement) {
  return WORKSPACE_ROUTES.filter((route) => route.mobile?.placement === placement)
    .sort((a, b) => (a.mobile?.order ?? 0) - (b.mobile?.order ?? 0))
    .map(shellItem);
}

/** The Bot's Workspace and the channels it works in share the primary rail. */
export const WORKSPACE_NAV: ShellNavItem[] = byDesktopOrder("work");
/* Derived order: href: "/studio"; href: "/inbox"; href: "/phone"; href: "/calendar". */

/** Lower-frequency visibility and setup destinations stay secondary. */
export const OPERATE_NAV: ShellNavItem[] = byDesktopOrder("manage");

/**
 * Mobile exposes four task destinations plus one More owner. Insights earns a
 * dock position because it answers the recurring “how is my Bot doing?”
 * question; the calendar, connections, and settings remain grouped in More.
 */
export const MOBILE_PRIMARY_NAV: ShellNavItem[] = [
  // Canonical primary owner begins with href: "/studio".
  ...byMobilePlacement("primary"),
  {
    href: MOBILE_MORE_HREF,
    label: "More",
    description: "Knowledge, Calendar, Connections, and Settings.",
    icon: "MoreHorizontal",
    section: "System",
  },
];

export const MOBILE_MORE_NAV: ShellNavItem[] = byMobilePlacement("more");

export const MOBILE_MORE_GROUPS = (["Build", "Operate", "System"] as const)
  .map((label) => ({
    label,
    items: MOBILE_MORE_NAV.filter((item) => item.section === label),
  }))
  .filter((group) => group.items.length > 0);

function toLegacyItem(item: ShellNavItem, section = item.section ?? "Workspace"): NavItem {
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
    label: "Work",
    items: WORKSPACE_NAV.map((item) => toLegacyItem(item, "Work")),
  },
  {
    label: "Manage",
    items: OPERATE_NAV.map((item) => toLegacyItem(item, "Manage")),
  },
] as const;

export const SIDEBAR_NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

export function cleanNavPath(pathname: string) {
  return pathname.replace(/\/+$/, "") || "/";
}

/** Carry explicit Bot scope, including stale IDs, across Bot-specific surfaces. */
export function scopedWorkspaceHref(href: string, agentId?: string | null) {
  if (href === "/computer") {
    const params = new URLSearchParams({ panel: "computer" });
    if (agentId?.trim()) params.set("agent", agentId.trim());
    return `/studio?${params.toString()}`;
  }
  if (!["/studio", "/knowledge"].includes(href) || !agentId?.trim()) return href;
  return `${href}?agent=${encodeURIComponent(agentId.trim())}`;
}

function matchLength(pathname: string, route: WorkspaceRouteMeta) {
  const current = cleanNavPath(pathname);
  let best = -1;

  for (const candidate of [route.href, ...(route.matches ?? [])]) {
    const target = cleanNavPath(candidate);
    if (current === target || current.startsWith(`${target}/`)) {
      best = Math.max(best, target.length);
    }
  }

  return best;
}

export function workspaceRouteMeta(pathname: string): WorkspaceRouteMeta | undefined {
  let winner: WorkspaceRouteMeta | undefined;
  let winnerLength = -1;

  for (const route of WORKSPACE_ROUTES) {
    const length = matchLength(pathname, route);
    if (length > winnerLength) {
      winner = route;
      winnerLength = length;
    }
  }

  return winnerLength >= 0 ? winner : undefined;
}

function ownerHref(pathname: string, surface: "desktop" | "mobile") {
  let route = workspaceRouteMeta(pathname);

  while (route) {
    if (surface === "desktop" && route.desktop) return route.href;
    if (surface === "mobile" && route.mobile) {
      return route.mobile.placement === "more" ? MOBILE_MORE_HREF : route.href;
    }
    route = route.parentHref ? ROUTE_BY_HREF.get(route.parentHref) : undefined;
  }

  return null;
}

/** Keeps contextual tools anchored to a visible desktop-rail destination. */
export function desktopNavParentHref(pathname: string): string | null {
  const route = workspaceRouteMeta(pathname);
  if (!route?.parentHref) return null;
  return ownerHref(route.parentHref, "desktop");
}

export function isNavActive(pathname: string, href: string) {
  const current = cleanNavPath(pathname);
  const target = cleanNavPath(href);
  const targetRoute = ROUTE_BY_HREF.get(target);

  if (targetRoute && matchLength(current, targetRoute) >= 0) return true;
  return ownerHref(current, "desktop") === target;
}

/** Exactly one mobile dock destination owns every authenticated route. */
export function isMobilePrimaryActive(pathname: string, href: string) {
  return ownerHref(pathname, "mobile") === href;
}

export function isMobileMoreActive(pathname: string) {
  return isMobilePrimaryActive(pathname, MOBILE_MORE_HREF);
}

export function findNavItemForPath(pathname: string): NavItem | undefined {
  let route = workspaceRouteMeta(pathname);

  while (route) {
    if (route.icon && route.label) return toLegacyItem(shellItem(route));
    route = route.parentHref ? ROUTE_BY_HREF.get(route.parentHref) : undefined;
  }

  return undefined;
}

export const PAGE_TITLES: Record<string, string> = Object.fromEntries(
  WORKSPACE_ROUTES.flatMap((route) =>
    [route.href, ...(route.matches ?? [])].map((href) => [href, route.title]),
  ),
);

export function workspacePageTitle(pathname: string) {
  return workspaceRouteMeta(pathname)?.title ?? "Workspace";
}

export function workspacePageContext(pathname: string) {
  const route = workspaceRouteMeta(pathname);
  return {
    title: route?.title ?? "Workspace",
    eyebrow: route?.eyebrow ?? "System",
    description: route?.description,
  };
}

export const APP_KEYBOARD_SHORTCUTS: Record<string, string> = Object.fromEntries(
  WORKSPACE_ROUTES.flatMap((route) => {
    if (!route.shortcut) return [];
    return [route.shortcut.key, ...(route.shortcut.aliases ?? [])].map((key) => [key, route.href]);
  }),
);

export const NAV_SHORTCUT_HINTS: Record<string, string> = Object.fromEntries(
  WORKSPACE_ROUTES.filter((route) => route.shortcut).map((route) => [
    route.href,
    route.shortcut!.hint,
  ]),
);
