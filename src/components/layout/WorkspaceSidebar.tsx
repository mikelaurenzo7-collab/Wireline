/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * WorkspaceSidebar.tsx — Wide labeled sidebar for enterprise workspace parity (Stitch North Star).
 *
 * Matches the attached screenshots exactly:
 * - 256px fixed width
 * - Icons + full text labels
 * - Purple (#5d3fd3) active left accent bar + active styling
 * - Clean section clustering
 * - Ametrine Precision tokens (surface, primary, 4px radius, Hanken Grotesk hooks)
 * - Reuses the exact same navigation data as the compact rail (no duplication)
 *
 * Usage:
 *   <WorkspaceSidebar navBadges={badges} variant="wide" />
 *   or toggle via user preference / workspace type.
 *
 * This is additive and does not replace the compact rail. Builder-heavy flows can stay on the 56px rail.
 */
import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, Users, Bot, BookOpen, Plug, Inbox, Settings, 
  LifeBuoy, LogOut, Crown 
} from "lucide-react";
import { motion } from "motion/react";
import { cn } from "../../lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/shadcn/Tooltip";
import { useAuth } from "../../contexts/AuthContext";
import { useAccount } from "../../contexts/AccountContext";
import { accountSidebarItems } from "../../lib/account-type";
import { type NavItem } from "../../constants/navigation";
import { BRAND } from "../../constants/brand-colors";

interface WorkspaceSidebarProps {
  navBadges?: Record<string, number>;
  className?: string;
  /**
   * 'wide' = 256px labeled (North Star default for Overview/Knowledge/etc.)
   * 'rail' = falls back to compact behavior if needed
   */
  variant?: "wide" | "rail";
}

export default function WorkspaceSidebar({ 
  navBadges = {}, 
  className,
  variant = "wide" 
}: WorkspaceSidebarProps) {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { accountType } = useAccount();
  const [isExpanded, setIsExpanded] = useState(true); // future: persist to user pref

  const isActive = (item: NavItem) => {
    if (location.pathname === item.path) return true;
    if (!item.matches) return false;
    return item.matches.some(m => location.pathname === m || location.pathname.startsWith(`${m}/`));
  };

  const items = accountSidebarItems(accountType).filter(
    (item) => !item.ownerOnly || user?.is_owner === true
  );

  // Group by section for clean clustering (matches North Star visual rhythm)
  const grouped = items.reduce((acc, item) => {
    const section = item.section || "General";
    if (!acc[section]) acc[section] = [];
    acc[section].push(item);
    return acc;
  }, {} as Record<string, NavItem[]>);

  if (variant === "rail") {
    // Future: delegate to compact rail or render minimal version
    return null;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        aria-label="Workspace navigation"
        className={cn(
          "hidden lg:flex shrink-0 flex-col fixed top-0 left-0 bottom-0 z-[55] border-r border-outline-variant bg-surface",
          "w-[256px]", // Exact North Star width
          className
        )}
        data-testid="workspace-sidebar-wide"
        data-ametrine-sidebar="true"
      >
        {/* Top Logo Lockup — matches screenshots */}
        <div className="flex items-center gap-3 px-6 h-16 border-b border-outline-variant">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
            <span className="text-white font-bold text-lg tracking-[-1px]">W</span>
          </div>
          <div>
            <div className="font-semibold text-[17px] tracking-[-0.3px] text-on-surface">Wireline</div>
            <div className="text-[10px] text-on-surface-variant -mt-0.5">Enterprise Workspace</div>
          </div>
        </div>

        {/* Navigation — exact visual match to North Star */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 text-sm" aria-label="Primary navigation">
          {Object.entries(grouped).map(([section, sectionItems], idx) => (
            <div key={section} className={cn(idx > 0 && "mt-6")}>
              <div className="px-3 mb-1.5 text-[10px] font-medium tracking-[0.08em] text-on-surface-variant/70 uppercase">
                {section}
              </div>
              <div className="space-y-px">
                {sectionItems.map((item) => {
                  const Icon = item.icon || LayoutDashboard;
                  const active = isActive(item);
                  const badge = (navBadges[item.path] ?? 0) + 
                    (item.matches?.reduce((s, m) => s + (navBadges[m] ?? 0), 0) ?? 0);

                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={cn(
                        "group flex items-center gap-3 px-3 py-[9px] rounded-base transition-all",
                        "hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                        active 
                          ? "bg-primary/10 text-primary font-medium border-l-3 border-primary -ml-[1px] pl-[11px]" 
                          : "text-on-surface hover:text-on-surface"
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon 
                        className={cn(
                          "w-4 h-4 shrink-0 transition-colors",
                          active ? "text-primary" : "text-on-surface-variant group-hover:text-on-surface"
                        )} 
                        strokeWidth={active ? 2.5 : 2} 
                      />
                      <span className="truncate text-[13.5px] tracking-[-0.1px]">{item.label}</span>

                      {badge > 0 && (
                        <span className="ml-auto min-w-[18px] h-[17px] px-1.5 rounded-full bg-error/10 text-error text-[10px] font-mono flex items-center justify-center">
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom section — User + Help (matches screenshot rhythm) */}
        <div className="shrink-0 border-t border-outline-variant px-3 py-3 space-y-1">
          <Link
            to="/help"
            className="flex items-center gap-3 px-3 py-2 rounded-base text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface text-sm"
          >
            <LifeBuoy className="w-4 h-4" />
            <span>Help & Support</span>
          </Link>

          {user?.is_owner && (
            <Link
              to="/founder"
              className="flex items-center gap-3 px-3 py-2 rounded-base text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface text-sm"
            >
              <Crown className="w-4 h-4" />
              <span>Founder Dashboard</span>
            </Link>
          )}

          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-base text-on-surface-variant hover:bg-error/5 hover:text-error text-sm text-left"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
