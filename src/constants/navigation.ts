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

// Five-group nav: Command (cockpit + business intelligence), Channels
// (communication surfaces), Agents (fleet management, coaching, training),
// Design (standalone beta), Admin (footer settings).
//
// Command groups the operator's daily cockpit: Live Ops (live floor,
// supervisor tools, actions), Insights (analytics & reliability), and
// Pipeline (sales funnel). These are the "what's happening now" surfaces.
//
// Channels surfaces Phone, Email, and SMS as first-class pages - the
// communication arteries operators need instant access to.
//
// Agents groups everything about building and improving the fleet: fleet
// configuration, Director chat coaching, and Training (knowledge, voices,
// pronunciation, simulator, flow).
//
// Design is isolated as a standalone beta surface - the Painter studio for
// pages, flows, and immersive click-through prototypes. It doesn't fit
// cleanly into another group and warrants its own space.
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

const AGENTS_NAV: NavItem[] = [
  {
    label: "Agents",
    path: "/agents",
    icon: Users,
    dataTour: "agents",
    matches: ["/agents"],
  },
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
    matches: ["/integrations", "/dnc", "/audit", "/admin"],
  },
];

/** Logical IA groups - used for mobile drawer sections and docs; labels are not shown on desktop rail. */
export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  { label: "Command", items: withSection(COMMAND_NAV, "Command") },
  { label: "Channels", items: withSection(CHANNELS_NAV, "Channels") },
  { label: "Agents", items: withSection(AGENTS_NAV, "Agents") },
  { label: "Design", items: withSection(DESIGN_NAV, "Design") },
  {
    label: "Admin",
    items: withSection(ADMIN_NAV, "Admin"),
  },
];

/** Single continuous desktop rail - no section headers, fits without scroll on typical viewports. */
export const SIDEBAR_NAV_ITEMS: NavItem[] = [
  ...withSection(COMMAND_NAV, "Command"),
  ...withSection(CHANNELS_NAV, "Channels"),
  ...withSection(AGENTS_NAV, "Agents"),
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
  "/agents": "Agents",
  "/chat": "Chat",
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
  D: "/ops",
  T: "/ops?tab=triage",
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
  "/insights": "g i",
  "/agents": "g a",
  "/chat": "g r",
  "/training": "g n",
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
