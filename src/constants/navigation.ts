import type { CSSProperties, ComponentType } from "react";
import { Plug, Settings2, Sparkles } from "lucide-react";

export type NavItem = {
  label: string;
  path: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number; style?: CSSProperties }>;
  matches?: string[];
  section?: string;
};

const STUDIO_NAV: NavItem[] = [
  { label: "Agent Studio", path: "/agents", icon: Sparkles, matches: ["/agents", "/training"] },
  { label: "Actions", path: "/actions", icon: Plug, matches: ["/actions", "/actions"] },
  { label: "Settings", path: "/settings", icon: Settings2, matches: ["/settings", "/admin"] },
];

export const NAV_GROUPS = [
  { label: "Workspace", items: STUDIO_NAV.map((item) => ({ ...item, section: "Workspace" })) },
];
export const SIDEBAR_NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

export function findNavItemForPath(pathname: string): NavItem | undefined {
  return SIDEBAR_NAV_ITEMS.find(
    (item) =>
      pathname === item.path ||
      item.matches?.some((match) => pathname === match || pathname.startsWith(`${match}/`)),
  );
}

export const PAGE_TITLES: Record<string, string> = {
  "/agents": "Agent Studio",
  "/actions": "Actions",
  "/settings": "Settings",
};

export const APP_KEYBOARD_SHORTCUTS: Record<string, string> = {
  A: "/agents",
  I: "/actions",
  S: "/settings",
};

export const NAV_SHORTCUT_HINTS: Record<string, string> = {
  "/agents": "g a",
  "/actions": "g i",
  "/settings": "g s",
};

// Navigation uses Ametrine Precision accent system from brand-colors.ts
// No legacy signal/purple references remain.