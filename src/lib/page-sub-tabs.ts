import type { ComponentType } from "react";
import {
  AlertOctagon,
  BarChart3,
  BookOpen,
  Calendar,
  CalendarClock,
  Gauge,
  ShieldAlert,
  History,
  Layers,
  Megaphone,
  PhoneOutgoing,
  Receipt,
  Repeat,
  Star,
  Target,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";
import { OPS_INSIGHTS_GROUPS } from "./wireline-ops-design";

export type AppPageSubTab = {
  id: string;
  label: string;
  /** Accessible name when `label` is abbreviated for narrow viewports. */
  ariaLabel?: string;
  /** Short visual label used on narrow viewports. */
  shortLabel?: string;
  icon?: ComponentType<{ className?: string }>;
};

export type AppPageSubTabRoute = {
  pathname: string;
  tabs: AppPageSubTab[];
  defaultTab: string;
  ariaLabel: string;
  layoutIdPrefix: string;
};

export const APP_PAGE_SUB_TAB_ROUTES: AppPageSubTabRoute[] = [
  {
    pathname: "/phone",
    defaultTab: "logs",
    ariaLabel: "Phone sections",
    layoutIdPrefix: "phone-section",
    tabs: [
      { id: "logs", label: "History", icon: History },
      {
        id: "outbound",
        label: "Outbound",
        shortLabel: "Out",
        ariaLabel: "Outbound",
        icon: PhoneOutgoing,
      },
      {
        id: "appointments",
        label: "Appointments",
        shortLabel: "Appts",
        ariaLabel: "Appointments",
        icon: Calendar,
      },
    ],
  },
  {
    pathname: "/insights",
    defaultTab: "performance",
    ariaLabel: "Insights categories",
    layoutIdPrefix: "insights-group",
    tabs: [
      {
        id: "performance",
        label: "Performance",
        shortLabel: "Perf",
        ariaLabel: "Performance",
        icon: BarChart3,
      },
      {
        id: "reliability",
        label: "Reliability",
        shortLabel: "Uptime",
        ariaLabel: "Reliability",
        icon: ShieldAlert,
      },
      { id: "quality", label: "Quality", shortLabel: "Quality", ariaLabel: "Quality", icon: Star },
      { id: "revenue", label: "Revenue", shortLabel: "Rev", ariaLabel: "Revenue", icon: Receipt },
    ],
  },
  // /agents (the Studio) intentionally has no sub-tabs: it's one open build
  // canvas. Templates are summoned from the canvas, not a competing front-door
  // tab. (AssistantSettings owns that toggle via local view state.)
];

const ADMIN_HUB_PATHS = ["/admin"] as const;

export function isAdminHubPath(pathname: string): boolean {
  return (ADMIN_HUB_PATHS as readonly string[]).includes(pathname);
}

export function resolveAppPageSubTabRoute(pathname: string): AppPageSubTabRoute | undefined {
  return APP_PAGE_SUB_TAB_ROUTES.find((r) => r.pathname === pathname);
}

/** Human-friendly ?tab= values from docs, emails, and legacy links. */
const APP_PAGE_TAB_ALIASES: Partial<Record<string, Record<string, string>>> = {};

export function normalizeAppPageSubTabParam(
  route: AppPageSubTabRoute,
  tabParam: string | null,
): string | null {
  if (!tabParam) return null;
  const alias = APP_PAGE_TAB_ALIASES[route.pathname]?.[tabParam.toLowerCase()];
  return alias ?? tabParam;
}

export function resolveAppPageSubTabId(route: AppPageSubTabRoute, tabParam: string | null): string {
  const normalized = normalizeAppPageSubTabParam(route, tabParam) ?? tabParam;
  if (normalized && route.tabs.some((t) => t.id === normalized)) return normalized;
  return route.defaultTab;
}

/** Secondary views — driven by ?view= when a primary section exposes nested tabs. */
export type AppPageSecondaryTabRoute = {
  pathname: string;
  whenPrimaryTab: string;
  tabs: AppPageSubTab[];
  defaultView: string;
  ariaLabel: string;
  layoutIdPrefix: string;
};

export const INSIGHTS_VIEW_TABS: Record<string, AppPageSubTab> = {
  funnel: { id: "funnel", label: "Funnel", icon: TrendingUp },
  goals: { id: "goals", label: "Goals", icon: Target },
  heatmap: {
    id: "heatmap",
    label: "Heatmap",
    shortLabel: "Heat",
    ariaLabel: "Heatmap",
    icon: Calendar,
  },
  leaderboard: {
    id: "leaderboard",
    label: "Leaderboard",
    shortLabel: "Ranks",
    ariaLabel: "Leaderboard",
    icon: Trophy,
  },
  failures: { id: "failures", label: "Failures", icon: AlertOctagon },
  latency: { id: "latency", label: "Latency", icon: Gauge },
  reliability: {
    id: "reliability",
    label: "Reliability",
    shortLabel: "Uptime",
    ariaLabel: "Reliability",
    icon: ShieldAlert,
  },
  quality: {
    id: "quality",
    label: "Scorecards",
    shortLabel: "Scores",
    ariaLabel: "Scorecards",
    icon: Star,
  },
  learning: { id: "learning", label: "Learning", icon: BookOpen },
  attribution: {
    id: "attribution",
    label: "Attribution",
    shortLabel: "Attrib",
    ariaLabel: "Attribution",
    icon: Megaphone,
  },
  topics: { id: "topics", label: "Topics", icon: Layers },
  spend: {
    id: "spend",
    label: "AI Spend",
    shortLabel: "Spend",
    ariaLabel: "AI Spend",
    icon: Receipt,
  },
};

export const OUTBOUND_VIEW_TABS: AppPageSubTab[] = [
  { id: "dispatch", label: "Dispatch", icon: Zap },
  {
    id: "campaigns",
    label: "Lead Hunt",
    shortLabel: "Camps",
    ariaLabel: "Hunt",
    icon: Megaphone,
  },
  { id: "sequences", label: "Sequences", shortLabel: "Seq", ariaLabel: "Sequences", icon: Repeat },
  {
    id: "callbacks",
    label: "Callbacks",
    shortLabel: "Cbks",
    ariaLabel: "Callbacks",
    icon: CalendarClock,
  },
];

export const APP_PAGE_SECONDARY_TAB_ROUTES: AppPageSecondaryTabRoute[] = [
  {
    pathname: "/phone",
    whenPrimaryTab: "outbound",
    tabs: OUTBOUND_VIEW_TABS,
    defaultView: "dispatch",
    ariaLabel: "Outbound sections",
    layoutIdPrefix: "outbound-view",
  },
];

export function resolveInsightsSecondaryTabs(groupId: string): AppPageSubTab[] {
  const group = OPS_INSIGHTS_GROUPS.find((g) => g.id === groupId);
  if (!group) return [];
  return group.tabs
    .map((id) => INSIGHTS_VIEW_TABS[id])
    .filter((tab): tab is AppPageSubTab => Boolean(tab));
}

export function resolveInsightsGroupForView(viewId: string | null): string | null {
  if (!viewId) return null;
  const group = OPS_INSIGHTS_GROUPS.find((candidate) =>
    (candidate.tabs as readonly string[]).includes(viewId),
  );
  return group?.id ?? null;
}

export function resolveAppPageSecondaryRoute(
  pathname: string,
  primaryTabId: string,
): Omit<AppPageSecondaryTabRoute, "whenPrimaryTab"> | null {
  if (pathname === "/insights") {
    const tabs = resolveInsightsSecondaryTabs(primaryTabId);
    if (tabs.length === 0) return null;
    return {
      pathname,
      tabs,
      defaultView: tabs[0]!.id,
      ariaLabel: "Insights views",
      layoutIdPrefix: "insights-view",
    };
  }
  const match = APP_PAGE_SECONDARY_TAB_ROUTES.find(
    (r) => r.pathname === pathname && r.whenPrimaryTab === primaryTabId,
  );
  if (!match) return null;
  const { whenPrimaryTab: _when, ...rest } = match;
  return rest;
}

export function resolveAppPageSecondaryTabId(
  route: Pick<AppPageSecondaryTabRoute, "tabs" | "defaultView">,
  viewParam: string | null,
): string {
  if (viewParam && route.tabs.some((t) => t.id === viewParam)) return viewParam;
  return route.defaultView;
}
