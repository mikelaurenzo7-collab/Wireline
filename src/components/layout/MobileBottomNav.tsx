/**
 * Intentionally unmounted — do not wire into AppShell.
 * Mobile navigation is TopBar hamburger + Sidebar drawer (no bottom tab bar).
 * Kept only as a reference if a future installed PWA shell needs quick tabs.
 */

import React from "react";

import { Link, useLocation } from "react-router-dom";

import { LayoutGrid, Users, Phone, MoreHorizontal } from "lucide-react";

import { cn } from "../../lib/utils";

import { ShadButton } from "../ui/shadcn/ShadButton";

const QUICK_TABS = [
  {
    label: "Studio",

    path: "/agents",

    icon: Users,

    matches: ["/agents"],
  },

  {
    label: "Ops",

    path: "/ops",

    icon: LayoutGrid,

    matches: ["/ops", "/dashboard", "/command", "/live", "/cockpit"],
  },

  {
    label: "Phone",

    path: "/phone",

    icon: Phone,

    matches: ["/phone", "/logs", "/outbound", "/appointments", "/activity"],
  },
] as const;

function isQuickTabActive(pathname: string, matches: readonly string[]) {
  return matches.some((m) => pathname === m || pathname.startsWith(`${m}/`));
}

export default function MobileBottomNav({ onOpenDrawer }: { onOpenDrawer: () => void }) {
  const location = useLocation();

  const onQuickTab = QUICK_TABS.some((tab) => isQuickTabActive(location.pathname, tab.matches));

  return (
    <nav
      data-testid="mobile-bottom-nav"
      aria-label="Quick navigation"
      className="lg:hidden fixed inset-x-0 bottom-0 z-[70] border-t border-black/8 bg-paper/95 dark:bg-[color:var(--wl-velvet)]/95 backdrop-blur-md shadow-[0_-6px_20px_rgba(0,0,0,0.06)] pb-[max(0.35rem,env(safe-area-inset-bottom))]"
    >
      <ul className="grid grid-cols-4 gap-0.5 px-1 pt-1">
        {QUICK_TABS.map((tab) => {
          const active = isQuickTabActive(location.pathname, tab.matches);

          const Icon = tab.icon;

          return (
            <li key={tab.path}>
              <Link
                to={tab.path}
                className={cn(
                  "touch-press flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-md px-1 py-1.5 wl-label font-medium transition-colors",

                  active
                    ? "text-brand bg-brand/10"
                    : "text-muted hover:text-ink hover:bg-black/[0.03]",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden />

                {tab.label}
              </Link>
            </li>
          );
        })}

        <li>
          <ShadButton
            type="button"
            variant="ghost"
            disableAnimations
            onClick={onOpenDrawer}
            className={cn(
              "touch-press w-full h-auto min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1.5 wl-label font-medium",

              !onQuickTab
                ? "text-brand bg-brand/10"
                : "text-muted hover:text-ink hover:bg-black/[0.03]",
            )}
            aria-label="Open full navigation menu"
            aria-expanded={false}
          >
            <MoreHorizontal className="w-4 h-4 shrink-0" aria-hidden />
            More
          </ShadButton>
        </li>
      </ul>
    </nav>
  );
}
