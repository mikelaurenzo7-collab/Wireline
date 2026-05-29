import { MessagesSquare, Radio, Plug, SlidersHorizontal } from "lucide-react";

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

// Radically simplified, chat-centric nav. Before the chat pivot the rail
// carried a dozen destinations and was hard to scan; now Chat IS the product —
// the Director + each agent live there, and the Director's mission-control dock
// pulls up everything operational (live ops, analytics, appointments, triage,
// pipeline, SMS, cockpit) on demand. So the rail keeps only the handful of
// surfaces operators reach for directly and that don't belong inside a chat:
//
//   Workspace · Chat        — the hub (Director + every agent, all their tabs)
//             · Call Logs    — transcripts + recordings of what the fleet did
//   Account   · Integrations — connect email / calendar / CRM / messaging
//             · Settings     — billing, branding, carrier, agents roster, DNC, audit
//
// Everything else still has a route (and is reachable from the Director dock
// and direct links) — it just no longer clutters the primary rail. Training,
// Connectors and Memory are folded into each chat (Chat · Training ·
// Connectors · Memory tabs), so they never earn a standalone nav slot.
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
        label: "Call Logs",
        path: "/logs",
        icon: Radio,
        // Recordings + the other activity surfaces live under / reachable from
        // Call Logs and the Director dock; highlight Call Logs when on any.
        matches: ["/outbound", "/inbox", "/appointments", "/sms"],
      },
    ],
  },
  {
    label: "Admin",
    items: [
      { label: "Integrations", path: "/integrations", icon: Plug },
      {
        label: "Settings",
        path: "/admin",
        icon: SlidersHorizontal,
        dataTour: "settings",
        matches: ["/dnc", "/audit", "/agents"],
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
