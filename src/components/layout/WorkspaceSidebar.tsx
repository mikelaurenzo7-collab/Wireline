/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * WorkspaceSidebar.tsx — Collapsible workspace navigation (Phase 1 implementation).
 *
 * Respects user preference for collapsed icon rail (logos/favicons + tooltips).
 * Default: collapsed (56px) on desktop for clean builder canvas.
 * Toggle expands to 256px labeled view.
 * Perfect edge-to-edge (left-0, no gap).
 * Matches robofuturistic polish: glass, subtle glows, consistent rhythm.
 */
import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { authFetch } from "../../lib/api";
import {
  LayoutDashboard,
  Users,
  Bot,
  BookOpen,
  Plug,
  Inbox,
  Settings,
  LifeBuoy,
  LogOut,
  Crown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../../lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/shadcn/Tooltip";
import { useAuth } from "../../contexts/AuthContext";
import { useAccount } from "../../contexts/AccountContext";
import { accountSidebarItems } from "../../lib/account-type";
import { type NavItem } from "../../constants/navigation";
import { BRAND } from "../../constants/brand-colors";
import WirelineMark from "../WirelineMark";

interface WorkspaceSidebarProps {
  navBadges?: Record<string, number>;
  className?: string;
  variant?: "wide" | "rail";
}

export default function WorkspaceSidebar({
  navBadges = {},
  className,
  variant = "wide",
}: WorkspaceSidebarProps) {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { accountType } = useAccount();
  const [planName, setPlanName] = useState<string>("Personal");

  useEffect(() => {
    let cancelled = false;
    authFetch("/api/billing/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (data.subscription?.plan_name) {
          setPlanName(data.subscription.plan_name);
        } else {
          setPlanName("Personal");
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Phase 1: Default to collapsed (user preference: "I’ve never liked a full sidebar")
  const [isCollapsed, setIsCollapsed] = useState(true);

  // Persist preference
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
    if (!item.matches) return false;
    return item.matches.some(
      (m) => location.pathname === m || location.pathname.startsWith(`${m}/`),
    );
  };

  const items = accountSidebarItems(accountType).filter(
    (item) => !item.ownerOnly || user?.is_owner === true,
  );

  const grouped = items.reduce(
    (acc, item) => {
      const section = item.section || "General";
      if (!acc[section]) acc[section] = [];
      acc[section].push(item);
      return acc;
    },
    {} as Record<string, NavItem[]>,
  );

  const railWidth = isCollapsed ? 56 : 256;

  if (variant === "rail") {
    return null;
  }

  return (
    <TooltipProvider delayDuration={180}>
      <aside
        aria-label="Workspace navigation"
        className={cn(
          "hidden md:flex shrink-0 flex-col fixed top-0 left-0 bottom-0 z-[55] border-r border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] transition-[width] duration-200 ease-out",
          className,
        )}
        style={{ width: `${railWidth}px` }}
        data-testid="workspace-sidebar"
        data-collapsed={isCollapsed}
      >
        {/* Top Logo / Collapse Toggle — flawless edge alignment */}
        <div className="flex items-center justify-between px-3 h-16 border-b border-[var(--wireline-color-border-default)]">
          <Link to="/overview" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center overflow-hidden">
              <WirelineMark className="w-4 h-4 text-white" strokeWidth={140} />
            </div>
            {!isCollapsed && (
              <div>
                <div className="font-semibold text-[var(--wireline-typography-body-size)] tracking-[-0.3px] text-on-surface">
                  Wireline
                </div>
                <div className="text-[var(--wireline-typography-overline-size)] text-on-surface-variant -mt-0.5">
                  {planName}
                </div>
              </div>
            )}
          </Link>

          <button
            onClick={toggleCollapsed}
            className="p-1.5 rounded-md hover:bg-[var(--wireline-color-surface-subtle)] text-on-surface-variant hover:text-on-surface transition-colors"
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-4 text-sm" aria-label="Primary navigation">
          {Object.entries(grouped).map(([section, sectionItems], idx) => (
            <div key={section} className={cn(idx > 0 && "mt-5")}>
              {!isCollapsed && (
                <div className="px-3 mb-1.5 text-[var(--wireline-typography-overline-size)] font-medium tracking-[0.08em] text-on-surface-variant/70 uppercase">
                  {section}
                </div>
              )}
              <div className="space-y-px">
                {sectionItems.map((item) => {
                  const Icon = item.icon || LayoutDashboard;
                  const active = isActive(item);
                  const badge =
                    (navBadges[item.path] ?? 0) +
                    (item.matches?.reduce((s, m) => s + (navBadges[m] ?? 0), 0) ?? 0);

                  const linkContent = (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={cn(
                        "group flex items-center gap-3 px-3 py-[9px] rounded-md transition-all duration-150",
                        "hover:bg-[var(--wireline-color-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                        active
                          ? "bg-primary/10 text-primary font-medium border-l-3 border-primary -ml-[1px] pl-[11px]"
                          : "text-on-surface hover:text-on-surface",
                        isCollapsed && "justify-center px-2",
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon
                        className={cn(
                          "w-4 h-4 shrink-0 transition-colors",
                          active
                            ? "text-primary"
                            : "text-on-surface-variant group-hover:text-on-surface",
                        )}
                        strokeWidth={active ? 2.5 : 2}
                      />
                      {!isCollapsed && (
                        <span className="truncate text-[var(--wireline-typography-caption-size)] tracking-[-0.1px]">
                          {item.label}
                        </span>
                      )}

                      {!isCollapsed && badge > 0 && (
                        <span className="ml-auto min-w-[18px] h-[17px] px-1.5 rounded-full bg-error/10 text-error text-[var(--wireline-typography-overline-size)] font-mono flex items-center justify-center">
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
                    </Link>
                  );

                  return isCollapsed ? (
                    <Tooltip key={item.path}>
                      <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                      <TooltipContent side="right" className="ml-1">
                        {item.label}
                        {badge > 0 && ` (${badge})`}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    linkContent
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom */}
        <div className="shrink-0 border-t border-[var(--wireline-color-border-default)] px-2 py-3 space-y-1">
          <Link
            to="/help"
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md text-on-surface-variant hover:bg-[var(--wireline-color-surface-subtle)] text-sm",
              isCollapsed && "justify-center px-2",
            )}
          >
            <LifeBuoy className="w-4 h-4" />
            {!isCollapsed && <span>Help & Support</span>}
          </Link>

          {user?.founder_cockpit && (
            <Link
              to="/founder"
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-on-surface-variant hover:bg-[var(--wireline-color-surface-subtle)] text-sm",
                isCollapsed && "justify-center px-2",
              )}
            >
              <Crown className="w-4 h-4" />
              {!isCollapsed && <span>Founder Dashboard</span>}
            </Link>
          )}

          <button
            onClick={signOut}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-md text-on-surface-variant hover:bg-error/5 hover:text-error text-sm text-left",
              isCollapsed && "justify-center px-2",
            )}
          >
            <LogOut className="w-4 h-4" />
            {!isCollapsed && <span>Sign out</span>}
          </button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
