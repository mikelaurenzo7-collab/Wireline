import {
  Users,
  Activity,
  MessageSquare,
  ServerCog,
  PlugZap,
  Radio,
  Inbox,
  BarChart3,
  LayoutGrid,
} from "lucide-react";

export type NavItem = {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  badge?: number;
  dataTour?: string;
  matches?: string[];
};

// Consolidated horizontal nav. Command Center + Dashboard merged into a single
// Home route at "/" (LayoutGrid icon). /command and /dashboard redirect to /.
// Groups stay for visual separation in the top bar (subtle dividers between
// groups), but each item is a flat tab.
export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Workspace",
    items: [
      {
        label: "Home",
        path: "/",
        icon: LayoutGrid,
        dataTour: "dashboard",
        matches: ["/dashboard", "/command", "/live"],
      },
      { label: "Triage", path: "/triage", icon: Inbox },
      { label: "Insights", path: "/insights", icon: BarChart3, dataTour: "insights" },
    ],
  },
  {
    label: "Fleet",
    items: [
      { label: "Agents", path: "/agents", icon: Users, dataTour: "agents" },
      {
        label: "Training",
        path: "/train",
        icon: MessageSquare,
        dataTour: "training",
        matches: ["/knowledge"],
      },
    ],
  },
  {
    label: "Channels",
    items: [
      {
        label: "Channels",
        path: "/logs",
        icon: Radio,
        matches: ["/outbound", "/inbox", "/appointments"],
      },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Integrations", path: "/integrations", icon: PlugZap },
      { label: "Settings", path: "/admin", icon: ServerCog, matches: ["/dnc", "/audit"] },
    ],
  },
];

export const PAGE_TITLES: Record<string, string> = {
  "/": "Home",
  "/triage": "Triage",
  "/appointments": "Appointments",
  "/logs": "Call Logs",
  "/inbox": "Email",
  "/outbound": "Outbound",
  "/insights": "Insights",
  "/live": "Live Monitor",
  "/train": "Training",
  "/knowledge": "Knowledge",
  "/agents": "Agents",
  "/integrations": "Integrations",
  "/admin": "Settings",
};

export const ROUTE_ACCENTS: Record<string, [string, string]> = {
  "/": ["#0AC8D4", "#9B59F5"],
  "/triage": ["#FFC07D", "#E040C0"],
  "/live": ["#0AC8D4", "#10B981"],
  "/insights": ["#9B59F5", "#E040C0"],
  "/logs": ["#0AC8D4", "#9B59F5"],
  "/inbox": ["#9B59F5", "#0AC8D4"],
  "/outbound": ["#E040C0", "#FFC07D"],
  "/appointments": ["#10B981", "#0AC8D4"],
  "/agents": ["#0AC8D4", "#9B59F5"],
  "/train": ["#9B59F5", "#0AC8D4"],
  "/knowledge": ["#10B981", "#9B59F5"],
  "/integrations": ["#0AC8D4", "#10B981"],
  "/admin": ["#9B59F5", "#0AC8D4"],
  "/dnc": ["#E040C0", "#FF6B6B"],
  "/audit": ["#9B59F5", "#FFC07D"],
};

export function getRouteAccent(pathname: string): [string, string] {
  if (ROUTE_ACCENTS[pathname]) return ROUTE_ACCENTS[pathname];
  const prefix = "/" + pathname.split("/")[1];
  return ROUTE_ACCENTS[prefix] ?? ["#0AC8D4", "#E040C0"];
}
