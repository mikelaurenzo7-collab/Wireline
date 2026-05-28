/**
 * Sidebar.tsx — "Aurora Rail"
 * ---------------------------------------------------------------------------
 * Desktop chrome (lg+). Replaces the horizontal TopBar nav with a vertical
 * brand-deep rail. Three states:
 *
 *   - Collapsed (default at < 1440px): 56px wide. Icons only. Hover any
 *     row to peek the full label without expanding the rail.
 *   - Expanded (default at ≥ 1440px, or user-toggled): 224px wide. Full
 *     labels + group headers + tier badge + keyboard-shortcut hints.
 *   - Hover-peek (collapsed + cursor over rail): the rail temporarily
 *     widens to expanded form. Mouse out → snaps back.
 *
 * The mobile + tablet experience is unchanged: TopBar carries brand chrome
 * up to lg, BottomNavBar carries primary nav under md, slide-in drawer
 * carries the full IA on tablet (md → lg-1).
 *
 * Why a rail beats a top-bar at our scale: tool-heavy products (Linear,
 * Notion, Slack, Stripe, Vercel) all converged on this for a reason —
 * the rail scales to N items without scrolling, frees the top bar to be
 * contextual (breadcrumb + actions + search), and reads as a tier-1
 * product the moment the page loads.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronsLeft, ChevronsRight, Crown, LifeBuoy, LogOut, Search } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import WirelineMark from "../WirelineMark";
import { useAuth } from "../../contexts/AuthContext";
import { useBranding } from "../../contexts/BrandingContext";
import { NAV_GROUPS, type NavItem } from "../../constants/navigation";
import { authFetch } from "../../lib/api";
import { cn } from "../../lib/utils";

const RAIL_COLLAPSED = 56; // px
const RAIL_EXPANDED = 224; // px
const AUTO_EXPAND_WIDTH = 1440; // viewport width that auto-expands the rail

// Per-group accent colors — let operators scan the rail by category.
// Matches the route-accent palette already in use elsewhere.
const GROUP_ACCENTS: Record<string, string> = {
  Workspace: "#4F1E7B", // brand purple
  Fleet: "#F59E0B", // warm amber
  Activity: "#10B981", // emerald
  Admin: "#57534E", // muted warm gray
};

// Optional keyboard-shortcut hints. Matches the existing g+key shortcut
// mapping in AppShell. Shown right-aligned when the rail is expanded.
const SHORTCUTS: Record<string, string> = {
  "/": "g d",
  "/triage": "g t",
  "/insights": "g i",
  "/agents": "g a",
  "/train": "g r",
  "/logs": "g l",
  "/admin": "g s",
};

interface SidebarProps {
  /** Bag of badge counts keyed by path, already populated by AppShell's poll. */
  navBadges: Record<string, number>;
}

