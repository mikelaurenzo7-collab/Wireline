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
  LifeBuoy,
  Kanban,
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
      { label: "Pipeline", path: "/pipeline", icon: Kanban },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Integrations", path: "/integrations", icon: PlugZap },
      { label: "Settings", path: "/admin", icon: ServerCog, matches: ["/dnc", "/audit"] },
      { label: "Help", path: "/help", icon: LifeBuoy },
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
  "/help": "Help",
  "/pipeline": "Pipeline",
};

export const ROUTE_ACCENTS: Record<string, [string, string]> = {
  "/": ["#D97752", "#D97752"],
  "/triage": ["#FFC07D", "#D97752"],
  "/live": ["#D97752", "#10B981"],
  "/insights": ["#D97752", "#D97752"],
  "/logs": ["#D97752", "#D97752"],
  "/inbox": ["#D97752", "#D97752"],
  "/outbound": ["#D97752", "#FFC07D"],
  "/appointments": ["#10B981", "#D97752"],
  "/agents": ["#D97752", "#D97752"],
  "/train": ["#D97752", "#D97752"],
  "/knowledge": ["#10B981", "#D97752"],
  "/integrations": ["#D97752", "#10B981"],
  "/admin": ["#D97752", "#D97752"],
  "/dnc": ["#D97752", "#FF6B6B"],
  "/audit": ["#D97752", "#FFC07D"],
  "/help": ["#10B981", "#D97752"],
  "/pipeline": ["#D97752", "#10B981"],
};

export function getRouteAccent(pathname: string): [string, string] {
  if (ROUTE_ACCENTS[pathname]) return ROUTE_ACCENTS[pathname];
  const prefix = "/" + pathname.split("/")[1];
  return ROUTE_ACCENTS[prefix] ?? ["#D97752", "#D97752"];
}
