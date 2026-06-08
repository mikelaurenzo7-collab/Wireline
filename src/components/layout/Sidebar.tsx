/**
 * Sidebar.tsx — AurorazRail v2 (shadcn/ui)
 *
 * Vertical desktop nav rail with three states:
 *   - Collapsed: 56px wide, icons only, tooltips on hover
 *   - Expanded:   240px, full labels + shortcuts
 *   - Hover-peek: collapsed rail temporarily renders expanded as overlay
 *
 * Styled with shadcn Tooltip, Avatar, ScrollArea, Separator.
 * Preserves all existing functionality: auto-expand at 1440px, user toggle,
 * localStorage persistence, CSS variable publishing, live pulse, tier badge.
 */
import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ChevronsLeft,
  ChevronsRight,
  Crown,
  LifeBuoy,
  LogOut,
  Search,
  Settings,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import WirelineMark from "../WirelineMark";
import { useAuth } from "../../contexts/AuthContext";
import { useBranding } from "../../contexts/BrandingContext";
import { SIDEBAR_NAV_ITEMS, type NavItem, NAV_SHORTCUT_HINTS } from "../../constants/navigation";
import { BRAND } from "../../constants/brand-colors";
import { authFetch } from "../../lib/api";
import { useLivePresence } from "../../hooks/useLivePresence";
import { WL_CHROME_CLASSES } from "../../lib/wireline-ops-design";
import { cn } from "../../lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/shadcn/Tooltip";
import { ShadButton } from "../ui/shadcn/ShadButton";

const RAIL_COLLAPSED = 56;
const RAIL_EXPANDED = 216;
const AUTO_EXPAND_WIDTH = 1680;

const SHORTCUTS = NAV_SHORTCUT_HINTS;

interface SidebarProps {
  navBadges: Record<string, number>;
}

