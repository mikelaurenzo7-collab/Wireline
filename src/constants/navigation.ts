import type { CSSProperties, ComponentType } from "react";
import { Cable, GraduationCap, Settings2, Sparkles } from "lucide-react";

export type NavItem = {
  label: string;
  path: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number; style?: CSSProperties }>;
  matches?: string[];
  section?: string;
};

const STUDIO_NAV: NavItem[] = [
  { label: "Agents", path: "/agents", icon: Sparkles, matches: ["/agents"] },
  { label: "Training", path: "/training", icon: GraduationCap, matches: ["/training", "/knowledge"] },
  { label: "Wire", path: "/actions", icon: Cable, matches: ["/actions", "/connections"] },
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
  "/agents": "Agents",
  "/training": "Training",
  "/actions": "Wire",
  "/settings": "Settings",
};

export const APP_KEYBOARD_SHORTCUTS: Record<string, string> = {
  A: "/agents",
  T: "/training",
  W: "/actions",
  S: "/settings",
};

export const NAV_SHORTCUT_HINTS: Record<string, string> = {
  "/agents": "g a",
  "/training": "g t",
  "/actions": "g w",
  "/settings": "g s",
};
