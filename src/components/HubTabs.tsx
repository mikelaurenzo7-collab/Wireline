import { Link, useLocation } from "react-router-dom";
import { motion } from "motion/react";
import type { ComponentType, SVGProps } from "react";
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
}

/**
 * Sub-navigation strip for grouped pages. Each tab is a Link to its own
 * route, so existing deep-links keep working — the strip just gives the
 * operator one-click access to siblings within the same hub (Training,
 * Channels, System). Active-state matches by current pathname so the
 * strip stays correct on direct navigation.
 *
 * The active pill uses motion's layoutId so it glides between tabs the
 * same way the landing page's Pricing tier toggle does. Tokens drive the
 * brand surface (no inline hex) so future palette tweaks propagate.
 */
export default function HubTabs({ tabs, label, className }: HubTabsProps) {
  const { pathname } = useLocation();
  return (
    <nav
      aria-label={label || "Section navigation"}
      className={cn(
        "shrink-0 mb-0 md:mb-3 flex items-center gap-1 overflow-x-auto scrollbar-hide",
        className,
      )}
    >
      <div className="flex items-center gap-0.5 p-0.5 glass border border-ink/[0.06] shadow-[0_1px_0_rgba(255,255,255,0.6)_inset]">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = pathname === t.path || pathname.startsWith(`${t.path}/`);
          return (
            <Link
              key={t.path}
              to={t.path}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative shrink-0 inline-flex min-h-10 items-center gap-1.5 px-3 py-1.5 transition-colors text-[11px] uppercase tracking-[0.1em] font-medium",
                active ? "text-on-brand" : "text-muted hover:text-ink hover:bg-ink/[0.04]",
              )}
            >
              {active && (
                <motion.span
                  layoutId="hub-tabs-active-pill"
                  aria-hidden="true"
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background:
                      "linear-gradient(180deg, var(--color-brand) 0%, var(--color-brand-deep) 100%)",
                    boxShadow:
                      "0 3px 12px -6px color-mix(in srgb, var(--color-brand) 60%, transparent), 0 0 0 1px rgba(255,255,255,0.18) inset, 0 1px 0 rgba(255,255,255,0.32) inset",
                  }}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <Icon className="relative z-[1] w-3 h-3 transition-transform duration-200 group-hover:scale-110" />
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

import {
  MessageSquare,
  MessageCircle,
  Database,
  History,
  PhoneOutgoing,
  Mail,
  Calendar,
} from "lucide-react";

export const TRAINING_HUB: HubTabDef[] = [
  { label: "Chat", path: "/chat", icon: MessageSquare },
  { label: "Knowledge", path: "/knowledge", icon: Database },
];

export const CHANNELS_HUB: HubTabDef[] = [
  { label: "Logs", path: "/logs", icon: History },
  { label: "Outbound", path: "/outbound", icon: PhoneOutgoing },
  { label: "Email", path: "/inbox", icon: Mail },
  { label: "SMS", path: "/sms", icon: MessageCircle },
  { label: "Appointments", path: "/appointments", icon: Calendar },
];
