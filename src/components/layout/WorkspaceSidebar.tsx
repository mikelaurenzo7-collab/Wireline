import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  Crown,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/shadcn/Tooltip";
import { useAuth } from "../../contexts/AuthContext";
import { useAccount } from "../../contexts/AccountContext";
import { accountSidebarItems } from "../../lib/account-type";
import { type NavItem } from "../../constants/navigation";
import WirelineMark from "../WirelineMark";

interface WorkspaceSidebarProps {
  navBadges?: Record<string, number>;
  className?: string;
  variant?: "wide" | "rail";
}

/**
 * Compact-first workspace navigation.
 *
 * The 56px desktop rail preserves maximum builder canvas while retaining a
 * discoverable 256px labeled state. It intentionally uses Ametrine's light
 * tonal surface hierarchy rather than dark chrome, blur, or glow treatments.
 */
export default function WorkspaceSidebar({
  navBadges = {},
  className,
  variant = "wide",
}: WorkspaceSidebarProps) {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { accountType } = useAccount();
  const [isCollapsed, setIsCollapsed] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("wireline-sidebar-collapsed");
    if (saved !== null) setIsCollapsed(saved === "true");
  }, []);

  const toggleCollapsed = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    localStorage.setItem("wireline-sidebar-collapsed", String(next));
  };

  const isActive = (item: NavItem) => {
    if (location.pathname === item.path) return true;
    return item.matches?.some(
      (match) => location.pathname === match || location.pathname.startsWith(`${match}/`),
    ) ?? false;
  };

  const items = accountSidebarItems(accountType).filter(
    (item) => !item.ownerOnly || user?.is_owner === true,
  );

  const grouped = items.reduce(
    (acc, item) => {
      const section = item.section || "General";
      (acc[section] ||= []).push(item);
      return acc;
    },
    {} as Record<string, NavItem[]>,
  );

  if (variant === "rail") return null;

  return (
    <TooltipProvider delayDuration={180}>
      <aside
        aria-label="Workspace navigation"
        className={cn(
          "relative hidden md:flex shrink-0 flex-col fixed top-0 left-0 bottom-0 z-[55] border-r border-outline-variant bg-surface transition-[width] duration-200 ease-out",
          className,
        )}
        style={{ width: `${isCollapsed ? 56 : 256}px` }}
        data-testid="workspace-sidebar"
        data-collapsed={isCollapsed}
      >
        <div
          className={cn(
            "flex h-16 items-center border-b border-outline-variant",
            isCollapsed ? "justify-center px-2" : "justify-between px-3",
          )}
        >
          <Link to="/overview" className="flex min-w-0 items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary" aria-hidden="true">
              <WirelineMark className="size-4 text-white" strokeWidth={140} />
            </div>
            {!isCollapsed && (
              <div className="min-w-0">
                <div className="truncate text-[17px] font-semibold tracking-[-0.3px] text-on-surface">Wireline</div>
                <div className="-mt-0.5 text-[10px] text-on-surface-variant">Workspace</div>
              </div>
            )}
          </Link>

          <button
            type="button"
            onClick={toggleCollapsed}
            className={cn(
              "flex size-7 items-center justify-center rounded-md border border-outline-variant bg-surface-container-low text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
              isCollapsed && "absolute -right-3 top-[18px] z-10",
            )}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-4 text-sm" aria-label="Primary navigation">
          {Object.entries(grouped).map(([section, sectionItems], index) => (
            <div key={section} className={cn(index > 0 && "mt-5")}>
              {!isCollapsed && (
                <div className="mb-1.5 px-3 text-[10px] font-medium uppercase tracking-[0.08em] text-on-surface-variant/70">
                  {section}
                </div>
              )}
              <div className="space-y-px">
                {sectionItems.map((item) => {
                  const Icon = item.icon || LayoutDashboard;
                  const active = isActive(item);
                  const badge =
                    (navBadges[item.path] ?? 0) +
                    (item.matches?.reduce((sum, match) => sum + (navBadges[match] ?? 0), 0) ?? 0);

                  const link = (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={cn(
                        "group flex items-center gap-3 rounded-md py-[9px] text-on-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                        isCollapsed ? "justify-center px-2" : "px-3",
                        active
                          ? isCollapsed
                            ? "bg-primary/10 text-primary"
                            : "-ml-px border-l-[3px] border-primary bg-primary/10 pl-[11px] font-medium text-primary"
                          : "hover:bg-surface-container-low",
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon
                        className={cn(
                          "size-4 shrink-0",
                          active ? "text-primary" : "text-on-surface-variant group-hover:text-on-surface",
                        )}
                        strokeWidth={active ? 2.5 : 2}
                      />
                      {!isCollapsed && <span className="truncate text-[13.5px] tracking-[-0.1px]">{item.label}</span>}
                      {!isCollapsed && badge > 0 && (
                        <span className="ml-auto flex h-[17px] min-w-[18px] items-center justify-center rounded-full bg-error/10 px-1.5 font-mono text-[10px] text-error">
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
                    </Link>
                  );

                  return isCollapsed ? (
                    <Tooltip key={item.path}>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right" className="ml-1">
                        {item.label}{badge > 0 ? ` (${badge})` : ""}
                      </TooltipContent>
                    </Tooltip>
                  ) : link;
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 space-y-1 border-t border-outline-variant px-2 py-3">
          <Link
            to="/help"
            className={cn(
              "flex items-center gap-3 rounded-md py-2 text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface",
              isCollapsed ? "justify-center px-2" : "px-3",
            )}
          >
            <LifeBuoy className="size-4" />
            {!isCollapsed && <span>Help & Support</span>}
          </Link>
          {user?.is_owner && (
            <Link
              to="/founder"
              className={cn(
                "flex items-center gap-3 rounded-md py-2 text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface",
                isCollapsed ? "justify-center px-2" : "px-3",
              )}
            >
              <Crown className="size-4" />
              {!isCollapsed && <span>Founder Dashboard</span>}
            </Link>
          )}
          <button
            type="button"
            onClick={signOut}
            className={cn(
              "flex w-full items-center gap-3 rounded-md py-2 text-left text-on-surface-variant transition-colors hover:bg-error/5 hover:text-error",
              isCollapsed ? "justify-center px-2" : "px-3",
            )}
          >
            <LogOut className="size-4" />
            {!isCollapsed && <span>Sign out</span>}
          </button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
