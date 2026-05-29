import {
  MessagesSquare,
  Radio,
  Inbox,
  BarChart3,
  LayoutGrid,
  Kanban,
  Headphones,
  SlidersHorizontal,
} from "lucide-react";

export type NavItem = {
  label: string;
  path: string;
  icon: React.ComponentType<{
    className?: string;
    strokeWidth?: number;
    style?: React.CSSProperties;
  }>;
  badge?: number;
  dataTour?: string;
  matches?: string[];
  /** When true, the item only renders for the platform owner. */
  ownerOnly?: boolean;
};

export type RouteContext = {
  eyebrow?: string;
  title: string;
};

// Three-group nav. Workspace = where you watch, decide, and run the fleet.
// Activity = where conversations live + close. Settings sits as the trailing
// tab since it's daily-touch (Branding, Carrier, Billing) — not buried in a
// profile dropdown.
//
// Training no longer earns its own surface: each agent is trained, wired, and
// remembered inside ITS OWN chat (Chat · Training · Connectors · Memory tabs),
// so the Director + per-agent threads under "Chat" are the single home for
// building and coaching the fleet. Agents (roster + creation) live under
// Settings — operators rarely add agents, so it doesn't earn a top-nav slot.
//
// Architecture note: /cockpit is its OWN page (SupervisorCockpit), distinct
// from /ops (LiveOps). Live Ops is the owner's pulse — calls + actions + intel.
// Cockpit is the floor supervisor's view — agent availability + listen-in.
export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Workspace",
    items: [
      {
        label: "Chat",
        path: "/chat",
        icon: MessagesSquare,
        dataTour: "chat",
        matches: ["/chat"],
      },
      {
        label: "Live Ops",
        path: "/ops",
        icon: LayoutGrid,
        dataTour: "dashboard",
        matches: ["/dashboard", "/command", "/live"],
      },
      { label: "Triage", path: "/triage", icon: Inbox },
      { label: "Insights", path: "/insights", icon: BarChart3, dataTour: "insights" },
      { label: "Cockpit", path: "/cockpit", icon: Headphones },
    ],
  },
  {
    label: "Activity",
    items: [
      {
        label: "Activity",
        path: "/logs",
        icon: Radio,
        matches: ["/outbound", "/inbox", "/appointments", "/sms"],
      },
      { label: "Pipeline", path: "/pipeline", icon: Kanban },
    ],
  },
  {
    label: "Admin",
    items: [
      {
        label: "Settings",
        path: "/admin",
        icon: SlidersHorizontal,
        dataTour: "settings",
        matches: ["/integrations", "/dnc", "/audit", "/agents"],
      },
    ],
  },
];

export const PAGE_TITLES: Record<string, string> = {
  "/ops": "Live Ops",
  "/triage": "Triage",
  "/appointments": "Appointments",
  "/logs": "Call Logs",
  "/inbox": "Email",
  "/sms": "SMS",
  "/outbound": "Outbound",
  "/insights": "Insights",
  "/cockpit": "Supervisor Cockpit",
  "/knowledge": "Knowledge",
  "/agents": "Agents",
  "/chat": "Chat",
  "/founder": "Founder",
  "/integrations": "Integrations",
  "/admin": "Settings",
  "/dnc": "DNC List",
  "/audit": "Audit Log",
  "/help": "Help",
  "/pipeline": "Pipeline",
};

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (pathname === item.path) return true;
  if (!item.matches) return false;
  return item.matches.some((m) => pathname === m || pathname.startsWith(`${m}/`));
}

export function resolveNavBadge(item: NavItem, navBadges: Record<string, number>): number {
  return (
    (navBadges[item.path] ?? 0) +
    (item.matches?.reduce((sum, m) => sum + (navBadges[m] ?? 0), 0) ?? 0)
  );
}

function routeContextForKnownPath(pathname: string): RouteContext | null {
  const title = PAGE_TITLES[pathname];
  if (!title) return null;
  const eyebrow = NAV_GROUPS.find((group) =>
    group.items.some((item) => isNavItemActive(item, pathname)),
  )?.label;
  return eyebrow ? { eyebrow, title } : { title };
}

export function getRouteContext(pathname: string): RouteContext | null {
  const exact = routeContextForKnownPath(pathname);
  if (exact) return exact;

  if (pathname.startsWith("/contact/")) {
    return { eyebrow: "Activity", title: "Contact Profile" };
  }

  const segments = pathname.split("/").filter(Boolean);
  while (segments.length > 1) {
    segments.pop();
    const candidate = `/${segments.join("/")}`;
    const context = routeContextForKnownPath(candidate);
    if (context) return context;
  }

  const prefix = `/${pathname.split("/").filter(Boolean)[0] || ""}`;
  return prefix === "/" ? null : routeContextForKnownPath(prefix);
}

export const ROUTE_ACCENTS: Record<string, [string, string]> = {
  "/ops": ["#4F1E7B", "#10B981"],
  "/triage": ["#FFC07D", "#4F1E7B"],
  "/insights": ["#4F1E7B", "#FFC07D"],
  "/logs": ["#4F1E7B", "#3B154C"],
  "/inbox": ["#4F1E7B", "#10B981"],
  "/sms": ["#4F1E7B", "#10B981"],
  "/outbound": ["#4F1E7B", "#FFC07D"],
  "/appointments": ["#10B981", "#4F1E7B"],
  "/agents": ["#4F1E7B", "#3B154C"],
  "/chat": ["#4F1E7B", "#10B981"],
  "/knowledge": ["#10B981", "#4F1E7B"],
  "/integrations": ["#4F1E7B", "#10B981"],
  "/admin": ["#4F1E7B", "#3B154C"],
  "/cockpit": ["#4F1E7B", "#10B981"],
  "/dnc": ["#4F1E7B", "#E8466A"],
  "/audit": ["#4F1E7B", "#FFC07D"],
  "/help": ["#10B981", "#4F1E7B"],
  "/pipeline": ["#4F1E7B", "#10B981"],
  "/founder": ["#4F1E7B", "#FFC07D"],
};

export function getRouteAccent(pathname: string): [string, string] {
  if (ROUTE_ACCENTS[pathname]) return ROUTE_ACCENTS[pathname];
  const prefix = "/" + pathname.split("/")[1];
  return ROUTE_ACCENTS[prefix] ?? ["#4F1E7B", "#4F1E7B"];
}
