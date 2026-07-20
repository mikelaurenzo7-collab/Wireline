import { Link, useLocation } from "react-router-dom";
import { motion } from "motion/react";
import { useRef } from "react";
import type { ComponentType, KeyboardEvent, SVGProps } from "react";
import { cn } from "../lib/utils";

export interface HubTabDef {
  label: string;
  path: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

interface HubTabsProps {
  tabs: HubTabDef[];
  /** Optional aria-label for the tab strip. */
  label?: string;
  className?: string;
  /** Unique prefix so motion layoutIds never collide across route transitions. */
  layoutIdPrefix?: string;
}

export function resolveHubTabFocusIndex(
  currentIndex: number,
  key: KeyboardEvent<HTMLElement>["key"],
  length: number,
): number | null {
  if (length < 2) return null;
  if (key === "ArrowRight") return (currentIndex + 1) % length;
  if (key === "ArrowLeft") return (currentIndex - 1 + length) % length;
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  return null;
}

/**
 * Sub-navigation strip for grouped pages. Each tab is a Link to its own
 * route, so existing deep-links keep working — the strip just gives the
 * Account Holder one-click access to siblings within the same hub (Training,
 * Channels, System). Active-state matches by current pathname so the
 * strip stays correct on direct navigation.
 *
 * The active pill uses motion's layoutId so it glides between tabs the
 * same way the landing page's Pricing tier toggle does. Tokens drive the
 * brand surface (no inline hex) so future palette tweaks propagate.
 */
export default function HubTabs({ tabs, label, className, layoutIdPrefix }: HubTabsProps) {
  const { pathname } = useLocation();
  const pillLayoutId = layoutIdPrefix ?? `hub-tabs-${tabs.map((t) => t.path).join("-")}-pill`;
  const tabRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  return (
    <nav
      aria-label={label || "Section navigation"}
      className={cn(
        "shrink-0 mb-0 md:mb-3 flex items-center gap-1 overflow-x-auto tab-strip-scroll max-sm:tab-strip-scroll--fade",
        className,
      )}
    >
      <div className="app-tab-strip flex items-center gap-0.5 p-0.5 wl-panel border border-border">
        {tabs.map((t, index) => {
          const Icon = t.icon;
          const active = pathname === t.path || pathname.startsWith(`${t.path}/`);
          return (
            <Link
              key={t.path}
              to={t.path}
              aria-current={active ? "page" : undefined}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              onKeyDown={(event) => {
                const nextIndex = resolveHubTabFocusIndex(index, event.key, tabs.length);
                if (nextIndex == null) return;
                event.preventDefault();
                tabRefs.current[nextIndex]?.focus();
              }}
              className={cn(
                "group relative shrink-0 inline-flex min-h-10 items-center gap-1.5 px-3 py-1.5 transition-all text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.1em] font-medium touch-press hover:scale-[1.02]",
                active ? "app-tab-active" : "text-muted hover:text-foreground hover:bg-muted/10",
              )}
            >
              {active && (
                <motion.span
                  layoutId={pillLayoutId}
                  aria-hidden="true"
                  className="app-tab-active-bg absolute inset-0"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <Icon
                aria-hidden="true"
                className="relative z-[1] w-3 h-3 transition-transform duration-200 group-hover:scale-110"
              />
              <span className="relative z-[1]">{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Hub definitions — a single source of truth so each member page renders
// the same strip without drifting.
// ──────────────────────────────────────────────────────────────────────────

import { MessageCircle, History, Mail } from "lucide-react";

// TRAINING_HUB removed in 2026-06 IA audit — Chat + Training consolidated into Studio.
// Training sub-tabs now live inside the Studio Tuning Rail (Knowledge, Voice, Flow, Simulator).

export const CHANNELS_HUB: HubTabDef[] = [
  { label: "Phone", path: "/phone", icon: History },
  { label: "Email", path: "/email", icon: Mail },
  { label: "SMS", path: "/sms", icon: MessageCircle },
];
