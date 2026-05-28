import React from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "motion/react";
import { LayoutGrid, Inbox, Radio, Headphones, Menu, type LucideIcon } from "lucide-react";

/* ── iOS-style primary bottom navigation bar ──────────────────────────────
   Visible only on mobile (md:hidden on outer). Matches Apple HIG:
   • 49pt item height + env(safe-area-inset-bottom) for home indicator
   • Left/right insets for landscape iPhone notch coverage
   • Max 5 items; "More" opens the slide-in drawer from TopBar
   • Active item: cream icon + label (full brightness)
   • Inactive: cream at 42% opacity
   • Translucent purple background (blurs content beneath)
   ────────────────────────────────────────────────────────────────────────── */

interface NavTab {
  readonly label: string;
  readonly path: string;
  readonly icon: LucideIcon;
  readonly matches?: readonly string[];
  readonly badgePaths: readonly string[];
}

// Mobile primary 4 + More.
//
// Rationale for picks (vs. the desktop 8-item nav):
//   - Live Ops    : pulse-check; first tap of every session
//   - Triage      : inbox-style attention queue; highest re-open rate
//   - Activity    : "what happened" — calls + email + sms + outbound
//   - Cockpit     : listen-in + whisper-coach on the go (mobile USE CASE)
//
// Insights, Agents, Training, Settings live behind "More" — they're either
// review-rate (Insights) or setup-heavy desktop work (Agents, Training,
// Settings). Cockpit beats Agents on mobile because supervising a live
// call from your pocket is the magic moment; editing the fleet roster
// from your pocket is not.
const PRIMARY_TABS: readonly NavTab[] = [
  {
    label: "Live Ops",
    path: "/",
    icon: LayoutGrid,
    // /cockpit removed — it's its own destination now (see TopBar / Sidebar IA).
    matches: ["/dashboard", "/command", "/live"],
    badgePaths: [],
  },
  {
    label: "Triage",
    path: "/triage",
    icon: Inbox,
    badgePaths: ["/triage"],
  },
  {
    label: "Activity",
    path: "/logs",
    icon: Radio,
    matches: ["/outbound", "/inbox", "/appointments", "/sms"],
    badgePaths: ["/logs", "/outbound", "/inbox", "/appointments"],
  },
  {
    label: "Cockpit",
    path: "/cockpit",
    icon: Headphones,
    badgePaths: ["/cockpit"],
  },
];

interface Props {
  onOpenMenu: () => void;
  badges?: Record<string, number>;
}

export default function BottomNavBar({ onOpenMenu, badges = {} }: Props) {
  const { pathname } = useLocation();

  const isActive = (tab: NavTab) => {
    if (pathname === tab.path) return true;
    return tab.matches?.some((m) => pathname === m || pathname.startsWith(`${m}/`)) ?? false;
  };

  const getBadge = (tab: NavTab) => tab.badgePaths.reduce((sum, p) => sum + (badges[p] ?? 0), 0);

  return (
    <nav
      aria-label="Primary navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-[60] flex items-stretch"
      style={{
        /* Translucent purple — identical tint to the TopBar so the app
           feels bookended top and bottom with brand colour. */
        background: "rgba(44, 9, 62, 0.88)",
        backdropFilter: "blur(24px) saturate(200%)",
        WebkitBackdropFilter: "blur(24px) saturate(200%)",
        borderTop: "1px solid rgba(239, 233, 220, 0.10)",
        /* All four safe-area insets: top is 0 at the bottom of the
           screen, bottom clears the home indicator / rounded-corner
           sensor housing, left/right handle landscape notch on older
           iPhones (SE2, 12 mini in landscape). */
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
        boxShadow: "0 -1px 0 rgba(239,233,220,0.06), 0 -12px 32px -12px rgba(30,0,48,0.55)",
      }}
    >
      {PRIMARY_TABS.map((tab) => {
        const active = isActive(tab);
        const badge = getBadge(tab);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.path}
            to={tab.path}
            /* data-no-min-touch: this element has its own explicit min-h-[49px]
               so the global coarse-pointer min-height rule should not apply. */
            data-no-min-touch
            aria-label={badge > 0 ? `${tab.label}, ${badge} unread` : tab.label}
            aria-current={active ? "page" : undefined}
            className="native-tap-squish relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[49px] select-none transition-[transform,opacity] duration-100 active:opacity-80"
            style={{ touchAction: "manipulation" }}
          >
            {active && (
              <motion.span
                layoutId="bottom-nav-active-pill"
                aria-hidden="true"
                className="absolute inset-x-2 top-1 bottom-5 pointer-events-none"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(239,233,220,0.18) 0%, rgba(239,233,220,0.08) 100%)",
                  boxShadow:
                    "0 0 0 1px rgba(239, 233, 220, 0.18) inset, 0 1px 0 rgba(239,233,220,0.22) inset, 0 6px 18px -8px rgba(16, 185, 129, 0.35)",
                }}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            {/* Icon + badge container */}
            <div className="relative z-[1] flex items-center justify-center w-8 h-6">
              <Icon
                className="transition-all duration-150"
                style={{
                  width: 22,
                  height: 22,
                  color: active ? "#EFE9DC" : "rgba(239,233,220,0.42)",
                  strokeWidth: active ? 2.5 : 1.75,
                }}
              />
              {badge > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-mono leading-none flex items-center justify-center text-white select-none"
                  style={{ background: "#E8466A" }}
                >
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </div>

            {/* Label */}
            <span
              className="relative z-[1] text-[10px] font-medium tracking-[0.01em] transition-colors duration-150 leading-none"
              style={{ color: active ? "#EFE9DC" : "rgba(239,233,220,0.42)" }}
            >
              {tab.label}
            </span>
          </Link>
        );
      })}

      {/* More — opens the full slide-in nav drawer */}
      <button
        onClick={onOpenMenu}
        data-no-min-touch
        aria-label="More navigation options"
        className="native-tap-squish flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[49px] select-none transition-[transform,opacity] duration-100 active:opacity-80"
        style={{ touchAction: "manipulation" }}
      >
        <div className="w-8 h-6 flex items-center justify-center">
          <Menu
            style={{
              width: 22,
              height: 22,
              color: "rgba(239,233,220,0.42)",
              strokeWidth: 1.75,
            }}
          />
        </div>
        <span
          className="text-[10px] font-medium tracking-[0.01em] leading-none"
          style={{ color: "rgba(239,233,220,0.42)" }}
        >
          More
        </span>
      </button>
    </nav>
  );
}
