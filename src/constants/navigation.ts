import {
  MessagesSquare,
  BarChart3,
  LayoutGrid,
  Kanban,
  SlidersHorizontal,
  GraduationCap,
  Paintbrush,
  Phone,
  Mail,
  MessageCircle,
  Users,
} from "lucide-react";
import {
  ROUTE_ACCENT_DEFAULT,
  ROUTE_ACCENT_VARIANTS,
  ROUTE_ACCENTS,
  type BrandAccentPair,
} from "./brand-colors";

export { ROUTE_ACCENTS };

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
  /** Page context / breadcrumb only; not rendered in the desktop rail */
  section?: string;
  /** Optional rail/drawer badge (e.g. beta surfaces) */
  betaLabel?: string;
};

function withSection(items: NavItem[], section: string): NavItem[] {
  return items.map((item) => ({ ...item, section }));
}

// Studio-first IA. Studio leads — the build pivot: shape and tune agents on the
// canvas with the embedded Director co-pilot, coach them in the standalone
// Director chat, and teach them in Training. Command is the run surface
// (cockpit, intelligence, pipeline). Channels are the wires. Integrations now
// live in the agent tuning rail, not the primary nav.
const STUDIO_NAV: NavItem[] = [
  {
    label: "Agent Studio",
    path: "/agents",
    icon: Users,
    dataTour: "agents",
    matches: ["/agents"],
  },
  {
    label: "Director",
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
];

const COMMAND_NAV: NavItem[] = [
  {
    label: "Live Ops",
    path: "/ops",
    icon: LayoutGrid,
    dataTour: "dashboard",
    matches: ["/dashboard", "/command", "/live", "/cockpit", "/triage"],
  },
  { label: "Insights", path: "/insights", icon: BarChart3, dataTour: "insights" },
  { label: "Pipeline", path: "/pipeline", icon: Kanban },
];

const CHANNELS_NAV: NavItem[] = [
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
];

const DESIGN_NAV: NavItem[] = [
  {
    label: "Design",
    path: "/design",
    icon: Paintbrush,
    dataTour: "design",
    matches: ["/design"],
    betaLabel: "Beta",
  },
];

const ADMIN_NAV: NavItem[] = [
  {
    label: "Settings",
    path: "/admin",
    icon: SlidersHorizontal,
    dataTour: "settings",
    matches: ["/dnc", "/audit", "/admin"],
  },
];

/** Logical IA groups - used for mobile drawer sections and docs; labels are not shown on desktop rail. */
export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  { label: "Studio", items: withSection(STUDIO_NAV, "Studio") },
  { label: "Command", items: withSection(COMMAND_NAV, "Command") },
  { label: "Channels", items: withSection(CHANNELS_NAV, "Channels") },
  { label: "Design", items: withSection(DESIGN_NAV, "Design") },
  { label: "Admin", items: withSection(ADMIN_NAV, "Admin") },
];

/** Single continuous desktop rail - no section headers, fits without scroll on typical viewports. */
export const SIDEBAR_NAV_ITEMS: NavItem[] = [
  ...withSection(STUDIO_NAV, "Studio"),
  ...withSection(COMMAND_NAV, "Command"),
  ...withSection(CHANNELS_NAV, "Channels"),
  ...withSection(DESIGN_NAV, "Design"),
];

export function findNavItemForPath(pathname: string): NavItem | undefined {
  const candidates = [...SIDEBAR_NAV_ITEMS, ...ADMIN_NAV];
  for (const item of candidates) {
    if (pathname === item.path) return item;
    if (item.matches?.some((m) => pathname === m || pathname.startsWith(`${m}/`))) return item;
  }
  return undefined;
}

export const PAGE_TITLES: Record<string, string> = {
  "/ops": "Live Ops",
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
  "/agents": "Agent Studio",
  "/chat": "Director",
  "/design": "Wireline Design",
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

/** g+key shortcuts - keep in sync with AppShell and Sidebar hints. */
export const APP_KEYBOARD_SHORTCUTS: Record<string, string> = {
  A: "/agents",
  C: "/chat",
  N: "/training",
  D: "/ops",
  T: "/ops?tab=triage",
  I: "/insights",
  L: "/pipeline",
  P: "/phone",
  E: "/email",
  M: "/sms",
  S: "/admin",
};

export const NAV_SHORTCUT_HINTS: Record<string, string> = {
  "/agents": "g a",
  "/chat": "g c",
  "/training": "g n",
  "/ops": "g d",
  "/insights": "g i",
  "/pipeline": "g l",
  "/phone": "g p",
  "/email": "g e",
  "/sms": "g m",
  "/admin": "g s",
};

export function getRouteAccent(pathname: string): BrandAccentPair {
  if (ROUTE_ACCENTS[pathname]) return ROUTE_ACCENTS[pathname];
  const prefix = "/" + pathname.split("/")[1];
  return ROUTE_ACCENTS[prefix] ?? ROUTE_ACCENT_DEFAULT;
}

/** Route accent with tab/query awareness for ambience strip + context bar. */
export function getRouteAccentFromLocation(pathname: string, search = ""): BrandAccentPair {
  const params = new URLSearchParams(search);
  if (pathname === "/ops") {
    const tab = params.get("tab");
    if (tab === "intel") return ROUTE_ACCENT_VARIANTS.cream;
    if (tab === "triage") return ROUTE_ACCENT_VARIANTS.warm;
    if (tab === "analytics") return ROUTE_ACCENT_VARIANTS.light;
    return ROUTE_ACCENTS["/ops"];
  }
  if (pathname === "/phone") {
    const tab = params.get("tab");
    if (tab === "outbound") return ROUTE_ACCENTS["/outbound"];
    if (tab === "appointments") return ROUTE_ACCENTS["/appointments"];
    return ROUTE_ACCENTS["/phone"];
  }
  if (pathname === "/training") return ROUTE_ACCENTS["/training"];
  if (pathname.startsWith("/contact/")) return ROUTE_ACCENT_VARIANTS.soft;
  return getRouteAccent(pathname);
}
