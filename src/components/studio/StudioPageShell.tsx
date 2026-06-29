import { type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  BookOpen,
  Bot,
  Home,
  Inbox,
  Layers,
  LayoutGrid,
  LayoutTemplate,
  Phone,
  Settings,
  Users,
  Workflow,
} from "lucide-react";

import MobileBrowserUtilities from "../MobileBrowserUtilities";
import { useAuth } from "../../contexts/AuthContext";
import { useAccount } from "../../contexts/AccountContext";
import { useStudioActiveAgentId } from "../../hooks/useStudioActiveAgentId";

type RailNavItem = { href: string; label: string; icon: typeof Bot };

const WORKSPACE_NAV: Record<"personal" | "business", RailNavItem[]> = {
  personal: [
    { href: "/overview", label: "Home", icon: Home },
    { href: "/studio", label: "Agent Studio", icon: Layers },
    { href: "/templates", label: "Templates", icon: LayoutTemplate },
    { href: "/knowledge", label: "Knowledge", icon: BookOpen },
  ],
  business: [
    { href: "/overview", label: "Overview", icon: Home },
    { href: "/agents", label: "Assistants", icon: Users },
    { href: "/studio", label: "Agent Studio", icon: Layers },
    { href: "/knowledge", label: "Knowledge", icon: BookOpen },
  ],
};

const OPERATE_NAV: Record<"personal" | "business", RailNavItem[]> = {
  personal: [
    { href: "/call-logs", label: "Call Logs", icon: Phone },
    { href: "/inbox", label: "Inbox", icon: Inbox },
    { href: "/apps", label: "Apps", icon: LayoutGrid },
    { href: "/settings", label: "Settings", icon: Settings },
  ],
  business: [
    { href: "/connections", label: "Connections", icon: Workflow },
    { href: "/call-logs", label: "Call Logs", icon: Phone },
    { href: "/inbox", label: "Inbox", icon: Inbox },
    { href: "/apps", label: "Apps", icon: LayoutGrid },
    { href: "/settings", label: "Settings", icon: Settings },
  ],
};

const MOBILE_NAV: Record<"personal" | "business", RailNavItem[]> = {
  personal: [
    { href: "/overview", label: "Home", icon: Home },
    { href: "/studio", label: "Studio", icon: Layers },
    { href: "/knowledge", label: "Knowledge", icon: BookOpen },
    { href: "/inbox", label: "Inbox", icon: Inbox },
    { href: "/settings", label: "Settings", icon: Settings },
  ],
  business: [
    { href: "/overview", label: "Overview", icon: Home },
    { href: "/agents", label: "Assistants", icon: Users },
    { href: "/studio", label: "Studio", icon: Layers },
    { href: "/inbox", label: "Inbox", icon: Inbox },
    { href: "/settings", label: "Settings", icon: Settings },
  ],
};

function isActive(pathname: string, href: string) {
  if (pathname === href) return true;
  if (href === "/studio" && pathname.startsWith("/studio")) return true;
  if (href === "/settings" && pathname.startsWith("/admin")) return true;
  return pathname.startsWith(`${href}/`);
}

function userInitial(name?: string | null, email?: string | null) {
  const source = (name || email || "W").trim();
  return source.charAt(0).toUpperCase() || "W";
}

function rosterLabel(count: number) {
  if (count <= 0) return "No agents yet";
  return `${count} agent${count === 1 ? "" : "s"}`;
}

function SidebarLink({ item, pathname }: { item: RailNavItem; pathname: string }) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link to={item.href} aria-current={active ? "page" : undefined} className="wl-rail-link">
      <Icon size={16} strokeWidth={active ? 2.2 : 1.9} aria-hidden="true" />
      {item.label}
    </Link>
  );
}

function RailItem({ item, pathname }: { item: RailNavItem; pathname: string }) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      to={item.href}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      className={`grid min-h-[44px] flex-1 place-items-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition-colors ${
        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      <Icon size={17} strokeWidth={active ? 2.3 : 1.9} aria-hidden="true" />
      <span className="leading-none">{item.label}</span>
    </Link>
  );
}

function DesktopRail({ pathname }: { pathname: string }) {
  const { user } = useAuth();
  const { agents } = useStudioActiveAgentId();
  const { accountType } = useAccount();
  const posture: "personal" | "business" = accountType === "business" ? "business" : "personal";
  const displayName = user?.full_name?.trim() || user?.email?.split("@")[0] || "Workspace";
  const postureLabel = posture === "business" ? "Business" : "Personal";

  return (
    <aside
      aria-label="Workspace navigation"
      className="hidden h-[100dvh] w-[236px] shrink-0 flex-col overflow-y-auto border-r border-border bg-[color:var(--wireline-color-surface-default)] px-3.5 py-5 lg:flex"
    >
      <Link to="/overview" aria-label="Wireline" className="mb-1.5 flex items-center gap-2.5 px-1.5">
        <span className="grid size-7 place-items-center rounded-[7px] bg-primary font-mono text-[11px] font-bold text-primary-foreground">
          W
        </span>
        <span className="font-[var(--wireline-font-family-display)] text-[19px] leading-none tracking-[-0.01em] text-foreground">
          Wireline
        </span>
      </Link>

      <p className="px-2.5 pb-2 pt-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--wireline-color-text-secondary)]">
        Workspace
      </p>
      <nav className="flex flex-col gap-0.5" aria-label="Workspace">
        {WORKSPACE_NAV[posture].map((item) => (
          <SidebarLink key={item.href} item={item} pathname={pathname} />
        ))}
      </nav>

      <p className="px-2.5 pb-2 pt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--wireline-color-text-secondary)]">
        Operate
      </p>
      <nav className="flex flex-1 flex-col gap-0.5" aria-label="Operate">
        {OPERATE_NAV[posture].map((item) => (
          <SidebarLink key={item.href} item={item} pathname={pathname} />
        ))}
      </nav>

      <Link
        to="/settings"
        className="mt-2 flex items-center gap-2.5 border-t border-border pt-3.5 transition-opacity hover:opacity-80"
        aria-label="Account settings"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-[13px] font-semibold text-primary-foreground">
          {userInitial(user?.full_name, user?.email)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium text-foreground">{displayName}</span>
          <span className="block text-[11px] text-[color:var(--wireline-color-text-secondary)]">
            {postureLabel} · {rosterLabel(agents.length)}
          </span>
        </span>
      </Link>
    </aside>
  );
}

function MobileDock({ pathname }: { pathname: string }) {
  const { accountType } = useAccount();
  const posture: "personal" | "business" = accountType === "business" ? "business" : "personal";
  return (
    <nav
      aria-label="Workspace navigation"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden"
    >
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-1">
        {MOBILE_NAV[posture].map((item) => (
          <RailItem key={item.href} item={item} pathname={pathname} />
        ))}
      </div>
    </nav>
  );
}

export default function StudioPageShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div className="wl-workspace-shell h-[100dvh] min-h-0 overflow-hidden bg-background text-foreground">
      <a className="wl-skip-link" href="#workspace-main">
        Skip to content
      </a>
      <div className="grid h-full min-h-0 w-full overflow-hidden lg:grid-cols-[236px_minmax(0,1fr)]">
        <DesktopRail pathname={pathname} />
        <main id="workspace-main" data-wireline-route={pathname} className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden pb-[calc(5.25rem+env(safe-area-inset-bottom))] lg:pb-0">
          {children}
        </main>
      </div>
      <MobileBrowserUtilities />
      <MobileDock pathname={pathname} />
    </div>
  );
}
