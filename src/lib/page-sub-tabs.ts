import type { ComponentType } from "react";
import {
  BarChart3,
  BookOpen,
  Calendar,
  Database,
  Globe,
  History,
  LayoutGrid,
  ListTodo,
  Mic,
  PhoneOutgoing,
  PlayCircle,
  Radio,
  Receipt,
  Shield,
  Star,
  Workflow,
} from "lucide-react";

export type AppPageSubTab = {
  id: string;
  label: string;
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
      { id: "logs", label: "Call History", icon: History },
      { id: "outbound", label: "Outbound", icon: PhoneOutgoing },
      { id: "appointments", label: "Appointments", icon: Calendar },
    ],
  },
  {
    pathname: "/ops",
    defaultTab: "floor",
    ariaLabel: "Live Ops sections",
    layoutIdPrefix: "ops-section",
    tabs: [
      { id: "floor", label: "Live floor", icon: Radio },
      { id: "intel", label: "Actions", icon: ListTodo },
      { id: "analytics", label: "Analytics", icon: Globe },
    ],
  },
  {
    pathname: "/insights",
    defaultTab: "performance",
    ariaLabel: "Insights categories",
    layoutIdPrefix: "insights-group",
    tabs: [
      { id: "performance", label: "Performance", icon: BarChart3 },
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
      { id: "voices", label: "Voices", icon: Mic },
      { id: "pronunciation", label: "Pronunciation", icon: BookOpen },
      { id: "simulator", label: "Simulator", icon: PlayCircle },
      { id: "flow", label: "Flow", icon: Workflow },
    ],
  },
  {
    pathname: "/agents",
    defaultTab: "templates",
    ariaLabel: "Agent sections",
    layoutIdPrefix: "agents-section",
    tabs: [
      { id: "templates", label: "Templates", icon: LayoutGrid },
      { id: "fleet", label: "My Fleet", icon: Shield },
    ],
  },
];

const ADMIN_HUB_PATHS = ["/admin", "/integrations", "/dnc", "/audit"] as const;

export function isAdminHubPath(pathname: string): boolean {
  return (ADMIN_HUB_PATHS as readonly string[]).includes(pathname);
}

export function resolveAppPageSubTabRoute(pathname: string): AppPageSubTabRoute | undefined {
  return APP_PAGE_SUB_TAB_ROUTES.find((r) => r.pathname === pathname);
}

export function resolveAppPageSubTabId(route: AppPageSubTabRoute, tabParam: string | null): string {
  if (tabParam && route.tabs.some((t) => t.id === tabParam)) return tabParam;
  return route.defaultTab;
}