export default function Sidebar({ navBadges }: SidebarProps) {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { branding } = useBranding();

  // Track whether the viewport is wide enough to default to expanded.
  const [autoExpanded, setAutoExpanded] = useState<boolean>(() =>
    typeof window === "undefined" ? false : window.innerWidth >= AUTO_EXPAND_WIDTH,
  );
  // User can override the auto-expand decision via the toggle button.
  // `null` means "follow the auto-expand rule".
  const [userOverride, setUserOverride] = useState<boolean | null>(null);
  // Hover-peek: when collapsed, hovering the rail temporarily expands it.
  const [peek, setPeek] = useState(false);

  useEffect(() => {
    const onResize = () => setAutoExpanded(window.innerWidth >= AUTO_EXPAND_WIDTH);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Persist user toggle across reloads so power-users get their preference.
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
  // `effective` = the *actual rendered* state (handles peek-on-collapsed).
  const effective = expanded || peek;
  const railWidth = effective ? RAIL_EXPANDED : RAIL_COLLAPSED;

  // Publish the COMMITTED rail width (NOT the peek state) to a CSS
  // custom property so the rest of the chrome — `<main>` content
  // column — can reserve exactly the right space and never get
  // overlapped. Peek is deliberately ignored here: hover-peek expands
  // the rail OVER the content (overlay), but does NOT push the content
  // right (otherwise every hover would jank-shift the page).
  useEffect(() => {
    const committed = expanded ? RAIL_EXPANDED : RAIL_COLLAPSED;
    document.documentElement.style.setProperty("--wireline-rail-w", `${committed}px`);
    return () => {
      document.documentElement.style.removeProperty("--wireline-rail-w");
    };
  }, [expanded]);

  // Active-state matcher mirrors TopBar logic for consistency.
  const isActive = (item: NavItem) => {
    if (location.pathname === item.path) return true;
    if (!item.matches) return false;
    return item.matches.some(
      (m) => location.pathname === m || location.pathname.startsWith(`${m}/`),
    );
  };

  // Live phone pulse — polls /api/fleet/presence every 10 s. Counts active
  // calls in the workspace right now. Pulse animates when count > 0.
  const [liveCalls, setLiveCalls] = useState<number>(0);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const fetchLive = async () => {
      try {
        const r = await authFetch("/api/fleet/presence");
        if (!r.ok || cancelled) return;
        const d = (await r.json()) as { signals?: unknown[] };
        if (!cancelled) setLiveCalls(Array.isArray(d.signals) ? d.signals.length : 0);
      } catch {
        /* non-critical — stale count is fine */
      }
    };
    fetchLive();
    const id = setInterval(fetchLive, 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user]);

  return (
    <aside
      aria-label="Primary navigation"
      data-testid="aurora-rail"
      onMouseEnter={() => !expanded && setPeek(true)}
      onMouseLeave={() => setPeek(false)}
      className="hidden lg:flex shrink-0 flex-col fixed top-0 left-0 bottom-0 z-[55] overflow-hidden"
      style={{
        width: railWidth,
        background: "rgba(59, 21, 76, 0.96)",
        borderRight: "1px solid rgba(239, 233, 220, 0.08)",
        backdropFilter: "blur(20px) saturate(160%)",
        WebkitBackdropFilter: "blur(20px) saturate(160%)",
        boxShadow: "1px 0 0 rgba(255,255,255,0.04) inset, 12px 0 32px -18px rgba(20, 0, 32, 0.45)",
        transition: "width 240ms cubic-bezier(0.16, 1, 0.3, 1)",
        willChange: "width",
      }}
    >
      {/* ── Header: logo + brand wordmark ───────────────────────────── */}
      <Link
        to="/"
        className="shrink-0 flex items-center gap-3 h-12 px-3 group"
        aria-label={`${branding.brand_name} home`}
      >
        <motion.div
          whileHover={{ rotate: 8, scale: 1.06 }}
          whileTap={{ scale: 0.96 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
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

      {/* TierBadge inlined into the account block below — saves ~50 px of
          vertical rail real-estate so all nav groups fit without a
          scrollbar at viewport heights ≥ 720 px.

      ── Search trigger — fires the same global command bar event the
          mobile/tablet topbar uses. Discoverable on lg+ where there's
          no topbar; also visible in collapsed-rail state as a single
          icon so the hotkey "/" is never the only entry. */}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent("wireline:open-command-bar"))}
        className={cn(
          "shrink-0 mx-2 mb-1.5 h-8 flex items-center gap-2 rounded-lg border border-[#EFE9DC]/10 bg-white/[0.04] hover:bg-white/[0.08] hover:border-[#EFE9DC]/20 transition-all group",
          effective ? "px-3" : "px-2 justify-center",
        )}
        aria-label="Open search ( / )"
        title="Search ( / )"
      >
        <Search
          className="w-3.5 h-3.5 shrink-0 text-[#EFE9DC]/55 group-hover:text-[#EFE9DC] transition-colors"
          strokeWidth={2}
        />
        {effective && (
          <>
            <span className="flex-1 text-left text-[11px] text-[#EFE9DC]/65 group-hover:text-[#EFE9DC]/75 transition-colors">
              Search…
            </span>
            <kbd className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-white/12 bg-white/4 text-[#EFE9DC]/62 leading-none">
              /
            </kbd>
          </>
        )}
      </button>

      {/* ── Group sections ─────────────────────────────────────────── */}
      {/* overflow-y-auto + scrollbar-hide: at the design heights (720+ px
          laptop, 800+ px desktop) all groups fit without overflow. On
          ultra-short windows or zoomed-in browsers the content scrolls
          silently — no visible scrollbar, no clipped items. */}
      <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain py-2 px-2 space-y-3 scrollbar-hide">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((item) => !item.ownerOnly || user?.is_owner === true);
          if (items.length === 0) return null;
          const accent = GROUP_ACCENTS[group.label] || "#4F1E7B";
          return (
            <div key={group.label}>
              <AnimatePresence>
                {effective && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="px-2 mb-1.5 flex items-center gap-2 select-none"
                  >
                    <span
                      aria-hidden="true"
                      className="w-1 h-1 rounded-full shrink-0"
                      style={{ background: accent }}
                    />
                    <span className="text-[8px] uppercase tracking-[0.42em] text-[#EFE9DC]/62 font-semibold">
                      {group.label}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
              {/* Collapsed: subtle hairline divider between groups */}
              {!effective && (
                <div
                  aria-hidden="true"
                  className="mx-3 mb-1.5 h-px"
                  style={{ background: `${accent}28` }}
                />
              )}
              <div className="space-y-0.5">
                {items.map((item) => (
                  <RailItem
                    key={item.path}
                    item={item}
                    active={isActive(item)}
                    badge={resolveBadge(item, navBadges)}
                    expanded={effective}
                    accent={accent}
                    shortcut={SHORTCUTS[item.path]}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* ── Footer: live pulse + account/help/founder/signout ─────── */}
      <div
        className="shrink-0 border-t border-[#EFE9DC]/8 px-2 pt-2 pb-2 space-y-0.5"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        <LivePulse count={liveCalls} expanded={effective} />

        {/* Account block — avatar + email, shown when expanded. Tap to
            open billing in a new context. Replaces what was in the topbar
            avatar dropdown on lg+ (where the topbar no longer renders). */}
        {effective && user && (
          <Link
            to="/admin?tab=subscription"
            className="flex items-center gap-2.5 h-10 px-2 rounded-lg hover:bg-white/[0.06] transition-all group"
            aria-label="Account & billing"
            title={user.email}
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[#3B154C] font-semibold text-[11px] shrink-0"
              style={{ background: "#EFE9DC" }}
              aria-hidden="true"
            >
              {user.email?.slice(0, 1).toUpperCase() ?? "?"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-[#EFE9DC] leading-none truncate">
                {user.email?.split("@")[0]}
              </p>
              <TierInline />
            </div>
          </Link>
        )}
        {!effective && user && (
          <Link
            to="/admin?tab=subscription"
            className="h-10 flex items-center justify-center rounded-lg hover:bg-white/[0.06] transition-all"
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
        {user?.email === "mikelaurenzo7@gmail.com" && (
          <FooterItem
            to="/founder"
            icon={Crown}
            label="Founder"
            expanded={effective}
            active={location.pathname === "/founder"}
          />
        )}
        {/* Sign-out lives in the avatar dropdown too; mirrored here for
            keyboard users who never open it. */}
        <button
          onClick={() => signOut()}
          className="w-full group h-9 flex items-center gap-2.5 px-2 rounded-lg text-[#EFE9DC]/55 hover:text-[#EFE9DC] hover:bg-white/8 transition-all"
          title={effective ? undefined : "Sign out"}
          aria-label="Sign out"
        >
          <LogOut className="w-4 h-4 shrink-0" strokeWidth={1.75} />
          {effective && <span className="text-[12px] font-medium truncate">Sign out</span>}
        </button>

        {/* Collapse/expand toggle — always rendered, sits at the very
            bottom so it never gets in the way of nav clicks. */}
        <button
          type="button"
          onClick={() => setUserOverride(!expanded)}
          className="w-full h-7 mt-0.5 flex items-center justify-center gap-2 px-2 rounded-lg text-[#EFE9DC]/55 hover:text-[#EFE9DC]/75 hover:bg-white/6 transition-all"
          aria-label={expanded ? "Collapse navigation" : "Expand navigation"}
          aria-pressed={expanded}
          title={expanded ? "Collapse rail" : "Expand rail"}
        >
          {expanded ? (
            <>
              <ChevronsLeft className="w-3.5 h-3.5" />
              <span className="text-[9px] uppercase tracking-[0.3em]">Collapse</span>
            </>
          ) : (
            <ChevronsRight className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </aside>
  );
}

// ──────────────────────────────────────────────────────────────────────
// RailItem — a single nav row. Active state uses the brand-cream pill
// with subtle horizontal gradient so the active item *points into* the
// page content.
// ──────────────────────────────────────────────────────────────────────

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
  return (
    <Link
      to={item.path}
      {...(item.dataTour ? { "data-tour": item.dataTour } : {})}
      aria-label={`Go to ${item.label}`}
      aria-current={active ? "page" : undefined}
      title={expanded ? undefined : item.label}
      className={cn(
        "group relative flex items-center gap-2.5 h-9 px-2 rounded-lg transition-all duration-150",
        active ? "text-[#3B154C]" : "text-[#EFE9DC]/65 hover:text-[#EFE9DC] hover:bg-white/8",
      )}
    >
      {active && (
        <motion.div
          layoutId="rail-active-pill"
          className="absolute inset-0 rounded-lg"
          transition={{ type: "spring", stiffness: 420, damping: 36 }}
          style={{
            background:
              "linear-gradient(90deg, #F2EDE4 0%, #EFE9DC 70%, rgba(239,233,220,0.92) 100%)",
            boxShadow: "0 6px 20px -8px rgba(20,0,32,0.45), 0 0 0 1px rgba(255,255,255,0.25) inset",
          }}
        />
      )}
      {/* Active-side accent stripe — a 2px slab on the rail edge in the
          group's accent color so the eye can find the active item even
          in collapsed mode. */}
      {active && (
        <span
          aria-hidden="true"
          className="absolute -left-2 top-1.5 bottom-1.5 w-[3px] rounded-r-full"
          style={{ background: accent, boxShadow: `0 0 10px ${accent}88` }}
        />
      )}
      <Icon
        className={cn(
          "relative z-10 w-4 h-4 shrink-0 transition-transform duration-200 group-hover:scale-110",
        )}
        strokeWidth={active ? 2.4 : 1.75}
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
                  ? "border-[#3B154C]/15 text-[#3B154C]/55 bg-[#3B154C]/5"
                  : "border-white/12 text-[#EFE9DC]/40 bg-white/4 group-hover:border-white/20 group-hover:text-[#EFE9DC]/60",
              )}
            >
              {shortcut}
            </kbd>
          )}
        </>
      )}
      {badge > 0 && (
        <span
          aria-label={`${badge} item${badge === 1 ? "" : "s"} need attention`}
          className={cn(
            "relative z-10 shrink-0 min-w-[18px] h-[18px] px-1.5 rounded-full text-[9px] font-mono leading-none flex items-center justify-center font-semibold",
            active
              ? "bg-[#3B154C]/15 text-[#3B154C]"
              : "bg-rose-500/25 text-rose-300 border border-rose-500/40",
          )}
          // Badge floats top-right in collapsed mode (no label to share width with)
          style={
            expanded
              ? undefined
              : {
                  position: "absolute",
                  top: 4,
                  right: 4,
                  minWidth: 14,
                  height: 14,
                  padding: "0 4px",
                  fontSize: 11,
                }
          }
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

function resolveBadge(item: NavItem, navBadges: Record<string, number>): number {
  return (
    (navBadges[item.path] ?? 0) +
    (item.matches?.reduce((sum, m) => sum + (navBadges[m] ?? 0), 0) ?? 0)
  );
}

// ──────────────────────────────────────────────────────────────────────
// LivePulse — "Wireline is alive." Subtle ambient indicator at the
// foot of the rail. Animates when calls > 0; static when quiet.
// ──────────────────────────────────────────────────────────────────────

function LivePulse({ count, expanded }: { count: number; expanded: boolean }) {
  const live = count > 0;
  return (
    <div
      className={cn(
        "flex items-center gap-2 h-8 px-2 rounded-lg",
        live ? "bg-emerald-500/10" : "bg-white/[0.03]",
      )}
      title={live ? `${count} live call${count === 1 ? "" : "s"}` : "Floor is quiet"}
    >
      <span className="relative inline-flex w-2.5 h-2.5 shrink-0 items-center justify-center">
        {live && (
          <span
            className="absolute inset-0 rounded-full animate-ping"
            style={{ background: "#10B981", opacity: 0.55 }}
          />
        )}
        <span
          className="relative w-2 h-2 rounded-full"
          style={{
            background: live ? "#10B981" : "rgba(239,233,220,0.32)",
            boxShadow: live ? "0 0 10px rgba(16,185,129,0.7)" : "0 0 0 1px rgba(239,233,220,0.18)",
          }}
        />
      </span>
      {expanded && (
        <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-[0.22em] text-[#EFE9DC]/65 font-medium">
            {live ? "Live" : "Quiet"}
          </span>
          <span className="text-[10px] font-mono text-[#EFE9DC]/75">{count > 0 ? count : "—"}</span>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// FooterItem — Help / Founder rows in the footer cluster. Same visual
// language as RailItem but slimmer (no group accents, no shortcuts).
// ──────────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────────
// TierInline — slim, single-line plan-usage pill rendered inside the
// account block in the footer. Replaces the standalone TierBadge that
// previously sat below the logo and ate ~50 px of rail height. Reads
// from the same /api/billing/usage endpoint; refreshes every 60 s.
//
// Renders as:  PRO · 1.2k / 5k min   (with hairline progress underline)
// On overage:  PRO · OVER · 5.4k / 5k   (rose accent)
// ──────────────────────────────────────────────────────────────────────

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

  // While loading or for fresh accounts: show the email domain so the
  // account row never looks empty.
  if (!tier?.plan_name) {
    return (
      <p className="text-[8.5px] uppercase tracking-[0.25em] text-[#EFE9DC]/62 leading-none mt-1 truncate">
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
          "text-[8.5px] uppercase tracking-[0.25em] font-semibold",
          overage ? "text-rose-300" : "text-[#EFE9DC]/55",
        )}
      >
        {tier.plan_name}
        {cap > 0 && (
          <>
            {" · "}
            <span className="font-mono normal-case tracking-normal">
              {fmt(used)}/{fmt(cap)}
            </span>
          </>
        )}
      </span>
      {cap > 0 && (
        <div className="mt-0.5 h-[2px] rounded-full overflow-hidden bg-[#EFE9DC]/8">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${pct}%`,
              background: overage
                ? "linear-gradient(90deg, #E8466A, #F59E0B)"
                : "linear-gradient(90deg, #10B981, #EFE9DC)",
            }}
          />
        </div>
      )}
    </div>
  );
}

interface FooterItemProps {
  to: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  expanded: boolean;
  active: boolean;
}
function FooterItem({ to, icon: Icon, label, expanded, active }: FooterItemProps) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      title={expanded ? undefined : label}
      className={cn(
        "group h-9 flex items-center gap-2.5 px-2 rounded-lg transition-all",
        active
          ? "bg-white/12 text-[#EFE9DC]"
          : "text-[#EFE9DC]/55 hover:text-[#EFE9DC] hover:bg-white/8",
      )}
    >
      <Icon className="w-4 h-4 shrink-0" strokeWidth={active ? 2.4 : 1.75} />
      {expanded && <span className="text-[12px] font-medium truncate">{label}</span>}
    </Link>
  );
}

/** Exported so AppShell knows how wide to push the main column. */
export function getRailWidth(): { collapsed: number; expanded: number } {
  return { collapsed: RAIL_COLLAPSED, expanded: RAIL_EXPANDED };
}
