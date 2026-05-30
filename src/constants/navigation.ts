import {
  MessagesSquare,
  Inbox,
  BarChart3,
  LayoutGrid,
  Kanban,
  SlidersHorizontal,
  GraduationCap,
  Phone,
  Mail,
  MessageCircle,
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

// Four-group nav: Workspace (command), Channels (communication surfaces),
// Sales (pipeline), Admin (settings).
//
// Chat remains the primary control surface — the Director + per-agent threads
// are mission control. Training has been elevated to its own sidebar page
// because the customization depth (knowledge, voices, pronunciation, simulator,
// flow) warrants dedicated real-estate rather than a buried tab.
//
// Channels group surfaces Phone, Email, and SMS as first-class pages — these
// are the communication arteries of the platform and operators need instant
// access without hunting through sub-routes.
//
// Live Ops (/ops) is the unified command center: live callers, supervisor
// floor tools (listen-in / whisper), action feed, and fleet analytics.
// /cockpit redirects here — one surface, no duplicate nav slot.
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
        label: "Training",
        path: "/training",
        icon: GraduationCap,
        dataTour: "training",
        matches: ["/knowledge"],
      },
      {
        label: "Live Ops",
        path: "/ops",
        icon: LayoutGrid,
        dataTour: "dashboard",
        matches: ["/dashboard", "/command", "/live", "/cockpit"],
      },
      { label: "Triage", path: "/triage", icon: Inbox },
      { label: "Insights", path: "/insights", icon: BarChart3, dataTour: "insights" },
    ],
  },
  {
    label: "Channels",
    items: [
      {
        label: "Phone",
        path: "/phone",
        icon: Phone,
        dataTour: "phone",
        matches: ["/logs", "/outbound", "/appointments", "/activity"],
      },
      {
        label: "Email",
        path: "/email",
        icon: Mail,
        dataTour: "email",
        matches: ["/inbox"],
      },
      {
        label: "SMS",
        path: "/sms",
        icon: MessageCircle,
        dataTour: "sms",
      },
    ],
  },
  {
    label: "Sales",
    items: [{ label: "Pipeline", path: "/pipeline", icon: Kanban }],
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
  "/phone": "Phone",
  "/inbox": "Email",
  "/email": "Email",
  "/sms": "SMS",
  "/outbound": "Outbound",
  "/insights": "Insights",
  "/cockpit": "Live Ops",
  "/knowledge": "Knowledge",
  "/agents": "Agents",
  "/chat": "Chat",
  "/training": "Training",
  "/founder": "Founder",
  "/integrations": "Integrations",
  "/admin": "Settings",
  "/dnc": "DNC List",
  "/audit": "Audit Log",
  "/help": "Help",
  "/pipeline": "Pipeline",
  "/activity": "Activity",
  "/contact": "Contact Profile",
};

/** g+key shortcuts — keep in sync with AppShell and Sidebar hints. */
export const APP_KEYBOARD_SHORTCUTS: Record<string, string> = {
  D: "/ops",
  T: "/triage",
  I: "/insights",
  A: "/agents",
  R: "/chat",
  N: "/training",
  P: "/phone",
  E: "/email",
  M: "/sms",
  S: "/admin",
};

export const NAV_SHORTCUT_HINTS: Record<string, string> = {
  "/ops": "g d",
  "/triage": "g t",
  "/insights": "g i",
  "/agents": "g a",
  "/chat": "g r",
  "/training": "g n",
  "/phone": "g p",
  "/email": "g e",
  "/sms": "g m",
  "/admin": "g s",
};

export const ROUTE_ACCENTS: Record<string, [string, string]> = {
  "/ops": ["#4F1E7B", "#10B981"],
  "/triage": ["#FFC07D", "#4F1E7B"],
  "/insights": ["#4F1E7B", "#FFC07D"],
  "/logs": ["#4F1E7B", "#3B154C"],
  "/phone": ["#4F1E7B", "#10B981"],
  "/inbox": ["#4F1E7B", "#10B981"],
  "/email": ["#4F1E7B", "#10B981"],
  "/sms": ["#4F1E7B", "#10B981"],
  "/outbound": ["#4F1E7B", "#FFC07D"],
  "/appointments": ["#10B981", "#4F1E7B"],
  "/agents": ["#4F1E7B", "#3B154C"],
  "/chat": ["#4F1E7B", "#10B981"],
  "/training": ["#F59E0B", "#4F1E7B"],
  "/knowledge": ["#10B981", "#4F1E7B"],
  "/integrations": ["#4F1E7B", "#10B981"],
  "/admin": ["#4F1E7B", "#3B154C"],
  "/cockpit": ["#4F1E7B", "#10B981"],
  "/dnc": ["#4F1E7B", "#E8466A"],
  "/audit": ["#4F1E7B", "#FFC07D"],
  "/help": ["#10B981", "#4F1E7B"],
  "/pipeline": ["#4F1E7B", "#10B981"],
  "/founder": ["#4F1E7B", "#FFC07D"],
  "/activity": ["#4F1E7B", "#3B154C"],
};

export function getRouteAccent(pathname: string): [string, string] {
  if (ROUTE_ACCENTS[pathname]) return ROUTE_ACCENTS[pathname];
  const prefix = "/" + pathname.split("/")[1];
  return ROUTE_ACCENTS[prefix] ?? ["#4F1E7B", "#4F1E7B"];
}

/** Route accent with tab/query awareness for ambience strip + context bar. */
export function getRouteAccentFromLocation(pathname: string, search = ""): [string, string] {
  const params = new URLSearchParams(search);
  if (pathname === "/ops") {
    const tab = params.get("tab");
    if (tab === "intel") return ["#FFC07D", "#4F1E7B"];
    if (tab === "analytics") return ["#10B981", "#4F1E7B"];
    return ROUTE_ACCENTS["/ops"];
  }
  if (pathname === "/phone") {
    const tab = params.get("tab");
    if (tab === "outbound") return ROUTE_ACCENTS["/outbound"];
    if (tab === "appointments") return ROUTE_ACCENTS["/appointments"];
    return ROUTE_ACCENTS["/phone"];
  }
  if (pathname === "/training") return ROUTE_ACCENTS["/training"];
  if (pathname.startsWith("/contact/")) return ["#4F1E7B", "#10B981"];
  return getRouteAccent(pathname);
}
