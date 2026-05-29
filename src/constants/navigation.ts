import {
  MessagesSquare,
  Radio,
  Inbox,
  BarChart3,
  LayoutGrid,
  Kanban,
  Headphones,
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
// Activity (history + pipeline), Admin (settings).
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
        label: "Training",
        path: "/training",
        icon: GraduationCap,
        dataTour: "training",
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
    label: "Channels",
    items: [
      {
        label: "Phone",
        path: "/phone",
        icon: Phone,
        dataTour: "phone",
        matches: ["/logs", "/outbound"],
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
    label: "Activity",
    items: [
      {
        label: "Activity",
        path: "/activity",
        icon: Radio,
        matches: ["/appointments"],
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
  "/phone": "Phone",
  "/inbox": "Email",
  "/email": "Email",
  "/sms": "SMS",
  "/outbound": "Outbound",
  "/insights": "Insights",
  "/cockpit": "Supervisor Cockpit",
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
