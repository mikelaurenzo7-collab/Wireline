/**
 * Name -> icon component for the shell navigation.
 *
 * `src/constants/navigation.ts` stays the single source of truth for the
 * navigation IA, and it stays plain data: it names its icons rather than
 * importing them. That module is reachable from `server.ts` through
 * `src/lib/account-type.ts`, and while it held component references every
 * serverless cold start paid a `require("lucide-react")` — 62 ms and 7.2 MB of
 * heap to serve API traffic that never draws an icon.
 *
 * The binding to real components belongs on the client, so it lives here, in
 * the components layer, imported only by the surfaces that render nav.
 */
import {
  BarChart3,
  Bot,
  CheckSquare,
  GraduationCap,
  Home,
  Inbox,
  MoreHorizontal,
  Phone,
  Settings,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import type { NavIconName } from "../constants/navigation";

const NAV_ICONS: Record<NavIconName, LucideIcon> = {
  BarChart3,
  Bot,
  CheckSquare,
  GraduationCap,
  Home,
  Inbox,
  MoreHorizontal,
  Phone,
  Settings,
  Workflow,
};

/** Resolve a nav item's icon name. Falls back to a neutral glyph so an unknown
 *  name renders a placeholder rather than crashing the shell. */
export function navIcon(name: NavIconName): LucideIcon {
  return NAV_ICONS[name] ?? MoreHorizontal;
}
