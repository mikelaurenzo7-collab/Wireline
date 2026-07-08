/**
 * Sidebar.tsx — compact desktop command rail.
 *
 * Desktop navigation must never steal builder canvas width. The full menu lives
 * in the mobile/tablet drawer and the command bar; desktop keeps a permanent
 * 56px icon strip with tooltips only.
 */
import React, { useEffect, useState, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { LifeBuoy, LogOut, Search, Settings, CreditCard, PlugZap } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import WirelineMark from "../WirelineMark";
import ThemeToggle from "../ThemeToggle";
import { useAuth } from "../../contexts/AuthContext";
import { useAccount } from "../../contexts/AccountContext";
import { useBranding } from "../../contexts/BrandingContext";
import { useToast } from "../../contexts/ToastContext";
import { type NavItem, NAV_SHORTCUT_HINTS } from "../../constants/navigation";
import { accountSidebarItems } from "../../lib/account-type";
import { BRAND } from "../../constants/brand-colors";
import { authFetch } from "../../lib/api";
import { useLivePresence } from "../../hooks/useLivePresence";
import { WL_CHROME_CLASSES } from "../../lib/wireline-ops-design";
import { cn } from "../../lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/shadcn/Tooltip";
import { ShadButton } from "../ui/shadcn/ShadButton";

const RAIL_COLLAPSED = 56;
const RAIL_EXPANDED = 56;
const SHORTCUTS = NAV_SHORTCUT_HINTS;

interface SidebarProps {
  navBadges: Record<string, number>;
}

export default function Sidebar({ navBadges }: SidebarProps) {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { accountType } = useAccount();
  useToast();
  const { branding } = useBranding();
  const liveCalls = useLivePresence();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  // Close avatar dropdown on outside click or Escape.
  useEffect(() => {
    if (!userMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node))
        setUserMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [userMenuOpen]);

  useEffect(() => {
    document.documentElement.style.setProperty("--wireline-rail-w", `${RAIL_COLLAPSED}px`);
    return () => {
      document.documentElement.style.removeProperty("--wireline-rail-w");
    };
  }, []);

  const isActive = (item: NavItem) => {
    if (location.pathname === item.path) return true;
    if (!item.matches) return false;
    return item.matches.some(
      (m) => location.pathname === m || location.pathname.startsWith(`${m}/`),
    );
  };

  return (
    <TooltipProvider delayDuration={220}>
      <aside
        aria-label="Primary navigation"
        data-testid="sidebar-rail"
        className={cn(
          "hidden lg:flex shrink-0 flex-col fixed top-0 left-0 bottom-0 z-[55] w-[56px] elev-3 wl-rail-shell",
          "border-r border-white/[0.08]",
        )}
        data-rail="collapsed"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to="/overview"
              className="shrink-0 flex items-center justify-center h-11 group"
              aria-label={`${branding.brand_name} Studio`}
            >
              <motion.div
                whileHover={{ rotate: 6, scale: 1.05 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: "spring", stiffness: 360, damping: 26 }}
                className="relative w-8 h-8 shrink-0 rounded-md flex items-center justify-center overflow-hidden elev-1 wl-chrome-logo-chip"
              >
                <WirelineMark
                  className="w-4 h-4 relative z-10"
                  stroke={BRAND.colors.primaryVariant}
                  strokeWidth={130}
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-white/30 to-transparent" />
              </motion.div>
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right" className="ml-1">
            {branding.brand_name} Studio
          </TooltipContent>
        </Tooltip>

        <div className="px-1.5 pb-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <ShadButton
                type="button"
                variant="chrome"
                disableAnimations
                onClick={() => window.dispatchEvent(new CustomEvent("wireline:open-command-bar"))}
                className="h-8 w-full justify-center rounded-md border border-white/20 bg-white/[0.08] hover:bg-white/[0.15] hover:border-white/30 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] dark:hover:border-white/20"
                aria-label="Open command bar"
              >
                <Search className="w-4 h-4 shrink-0 text-white/70" strokeWidth={2} />
              </ShadButton>
            </TooltipTrigger>
            <TooltipContent side="right" className="ml-1">
              <span className="flex items-center gap-2">
                Search
                <kbd className="wl-micro-badge font-mono text-white/55">/</kbd>
              </span>
            </TooltipContent>
          </Tooltip>
        </div>

        <nav
          className="flex-1 min-h-0 flex flex-col justify-start overflow-x-hidden px-1.5 py-0.5 wl-rail-nav"
          aria-label="Console pages"
        >
          <div className="space-y-px">
            {accountSidebarItems(accountType)
              .filter((item) => !item.ownerOnly || user?.is_owner === true)
              .map((item, index, items) => {
                const prev = items[index - 1];
                const clusterBreak = prev && prev.section !== item.section;
                return (
                  <React.Fragment key={item.path}>
                    {clusterBreak && <div className="wl-rail-cluster-gap" aria-hidden="true" />}
                    <RailItem
                      item={item}
                      active={isActive(item)}
                      badge={resolveBadge(item, navBadges)}
                      shortcut={SHORTCUTS[item.path]}
                    />
                  </React.Fragment>
                );
              })}
          </div>
        </nav>

        <div className="shrink-0 border-t border-white/[0.15] dark:border-white/[0.08] px-1.5 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] space-y-px">
          <LivePulse count={liveCalls} />

          {user && (
            <div ref={userMenuRef} className="relative z-[95]">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setUserMenuOpen((v) => !v)}
                    className="h-8 w-full flex items-center justify-center rounded-md hover:bg-white/[0.08] dark:hover:bg-white/[0.06] transition-all touch-press hover:scale-[1.02]"
                    aria-label="Account menu"
                    aria-expanded={userMenuOpen}
                    title={user.email}
                  >
                    <div className="avatar-ring w-7 h-7 rounded-full flex items-center justify-center font-semibold text-[var(--wireline-typography-overline-size)] wl-avatar-cream">
                      {user.email?.slice(0, 1).toUpperCase() ?? "?"}
                    </div>
                  </button>
                </TooltipTrigger>
                {!userMenuOpen && (
                  <TooltipContent side="right" className="ml-1">
                    <div className="space-y-1">
                      <p className="text-xs font-medium">Account</p>
                      <TierInline />
                    </div>
                  </TooltipContent>
                )}
              </Tooltip>

              <AnimatePresence>
                {userMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, x: -8, scale: 0.97 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -8, scale: 0.97 }}
                    transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
                    role="menu"
                    aria-label="Account menu"
                    className="absolute left-[48px] bottom-0 min-w-[240px] w-64 md:w-72 rounded-md border border-white/10 bg-card dark:bg-card wl-card-shine shadow-2xl shadow-brand/12 overflow-hidden z-[99]"
                  >
                    {/* Account header — brand-tinted */}
                    <div className="relative px-4 py-3.5 border-b border-white/8 overflow-hidden text-left">
                      <div className="absolute inset-0 bg-gradient-to-br from-brand/[0.04] to-transparent pointer-events-none" />
                      <p className="wl-label-muted mb-1">Signed in as</p>
                      <p className="text-[var(--wireline-typography-caption-size)] font-semibold text-foreground truncate relative z-10">
                        {user.email || "—"}
                      </p>
                    </div>

                    <div className="py-1 text-left">
                      <Link
                        to="/admin?tab=subscription"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-[var(--wireline-typography-caption-size)] font-medium text-foreground/70 hover:bg-brand/[0.04] hover:text-foreground transition-colors group"
                        role="menuitem"
                      >
                        <CreditCard className="w-3.5 h-3.5 text-brand/40 group-hover:text-brand/60 transition-colors" />
                        Billing &amp; subscription
                      </Link>
                      <Link
                        to="/admin"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-[var(--wireline-typography-caption-size)] font-medium text-foreground/70 hover:bg-brand/[0.04] hover:text-foreground transition-colors group"
                        role="menuitem"
                      >
                        <Settings className="w-3.5 h-3.5 text-brand/40 group-hover:text-brand/60 transition-colors" />
                        Settings
                      </Link>
                      <Link
                        to="/connections"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-[var(--wireline-typography-caption-size)] font-medium text-foreground/70 hover:bg-brand/[0.04] hover:text-foreground transition-colors group"
                        role="menuitem"
                      >
                        <PlugZap className="w-3.5 h-3.5 text-brand/40 group-hover:text-brand/60 transition-colors" />
                        Integrations
                      </Link>
                      <Link
                        to="/help"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-[var(--wireline-typography-caption-size)] font-medium text-foreground/70 hover:bg-brand/[0.04] hover:text-foreground transition-colors group"
                        role="menuitem"
                      >
                        <LifeBuoy className="w-3.5 h-3.5 text-brand/40 group-hover:text-brand/60 transition-colors" />
                        Help &amp; support
                      </Link>
                    </div>
                    <div className="border-t border-white/8 py-1 text-left">
                      <ShadButton
                        type="button"
                        variant="ghost"
                        disableAnimations
                        onClick={() => {
                          setUserMenuOpen(false);
                          signOut();
                        }}
                        className="w-full justify-start gap-2.5 px-4 py-2 h-auto text-[var(--wireline-typography-caption-size)] font-medium text-rose-600 hover:bg-rose-500/[0.06] hover:text-rose-600"
                        role="menuitem"
                      >
                        <LogOut className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                        Sign out
                      </ShadButton>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          <FooterItem
            to="/help"
            icon={LifeBuoy}
            label="Help"
            active={location.pathname === "/help"}
          />
          <FooterItem
            to="/admin"
            icon={Settings}
            label="Settings"
            dataTour="settings"
            active={
              location.pathname === "/admin" ||
              ["/dnc", "/audit", "/admin"].some(
                (m) => location.pathname === m || location.pathname.startsWith(`${m}/`),
              )
            }
          />

          <Tooltip>
            <TooltipTrigger asChild>
              <ThemeToggle
                variant="default"
                compact
                className="w-full h-8 justify-center px-2 rounded-md text-white/60 hover:text-white hover:bg-white/[0.08] touch-press hover:scale-[1.02]"
              />
            </TooltipTrigger>
            <TooltipContent side="right" className="ml-1">
              Switch Theme
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <ShadButton
                type="button"
                variant="ghost"
                disableAnimations
                onClick={() => signOut()}
                className="w-full h-8 justify-center px-2 rounded-md text-white/60 hover:text-rose-300 hover:bg-rose-500/15 dark:text-white/50 dark:hover:text-white/90 dark:hover:bg-white/8 touch-press hover:scale-[1.02]"
                aria-label="Sign out"
              >
                <LogOut className="w-4 h-4 shrink-0" strokeWidth={1.75} />
              </ShadButton>
            </TooltipTrigger>
            <TooltipContent side="right" className="ml-1">
              Sign out
            </TooltipContent>
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}

interface RailItemProps {
  item: NavItem;
  active: boolean;
  badge: number;
  shortcut?: string;
}

function RailItem({ item, active, badge, shortcut }: RailItemProps) {
  const Icon = item.icon;
  const link = (
    <Link
      to={item.path}
      {...(item.dataTour ? { "data-tour": item.dataTour } : {})}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "touch-press hover:scale-[1.02] group relative flex items-center justify-center h-8 px-2 rounded-md transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
        active
          ? cn(
              "bg-white/[0.15] text-white font-semibold dark:bg-white/[0.12] dark:text-white",
              WL_CHROME_CLASSES.railItemActive,
            )
          : "text-white/70 hover:text-white hover:bg-white/[0.08] dark:text-white/55 dark:hover:text-white/85 dark:hover:bg-white/[0.06]",
      )}
    >
      {active && (
        <motion.span
          layoutId="rail-active-stripe"
          aria-hidden="true"
          className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-brand shadow-[0_0_10px] shadow-brand/50"
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        />
      )}
      <Icon
        className={cn(
          "relative z-10 w-4 h-4 shrink-0 transition-transform duration-200",
          active && "group-hover:scale-110",
        )}
        strokeWidth={active ? 2.5 : 1.75}
      />
      {item.betaLabel && <span className="sr-only"> {item.betaLabel}</span>}
      {badge > 0 && (
        <span
          aria-label={`${badge} item${badge === 1 ? "" : "s"} need attention in ${item.label}`}
          className={cn(
            "absolute top-1 right-1 z-10 min-w-[14px] h-3.5 px-1 rounded-full wl-micro-badge font-mono leading-none flex items-center justify-center font-semibold",
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

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" className="ml-1">
        <span className="flex items-center gap-2">
          {item.label}
          {item.betaLabel && <span className="wl-rail-beta-badge">{item.betaLabel}</span>}
          {shortcut && <kbd className="wl-micro-badge font-mono text-white/55">{shortcut}</kbd>}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

function resolveBadge(item: NavItem, navBadges: Record<string, number>): number {
  return (
    (navBadges[item.path] ?? 0) +
    (item.matches?.reduce((sum, m) => sum + (navBadges[m] ?? 0), 0) ?? 0)
  );
}

function LivePulse({ count }: { count: number }) {
  const live = count > 0;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "flex items-center justify-center h-7 px-2 rounded-md",
            live ? "bg-primary/10 wl-ambient-glow" : "bg-white/[0.03]",
          )}
          title={live ? `${count} live call${count === 1 ? "" : "s"}` : "No live calls"}
        >
          <span className="relative inline-flex w-2.5 h-2.5 shrink-0 items-center justify-center">
            {live && <span className="absolute inset-0 rounded-full animate-ping bg-primary/55" />}
            <span
              className={cn(
                "relative w-2 h-2 rounded-full",
                live ? "wl-live-pulse-dot--active" : "wl-live-pulse-dot",
              )}
            />
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" className="ml-1">
        {live ? `${count} live call${count === 1 ? "" : "s"}` : "Standing by"}
      </TooltipContent>
    </Tooltip>
  );
}

interface FooterItemProps {
  to: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  active: boolean;
  dataTour?: string;
}

function FooterItem({ to, icon: Icon, label, active, dataTour }: FooterItemProps) {
  const link = (
    <Link
      to={to}
      {...(dataTour ? { "data-tour": dataTour } : {})}
      aria-current={active ? "page" : undefined}
      aria-label={label}
      className={cn(
        "touch-press hover:scale-[1.02] group relative h-8 flex items-center justify-center px-2 rounded-md transition-all",
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
        <motion.span
          layoutId="rail-footer-stripe"
          aria-hidden="true"
          className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-brand shadow-[0_0_10px] shadow-brand/50"
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        />
      )}
      <Icon className="w-4 h-4 shrink-0 relative z-10" strokeWidth={active ? 2.5 : 1.75} />
    </Link>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" className="ml-1">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

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
  return (
    <p
      className={cn(
        "chrome-eyebrow tracking-[0.2em] leading-none mt-1 truncate",
        overage ? "text-rose-300 dark:text-rose-300" : "text-white/75 dark:text-white/55",
      )}
    >
      {tier.plan_name}
      {cap > 0 && (
        <span className="font-mono normal-case tracking-normal">
          {" "}
          · {fmt(used)}/{fmt(cap)}
        </span>
      )}
    </p>
  );
}

export function getRailWidth() {
  return { collapsed: RAIL_COLLAPSED, expanded: RAIL_EXPANDED };
}
