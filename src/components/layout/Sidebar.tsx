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
  Sun,
  Moon,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import WirelineMark from "../WirelineMark";
import { useAuth } from "../../contexts/AuthContext";
import { useBranding } from "../../contexts/BrandingContext";
import { NAV_GROUPS, type NavItem, NAV_SHORTCUT_HINTS } from "../../constants/navigation";
import { BRAND, NAV_GROUP_ACCENTS } from "../../constants/brand-colors";
import { authFetch } from "../../lib/api";
import { useLivePresence } from "../../hooks/useLivePresence";
import { cn } from "../../lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/shadcn/Tooltip";
import { ScrollArea } from "../ui/shadcn/ScrollArea";

const RAIL_COLLAPSED = 56;
const RAIL_EXPANDED = 240;
const AUTO_EXPAND_WIDTH = 1440;

const GROUP_ACCENTS = NAV_GROUP_ACCENTS;

const NAV_ITEMS: (NavItem & { accent: string })[] = NAV_GROUPS.filter(
  (g) => g.label !== "Admin",
).flatMap((g) =>
  g.items.map((item) => ({ ...item, accent: GROUP_ACCENTS[g.label] || BRAND.purple })),
);

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

  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("wireline_theme") as "light" | "dark") || "light";
    }
    return "light";
  });

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    localStorage.setItem("wireline_theme", nextTheme);
  };

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
  const railWidth = effective ? RAIL_EXPANDED : RAIL_COLLAPSED;

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
        className="hidden lg:flex shrink-0 flex-col fixed top-0 left-0 bottom-0 z-[55]"
        style={{
          width: railWidth,
          background: "rgba(59,21,76,0.97)",
          borderRight: "1px solid rgba(239,233,220,0.08)",
          backdropFilter: "blur(24px) saturate(160%)",
          WebkitBackdropFilter: "blur(24px) saturate(160%)",
          transition: "width 240ms cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        {/* Logo */}
        <Link
          to="/"
          className="shrink-0 flex items-center gap-3 h-12 px-3 group"
          aria-label={`${branding.brand_name} home`}
        >
          <motion.div
            whileHover={{ rotate: 8, scale: 1.06 }}
            whileTap={{ scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            className="relative w-8 h-8 shrink-0 rounded-lg flex items-center justify-center overflow-hidden"
            style={{
              background: "#EFE9DC",
              boxShadow: "0 4px 14px -4px rgba(0,0,0,0.20), 0 0 0 1px rgba(255,255,255,0.22) inset",
            }}
          >
            <WirelineMark className="w-4 h-4 text-[#3B154C] relative z-10" strokeWidth={130} />
            <div className="absolute inset-0 bg-gradient-to-tr from-white/30 to-transparent" />
          </motion.div>
          <AnimatePresence>
            {effective && (
              <motion.span
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                transition={{ duration: 0.18 }}
                className="brand-wordmark text-[15px] leading-none truncate !text-[#EFE9DC] !filter-none"
              >
                {branding.brand_name.toUpperCase()}
              </motion.span>
            )}
          </AnimatePresence>
        </Link>

        {/* Search */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("wireline:open-command-bar"))}
          className={cn(
            "shrink-0 mx-2 mb-1.5 h-8 flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/20 transition-all group",
            effective ? "px-3" : "px-2 justify-center",
          )}
          aria-label="Open search ( / )"
        >
          <Search
            className="w-3.5 h-3.5 shrink-0 text-white/50 group-hover:text-white/80 transition-colors"
            strokeWidth={2}
          />
          {effective && (
            <>
              <span className="flex-1 text-left text-xs text-white/60 group-hover:text-white/80 transition-colors">
                Search…
              </span>
              <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-white/12 bg-white/4 text-white/40 leading-none">
                /
              </kbd>
            </>
          )}
        </button>

        {/* Nav items */}
        <ScrollArea className="flex-1 min-h-0">
          <nav className="py-2 px-2 space-y-0.5">
            {NAV_ITEMS.filter((item) => !item.ownerOnly || user?.is_owner === true).map((item) => (
              <RailItem
                key={item.path}
                item={item}
                active={isActive(item)}
                badge={resolveBadge(item, navBadges)}
                expanded={effective}
                accent={item.accent}
                shortcut={SHORTCUTS[item.path]}
              />
            ))}
          </nav>
        </ScrollArea>

        {/* Footer */}
        <div
          className="shrink-0 border-t border-white/[0.08] px-2 pt-2 pb-2 space-y-0.5"
          style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
        >
          <LivePulse count={liveCalls} expanded={effective} />

          {effective && user && (
            <Link
              to="/admin?tab=subscription"
              className="flex items-center gap-2.5 h-10 px-2 rounded-md hover:bg-white/[0.06] transition-all group"
              aria-label="Account & billing"
              title={user.email}
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[#3B154C] font-semibold text-[11px] shrink-0"
                style={{ background: "#EFE9DC" }}
              >
                {user.email?.slice(0, 1).toUpperCase() ?? "?"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium text-white/90 leading-none truncate">
                  {user.email?.split("@")[0]}
                </p>
                <TierInline />
              </div>
            </Link>
          )}
          {!effective && user && (
            <Link
              to="/admin?tab=subscription"
              className="h-10 flex items-center justify-center rounded-md hover:bg-white/[0.06] transition-all"
              aria-label="Account"
              title={user.email}
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[#3B154C] font-semibold text-[11px]"
                style={{ background: "#EFE9DC" }}
              >
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
          {user?.email === "mikelaurenzo7@gmail.com" && (
            <FooterItem
              to="/founder"
              icon={Crown}
              label="Founder"
              expanded={effective}
              active={location.pathname === "/founder"}
            />
          )}

          {(() => {
            const themeToggleBtn = (
              <button
                type="button"
                onClick={toggleTheme}
                className="w-full group h-9 flex items-center gap-2.5 px-2 rounded-md text-white/50 hover:text-white/90 hover:bg-white/8 transition-all cursor-pointer"
                aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
              >
                {theme === "light" ? (
                  <Moon
                    className="w-4.5 h-4.5 shrink-0 transition-transform duration-300 group-hover:rotate-12 text-white/60"
                    strokeWidth={1.75}
                  />
                ) : (
                  <Sun
                    className="w-4.5 h-4.5 shrink-0 transition-transform duration-300 group-hover:rotate-45 text-white/60"
                    strokeWidth={1.75}
                  />
                )}
                {effective && (
                  <span className="text-[12px] font-medium truncate">
                    {theme === "light" ? "Dark Mode" : "Light Mode"}
                  </span>
                )}
              </button>
            );

            if (!effective) {
              return (
                <Tooltip>
                  <TooltipTrigger asChild>{themeToggleBtn}</TooltipTrigger>
                  <TooltipContent side="right" className="ml-1">
                    {theme === "light" ? "Dark Mode" : "Light Mode"}
                  </TooltipContent>
                </Tooltip>
              );
            }
            return themeToggleBtn;
          })()}

          <button
            onClick={() => signOut()}
            className="w-full group h-9 flex items-center gap-2.5 px-2 rounded-md text-white/50 hover:text-white/90 hover:bg-white/8 transition-all"
            aria-label="Sign out"
          >
            <LogOut className="w-4 h-4 shrink-0" strokeWidth={1.75} />
            {effective && <span className="text-[12px] font-medium truncate">Sign out</span>}
          </button>

          <button
            type="button"
            onClick={() => setUserOverride(!expanded)}
            className="w-full h-7 mt-0.5 flex items-center justify-center gap-2 px-2 rounded-md text-white/30 hover:text-white/70 hover:bg-white/6 transition-all"
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
          </button>
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
  accent: string;
  shortcut?: string;
}

function RailItem({ item, active, badge, expanded, accent, shortcut }: RailItemProps) {
  const Icon = item.icon;

  const link = (
    <Link
      to={item.path}
      {...(item.dataTour ? { "data-tour": item.dataTour } : {})}
      aria-label={expanded ? undefined : item.label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-2.5 h-9 px-2 rounded-md transition-all duration-150",
        active
          ? "bg-white/[0.12] text-white"
          : "text-white/55 hover:text-white/85 hover:bg-white/[0.06]",
      )}
    >
      {/* Active accent stripe */}
      {active && (
        <span
          aria-hidden="true"
          className="absolute -left-2 top-1.5 bottom-1.5 w-[3px] rounded-r-full"
          style={{ background: accent, boxShadow: `0 0 10px ${accent}88` }}
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
          {shortcut && !badge && (
            <kbd
              className={cn(
                "relative z-10 text-[8px] font-mono px-1.5 py-0.5 rounded leading-none border whitespace-nowrap",
                active
                  ? "border-white/15 text-white/55 bg-white/10"
                  : "border-white/12 text-white/40 bg-white/4 group-hover:border-white/20 group-hover:text-white/60",
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
            "relative z-10 shrink-0 min-w-[18px] h-[18px] px-1.5 rounded-full text-[9px] font-mono leading-none flex items-center justify-center font-semibold",
            active ? "bg-white/20 text-white" : "bg-rose-500/20 border border-rose-500/30",
          )}
          style={{
            ...(!active ? { color: "#fda4af" } : {}),
            ...(expanded
              ? {}
              : {
                  position: "absolute",
                  top: 4,
                  right: 4,
                  minWidth: 14,
                  height: 14,
                  padding: "0 4px",
                  fontSize: 8,
                }),
          }}
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
            {shortcut && <kbd className="text-[10px] font-mono text-white/40">{shortcut}</kbd>}
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
        "flex items-center gap-2 h-8 px-2 rounded-md",
        live ? "bg-purple-500/10" : "bg-white/[0.03]",
      )}
      title={live ? `${count} live call${count === 1 ? "" : "s"}` : "Floor is quiet"}
    >
      <span className="relative inline-flex w-2.5 h-2.5 shrink-0 items-center justify-center">
        {live && <span className="absolute inset-0 rounded-full animate-ping bg-purple-400/55" />}
        <span
          className="relative w-2 h-2 rounded-full"
          style={{
            background: live ? BRAND.purpleLight : "rgba(239,233,220,0.32)",
            boxShadow: live ? "0 0 10px rgba(79,30,123,0.55)" : "0 0 0 1px rgba(239,233,220,0.18)",
          }}
        />
      </span>
      {expanded && (
        <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
          <span className="chrome-eyebrow tracking-[0.2em]">{live ? "Live" : "Quiet"}</span>
          <span className="text-[10px] font-mono text-white/75">{count > 0 ? count : "—"}</span>
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
        "group h-9 flex items-center gap-2.5 px-2 rounded-md transition-all",
        active
          ? "bg-white/10 text-white/90"
          : "text-white/50 hover:text-white/80 hover:bg-white/[0.06]",
      )}
    >
      <Icon className="w-4 h-4 shrink-0" strokeWidth={active ? 2.5 : 1.75} />
      {expanded && <span className="text-[12px] font-medium truncate">{label}</span>}
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
        className="text-[8.5px] uppercase tracking-[0.25em] font-semibold"
        style={{ color: overage ? "#fda4af" : "rgba(255,255,255,0.55)" }}
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
        <div className="mt-0.5 h-[2px] rounded-full overflow-hidden bg-white/8">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${pct}%`,
              background: overage
                ? `linear-gradient(90deg,${BRAND.rose},${BRAND.purpleMuted})`
                : `linear-gradient(90deg,${BRAND.purpleLight},${BRAND.paper})`,
            }}
          />
        </div>
      )}
    </div>
  );
}

export function getRailWidth() {
  return { collapsed: RAIL_COLLAPSED, expanded: RAIL_EXPANDED };
}
