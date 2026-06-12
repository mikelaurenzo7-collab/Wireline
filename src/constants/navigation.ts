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
  PlugZap,
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

// Agent Studio OS nav: Studio is for creating and tuning one agent with an
// embedded Director co-pilot. The standalone Director page is for managing the
// broader agent workforce after agents exist: plans, approvals, fleet actions,
// research, daily gameplans, and cross-agent coordination.
const BUILD_NAV: NavItem[] = [
  {
    label: "Agent Studio",
    path: "/agents",
    icon: Users,
    dataTour: "agents",
    matches: ["/agents"],
  },
  {
    label: "Knowledge",
    path: "/training",
    icon: GraduationCap,
    dataTour: "training",
    matches: ["/knowledge"],
  },
  {
    label: "Integrations",
    path: "/integrations",
    icon: PlugZap,
    dataTour: "integrations",
    matches: ["/integrations"],
  },
];

const MANAGE_NAV: NavItem[] = [
  {
    label: "Director",
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
    matches: ["/dashboard", "/command", "/live", "/cockpit", "/triage"],
  },
  { label: "Pipeline", path: "/pipeline", icon: Kanban },
  { label: "Insights", path: "/insights", icon: BarChart3, dataTour: "insights" },
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
  { label: "Create", items: withSection(BUILD_NAV, "Create") },
  { label: "Manage", items: withSection(MANAGE_NAV, "Manage") },
  { label: "Channels", items: withSection(CHANNELS_NAV, "Channels") },
  { label: "Design", items: withSection(DESIGN_NAV, "Design") },
  {
    label: "System",
    items: withSection(ADMIN_NAV, "System"),
  },
];

/** Single continuous desktop rail - no section headers, fits without scroll on typical viewports. */
export const SIDEBAR_NAV_ITEMS: NavItem[] = [
  ...withSection(BUILD_NAV, "Create"),
  ...withSection(MANAGE_NAV, "Manage"),
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
  "/training": "Knowledge",
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
  K: "/training",
  C: "/integrations",
  D: "/chat",
  O: "/ops",
  L: "/pipeline",
  I: "/insights",
  P: "/phone",
  E: "/email",
  M: "/sms",
  S: "/admin",
};

export const NAV_SHORTCUT_HINTS: Record<string, string> = {
  "/agents": "g a",
  "/training": "g k",
  "/integrations": "g c",
  "/chat": "g d",
  "/ops": "g o",
  "/pipeline": "g l",
  "/insights": "g i",
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