export default function Sidebar({ navBadges }: SidebarProps) {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { branding } = useBranding();
  const [autoExpanded, setAutoExpanded] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= AUTO_EXPAND_WIDTH : false,
  );
  const [userOverride, setUserOverride] = useState<boolean | null>(null);
  const [peek, setPeek] = useState(false);

  useEffect(() => {
    const onResize = () => setAutoExpanded(window.innerWidth >= AUTO_EXPAND_WIDTH);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (userOverride === null) return;
    localStorage.setItem("wireline_rail_expanded", String(userOverride));
  }, [userOverride]);
  useEffect(() => {
    const stored = localStorage.getItem("wireline_rail_expanded");
    if (stored === "true") setUserOverride(true);
    else if (stored === "false") setUserOverride(false);
  }, []);

  const expanded = userOverride !== null ? userOverride : autoExpanded;
  const effective = expanded || peek;
  useEffect(() => {
    const committed = expanded ? RAIL_EXPANDED : RAIL_COLLAPSED;
    document.documentElement.style.setProperty("--wireline-rail-w", `${committed}px`);
    return () => {
      document.documentElement.style.removeProperty("--wireline-rail-w");
    };
  }, [expanded]);

  const isActive = (item: NavItem) => {
    if (location.pathname === item.path) return true;
    if (!item.matches) return false;
    return item.matches.some(
      (m) => location.pathname === m || location.pathname.startsWith(`${m}/`),
    );
  };

  const liveCalls = useLivePresence();

  return (
    <TooltipProvider delayDuration={300}>
      <aside
        aria-label="Primary navigation"
        data-testid="aurora-rail"
        onMouseEnter={() => !expanded && setPeek(true)}
        onMouseLeave={() => setPeek(false)}
        className={cn(
          "hidden lg:flex shrink-0 flex-col fixed top-0 left-0 bottom-0 z-[55] transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] elev-3 wl-rail-shell",
          "border-r border-white/[0.08]",
        )}
        data-rail={effective ? "expanded" : "collapsed"}
      >
        {/* Logo */}
        <Link
          to="/"
          className="shrink-0 flex items-center gap-3 h-10 px-2.5 group"
          aria-label={`${branding.brand_name} home`}
        >
          <motion.div
            whileHover={{ rotate: 6, scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 360, damping: 26 }}
            className="relative w-8 h-8 shrink-0 rounded-md flex items-center justify-center overflow-hidden elev-1 wl-chrome-logo-chip"
          >
            <WirelineMark
              className="w-4 h-4 relative z-10"
              stroke={BRAND.purpleDeep}
              strokeWidth={130}
            />
            <div className="absolute inset-0 bg-gradient-to-tr from-white/30 to-transparent" />
          </motion.div>
          <AnimatePresence>
            {effective && (
              <motion.span
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                transition={{ duration: 0.18 }}
                className="brand-wordmark text-[15px] leading-none truncate !filter-none text-[color:var(--wl-cream)]"
              >
                {branding.brand_name.toUpperCase()}
              </motion.span>
            )}
          </AnimatePresence>
        </Link>

        {/* Search */}
        <ShadButton
          type="button"
          variant="chrome"
          disableAnimations
          onClick={() => window.dispatchEvent(new CustomEvent("wireline:open-command-bar"))}
          className={cn(
            "shrink-0 mx-1.5 mb-1 h-7 w-[calc(100%-0.75rem)] justify-start gap-2 rounded-md border border-white/20 bg-white/[0.08] hover:bg-white/[0.15] hover:border-white/30 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] dark:hover:border-white/20",
            effective ? "px-2.5" : "px-1.5 justify-center",
          )}
          aria-label="Open search ( / )"
        >
          <Search
            className="w-3.5 h-3.5 shrink-0 text-white/70 group-hover:text-white dark:text-white/50 dark:group-hover:text-white/80 transition-colors"
            strokeWidth={2}
          />
          {effective && (
            <>
              <span className="flex-1 text-left text-xs text-white/70 group-hover:text-white dark:text-white/60 dark:group-hover:text-white/80 transition-colors">
                Search…
              </span>
              <kbd className="wl-micro-badge font-mono px-1.5 py-0.5 rounded border border-white/20 bg-white/10 text-white/60 dark:border-white/12 dark:bg-white/4 dark:text-white/40 leading-none">
                /
              </kbd>
            </>
          )}
        </ShadButton>

        {/* Nav — single flat list; section labels live in page context only.
            justify-start anchors the items directly under Search with an even
            rhythm at every viewport height (justify-center left them floating
            mid-rail with a large gap under Search on tall screens). */}
        <nav
          className="flex-1 min-h-0 flex flex-col justify-start overflow-x-hidden px-1.5 py-0.5 wl-rail-nav"
          aria-label="Console pages"
        >
          <div className="space-y-px">
            {SIDEBAR_NAV_ITEMS.filter((item) => !item.ownerOnly || user?.is_owner === true).map(
              (item, index, items) => {
                const prev = items[index - 1];
                const clusterBreak = prev && prev.section !== item.section;
                return (
                  <React.Fragment key={item.path}>
                    {clusterBreak && <div className="wl-rail-cluster-gap" aria-hidden="true" />}
                    <RailItem
                      item={item}
                      active={isActive(item)}
                      badge={resolveBadge(item, navBadges)}
                      expanded={effective}
                      shortcut={SHORTCUTS[item.path]}
                    />
                  </React.Fragment>
                );
              },
            )}
          </div>
        </nav>

        {/* Footer */}
        <div className="shrink-0 border-t border-white/[0.15] dark:border-white/[0.08] px-1.5 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] space-y-px">
          <LivePulse count={liveCalls} expanded={effective} />

          {effective && user && (
            <Link
              to="/admin?tab=subscription"
              className="flex items-center gap-2 h-8 px-2 rounded-md hover:bg-white/[0.08] dark:hover:bg-white/[0.06] transition-all group"
              aria-label="Account & billing"
              title={user.email}
            >
              <div className="avatar-ring w-7 h-7 rounded-full flex items-center justify-center font-semibold text-[11px] shrink-0 wl-avatar-cream">
                {user.email?.slice(0, 1).toUpperCase() ?? "?"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium text-white/90 dark:text-white/90 leading-none truncate">
                  {user.email?.split("@")[0]}
                </p>
                <TierInline />
              </div>
            </Link>
          )}
          {!effective && user && (
            <Link
              to="/admin?tab=subscription"
              className="h-8 flex items-center justify-center rounded-md hover:bg-white/[0.08] dark:hover:bg-white/[0.06] transition-all"
              aria-label="Account"
              title={user.email}
            >
              <div className="avatar-ring w-7 h-7 rounded-full flex items-center justify-center font-semibold text-[11px] wl-avatar-cream">
                {user.email?.slice(0, 1).toUpperCase() ?? "?"}
              </div>
            </Link>
          )}

          <FooterItem
            to="/help"
            icon={LifeBuoy}
            label="Help"
            expanded={effective}
            active={location.pathname === "/help"}
          />
          <FooterItem
            to="/admin"
            icon={Settings}
            label="Settings"
            dataTour="settings"
            expanded={effective}
            active={
              location.pathname === "/admin" ||
              ["/integrations", "/dnc", "/audit", "/admin"].some(
                (m) => location.pathname === m || location.pathname.startsWith(`${m}/`),
              )
            }
          />
          {user?.is_owner && (
            <FooterItem
              to="/founder"
              icon={Crown}
              label="Founder"
              expanded={effective}
              active={location.pathname === "/founder"}
            />
          )}

          <ShadButton
            type="button"
            variant="ghost"
            disableAnimations
            onClick={() => signOut()}
            className="w-full group h-8 justify-start gap-2 px-2 rounded-md text-white/60 hover:text-rose-300 hover:bg-rose-500/15 dark:text-white/50 dark:hover:text-white/90 dark:hover:bg-white/8"
            aria-label="Sign out"
          >
            <LogOut className="w-4 h-4 shrink-0" strokeWidth={1.75} />
            {effective && <span className="text-[12px] font-medium truncate">Sign out</span>}
          </ShadButton>

          <ShadButton
            type="button"
            variant="ghost"
            disableAnimations
            onClick={() => setUserOverride(!expanded)}
            className="w-full h-7 mt-0.5 justify-center gap-2 px-2 rounded-md text-white/40 hover:text-white/80 hover:bg-white/[0.08] dark:text-white/30 dark:hover:text-white/70 dark:hover:bg-white/6"
            aria-label={expanded ? "Collapse navigation" : "Expand navigation"}
            aria-pressed={expanded}
          >
            {expanded ? (
              <>
                <ChevronsLeft className="w-3.5 h-3.5" />
                <span className="chrome-eyebrow tracking-[0.28em]">Collapse</span>
              </>
            ) : (
              <ChevronsRight className="w-3.5 h-3.5" />
            )}
          </ShadButton>
        </div>
      </aside>
    </TooltipProvider>
  );
}

