import type { ComponentType } from "react";
import {
  AlertOctagon,
  BarChart3,
  BookOpen,
  Calendar,
  CalendarClock,
  Database,
  Gauge,
  ShieldAlert,
  History,
  Layers,
  Megaphone,
  Mic,
  PhoneOutgoing,
  PlayCircle,
  Receipt,
  Repeat,
  Star,
  Target,
  TrendingUp,
  Trophy,
  Workflow,
  Zap,
} from "lucide-react";
import { OPS_INSIGHTS_GROUPS } from "./wireline-ops-design";

export type AppPageSubTab = {
  id: string;
  label: string;
  /** Accessible name when `label` is abbreviated for narrow viewports. */
  ariaLabel?: string;
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
      { id: "outbound", label: "Outbound", icon: PhoneOutgoing },
      { id: "appointments", label: "Appointments", icon: Calendar },
    ],
  },
  {
    pathname: "/insights",
    defaultTab: "performance",
    ariaLabel: "Insights categories",
    layoutIdPrefix: "insights-group",
    tabs: [
      { id: "performance", label: "Performance", icon: BarChart3 },
      { id: "reliability", label: "Reliability", icon: ShieldAlert },
      { id: "quality", label: "Quality", icon: Star },
      { id: "revenue", label: "Revenue", icon: Receipt },
    ],
  },
  {
    pathname: "/training",
    defaultTab: "database",
    ariaLabel: "Training modules",
    layoutIdPrefix: "training-module",
    tabs: [
      { id: "database", label: "Knowledge", icon: Database },
      { id: "voices", label: "Voice", icon: Mic },
      { id: "pronunciation", label: "Pronunciation", icon: BookOpen },
      { id: "simulator", label: "Simulator", icon: PlayCircle },
      { id: "flow", label: "Flow", icon: Workflow },
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
  heatmap: { id: "heatmap", label: "Heatmap", icon: Calendar },
  leaderboard: { id: "leaderboard", label: "Leaderboard", icon: Trophy },
  failures: { id: "failures", label: "Failures", icon: AlertOctagon },
  latency: { id: "latency", label: "Latency", icon: Gauge },
  reliability: { id: "reliability", label: "Reliability", icon: ShieldAlert },
  quality: { id: "quality", label: "Scorecards", icon: Star },
  learning: { id: "learning", label: "Learning", icon: BookOpen },
  attribution: { id: "attribution", label: "Attribution", icon: Megaphone },
  topics: { id: "topics", label: "Topics", icon: Layers },
  spend: { id: "spend", label: "AI Spend", icon: Receipt },
};

export const OUTBOUND_VIEW_TABS: AppPageSubTab[] = [
  { id: "dispatch", label: "Dispatch", icon: Zap },
  { id: "campaigns", label: "Campaigns", icon: Megaphone },
  { id: "sequences", label: "Sequences", icon: Repeat },
  { id: "callbacks", label: "Callbacks", icon: CalendarClock },
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
