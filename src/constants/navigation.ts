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
  { label: "Overview", path: "/overview", icon: Sparkles, matches: ["/overview", "/agents"] },
  {
    label: "Training",
    path: "/knowledge",
    icon: GraduationCap,
    matches: ["/knowledge", "/training"],
  },
  { label: "Wire", path: "/connections", icon: Cable, matches: ["/connections", "/actions"] },
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
  "/overview": "Overview",
  "/knowledge": "Training",
  "/connections": "Wire",
  "/settings": "Settings",
};

export const APP_KEYBOARD_SHORTCUTS: Record<string, string> = {
  A: "/overview",
  T: "/knowledge",
  W: "/connections",
  S: "/settings",
};

export const NAV_SHORTCUT_HINTS: Record<string, string> = {
  "/overview": "g a",
  "/knowledge": "g t",
  "/connections": "g w",
  "/settings": "g s",
};