// ── RailItem ──────────────────────────────────────────────────────────

interface RailItemProps {
  item: NavItem;
  active: boolean;
  badge: number;
  expanded: boolean;
  shortcut?: string;
}

function RailItem({ item, active, badge, expanded, shortcut }: RailItemProps) {
  const Icon = item.icon;

  const link = (
    <Link
      to={item.path}
      {...(item.dataTour ? { "data-tour": item.dataTour } : {})}
      aria-label={expanded ? undefined : item.label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "touch-press group relative flex items-center gap-2 h-8 px-2 rounded-md transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
        active
          ? cn(
              "bg-white/[0.15] text-white font-semibold dark:bg-white/[0.12] dark:text-white",
              WL_CHROME_CLASSES.railItemActive,
            )
          : "text-white/70 hover:text-white hover:bg-white/[0.08] dark:text-white/55 dark:hover:text-white/85 dark:hover:bg-white/[0.06]",
      )}
    >
      {/* Active accent stripe */}
      {active && (
        <span
          aria-hidden="true"
          className="absolute -left-2 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-brand shadow-[0_0_10px] shadow-brand/50"
        />
      )}
      <Icon
        className={cn(
          "relative z-10 w-4 h-4 shrink-0 transition-transform duration-200",
          active && "group-hover:scale-110",
        )}
        strokeWidth={active ? 2.5 : 1.75}
      />
      {expanded && (
        <>
          <span
            className={cn(
              "relative z-10 flex-1 min-w-0 truncate text-[12px] transition-colors",
              active ? "font-semibold" : "font-medium",
            )}
          >
            {item.label}
          </span>
          {item.betaLabel && (
            <span className="relative z-10 wl-rail-beta-badge shrink-0">{item.betaLabel}</span>
          )}
          {shortcut && !badge && !item.betaLabel && (
            <kbd
              className={cn(
                "relative z-10 wl-micro-badge font-mono px-1.5 py-0.5 rounded leading-none border whitespace-nowrap",
                active
                  ? "border-white/25 text-white/70 bg-white/10 dark:border-white/15 dark:text-white/55 dark:bg-white/10"
                  : "border-white/20 text-white/50 bg-white/[0.05] group-hover:border-white/30 group-hover:text-white/70 dark:border-white/12 dark:text-white/40 dark:bg-white/4 dark:group-hover:border-white/20 dark:group-hover:text-white/60",
              )}
            >
              {shortcut}
            </kbd>
          )}
        </>
      )}
      {badge > 0 && (
        <span
          aria-label={`${badge} item${badge === 1 ? "" : "s"} need attention in ${item.label}`}
          className={cn(
            "relative z-10 shrink-0 min-w-[18px] h-[18px] px-1.5 rounded-full wl-micro-badge font-mono leading-none flex items-center justify-center font-semibold",
            !expanded && "absolute top-1 right-1 min-w-[14px] h-3.5 px-1 wl-micro-badge",
            active
              ? "bg-white/25 text-white dark:bg-white/20 dark:text-white"
              : "bg-rose-500/10 text-rose-600 border border-rose-500/20 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/30",
          )}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );

  if (!expanded) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" className="ml-1">
          <span className="flex items-center gap-2">
            {item.label}
            {item.betaLabel && (
              <span className="wl-rail-beta-badge text-[10px]">{item.betaLabel}</span>
            )}
            {shortcut && <kbd className="wl-micro-badge font-mono text-white/40">{shortcut}</kbd>}
          </span>
        </TooltipContent>
      </Tooltip>
    );
  }

  return link;
}

