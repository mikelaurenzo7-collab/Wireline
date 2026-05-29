import {
  Users,
  MessageSquare,
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

// Three-group nav. Workspace = where you watch + decide. Fleet = where you
// build + manage agents. Activity = where conversations live + close.
// Settings sits as the trailing tab since it's daily-touch (Branding,
// Carrier, Billing) — not buried in a profile dropdown.
//
// Architecture note: /cockpit is its OWN page (SupervisorCockpit), distinct
// from / (LiveOps). Live Ops is the owner's pulse — calls + actions + intel.
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
        matches: ["/integrations", "/dnc", "/audit"],
      },
    ],
  },
];

export const PAGE_TITLES: Record<string, string> = {
  "/": "Live Ops",
  "/triage": "Triage",
  "/appointments": "Appointments",
  "/logs": "Call Logs",
  "/inbox": "Email",
  "/sms": "SMS",
  "/outbound": "Outbound",
  "/insights": "Insights",
  "/live": "Live Monitor",
  "/cockpit": "Supervisor Cockpit",
  "/train": "Training",
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

export const ROUTE_ACCENTS: Record<string, [string, string]> = {
  "/": ["#4F1E7B", "#10B981"],
  "/triage": ["#FFC07D", "#4F1E7B"],
  "/live": ["#4F1E7B", "#10B981"],
  "/insights": ["#4F1E7B", "#FFC07D"],
  "/logs": ["#4F1E7B", "#3B154C"],
  "/inbox": ["#4F1E7B", "#10B981"],
  "/sms": ["#4F1E7B", "#10B981"],
  "/outbound": ["#4F1E7B", "#FFC07D"],
  "/appointments": ["#10B981", "#4F1E7B"],
  "/agents": ["#4F1E7B", "#3B154C"],
  "/chat": ["#4F1E7B", "#10B981"],
  "/train": ["#4F1E7B", "#FFC07D"],
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
