import { Link, useLocation } from "react-router-dom";
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
      <div className="flex items-center gap-0.5 p-0.5 rounded-xl glass border border-black/8">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = pathname === t.path || pathname.startsWith(`${t.path}/`);
          return (
            <Link
              key={t.path}
              to={t.path}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative shrink-0 inline-flex min-h-10 items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all text-[11px] uppercase tracking-[0.1em] font-medium",
                active ? "text-on-brand" : "text-muted hover:text-ink hover:bg-black/5",
              )}
              style={
                active
                  ? {
                      background: "#4F1E7B",
                      boxShadow:
                        "0 3px 12px -6px rgba(79, 30, 123 ,0.50), 0 0 0 1px rgba(255,255,255,0.18) inset",
                    }
                  : undefined
              }
            >
              <Icon className="w-3 h-3" />
              <span>{t.label}</span>
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
  { label: "Lessons", path: "/train", icon: MessageSquare },
  { label: "Knowledge", path: "/knowledge", icon: Database },
];

export const CHANNELS_HUB: HubTabDef[] = [
  { label: "Logs", path: "/logs", icon: History },
  { label: "Outbound", path: "/outbound", icon: PhoneOutgoing },
  { label: "Email", path: "/inbox", icon: Mail },
  { label: "SMS", path: "/sms", icon: MessageCircle },
  { label: "Appointments", path: "/appointments", icon: Calendar },
];