function resolveBadge(item: NavItem, navBadges: Record<string, number>): number {
  return (
    (navBadges[item.path] ?? 0) +
    (item.matches?.reduce((sum, m) => sum + (navBadges[m] ?? 0), 0) ?? 0)
  );
}

// ── LivePulse ─────────────────────────────────────────────────────────

function LivePulse({ count, expanded }: { count: number; expanded: boolean }) {
  const live = count > 0;
  return (
    <div
      className={cn(
        "flex items-center gap-2 h-7 px-2 rounded-md",
        live ? "bg-purple-500/10 wl-ambient-glow" : "bg-white/[0.03]",
      )}
      title={live ? `${count} live call${count === 1 ? "" : "s"}` : "Floor is quiet"}
    >
      <span className="relative inline-flex w-2.5 h-2.5 shrink-0 items-center justify-center">
        {live && <span className="absolute inset-0 rounded-full animate-ping bg-purple-400/55" />}
        <span
          className={cn(
            "relative w-2 h-2 rounded-full",
            live ? "wl-live-pulse-dot--active" : "wl-live-pulse-dot",
          )}
        />
      </span>
      {expanded && (
        <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
          <span className="chrome-eyebrow tracking-[0.2em]">
            {live ? "Fleet pulse" : "Standing by"}
          </span>
          <span className="wl-micro-badge font-mono text-white/75">{count > 0 ? count : "—"}</span>
        </div>
      )}
    </div>
  );
}

// ── FooterItem ────────────────────────────────────────────────────────

interface FooterItemProps {
  to: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  expanded: boolean;
  active: boolean;
  dataTour?: string;
}

function FooterItem({ to, icon: Icon, label, expanded, active, dataTour }: FooterItemProps) {
  const link = (
    <Link
      to={to}
      {...(dataTour ? { "data-tour": dataTour } : {})}
      aria-current={active ? "page" : undefined}
      className={cn(
        "touch-press group relative h-8 flex items-center gap-2 px-2 rounded-md transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
        active
          ? cn(
              "bg-white/[0.15] text-white font-semibold dark:bg-white/10 dark:text-white/90",
              WL_CHROME_CLASSES.railFooterActive,
            )
          : "text-white/70 hover:text-white hover:bg-white/[0.08] dark:text-white/50 dark:hover:text-white/80 dark:hover:bg-white/[0.06]",
      )}
    >
      {active && (
        <span
          aria-hidden="true"
          className="absolute -left-2 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-brand shadow-[0_0_10px] shadow-brand/50"
        />
      )}
      <Icon className="w-4 h-4 shrink-0 relative z-10" strokeWidth={active ? 2.5 : 1.75} />
      {expanded && <span className="text-[12px] font-medium truncate relative z-10">{label}</span>}
    </Link>
  );

  if (!expanded) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" className="ml-1">
          {label}
        </TooltipContent>
      </Tooltip>
    );
  }
  return link;
}

// ── TierInline ────────────────────────────────────────────────────────

function TierInline() {
  const { user } = useAuth();
  const [tier, setTier] = useState<{
    plan_name?: string;
    voice_minutes_used?: number;
    voice_minutes_cap?: number;
  } | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const fetchTier = async () => {
      try {
        const r = await authFetch("/api/billing/usage");
        if (!r.ok || cancelled) return;
        const d = await r.json();
        if (!cancelled) setTier(d);
      } catch {
        /* non-critical */
      }
    };
    fetchTier();
    const id = setInterval(fetchTier, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user]);

  if (!tier?.plan_name) {
    return (
      <p className="chrome-eyebrow tracking-[0.2em] leading-none mt-1 truncate">
        {user?.email?.split("@")[1]}
      </p>
    );
  }
  const used = tier.voice_minutes_used ?? 0;
  const cap = tier.voice_minutes_cap ?? 0;
  const overage = cap > 0 && used > cap;
  const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
  const pct = cap > 0 ? Math.min(100, (used / cap) * 100) : 0;
  return (
    <div className="mt-1 leading-none">
      <span
        className={cn(
          "text-[8.5px] uppercase tracking-[0.25em] font-semibold transition-colors",
          overage ? "text-rose-300 dark:text-rose-300" : "text-white/75 dark:text-white/55",
        )}
      >
        {tier.plan_name}
        {cap > 0 && (
          <>
            <span className="mx-0.5 opacity-40">•</span>
            <span className="font-mono normal-case tracking-normal">
              {fmt(used)}/{fmt(cap)}
            </span>
          </>
        )}
      </span>
      {cap > 0 && (
        <div
          role="progressbar"
          aria-valuenow={used}
          aria-valuemin={0}
          aria-valuemax={cap}
          aria-label="Voice minutes usage"
          className="mt-0.5 h-[2px] rounded-full overflow-hidden bg-white/15 dark:bg-white/8"
          data-tier-pct={`${pct}%`}
        >
          <div
            className={cn(
              "h-full rounded-full transition-all",
              overage ? "wl-tier-progress-fill--overage" : "wl-tier-progress-fill",
            )}
          />
        </div>
      )}
    </div>
  );
}

export function getRailWidth() {
  return { collapsed: RAIL_COLLAPSED, expanded: RAIL_EXPANDED };
}
