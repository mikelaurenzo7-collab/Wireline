import React, { useState, useEffect, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from "react-router-dom";
import { Users, Activity, MessageSquare, Calendar, PhoneOutgoing, ServerCog, PlugZap, History, Mail, Menu, X, LogOut, Shield, Database, Waves, Inbox, BarChart3, Loader2, AlertTriangle, Radio, Keyboard, ChevronRight, User, Ban, ScrollText } from "lucide-react";
import { motion, AnimatePresence, MotionConfig } from "motion/react";
import AuthPortal from "./components/AuthPortal";
import { PrivacyPolicy, TermsOfService } from "./components/LegalPage";
import CookieConsent from "./components/CookieConsent";
import ErrorBoundary from "./components/ErrorBoundary";
import SystemStatusBadge from "./components/SystemStatusBadge";
import ToastStack from "./components/Toast";

// First-render-non-critical UI surfaces. CommandBar registers a
// keyboard listener but its heavy render only matters when opened;
// PersonaWizard/ProductTour are first-run-only; KeyboardShortcuts
// only mounts when the user opens the cheat-sheet. Lazy-loading these
// shaves their transitive motion/lucide imports out of the initial
// bundle on every page load.
const CommandBar         = lazy(() => import("./components/CommandBar"));
const PersonaWizard      = lazy(() => import("./components/PersonaWizard"));
const ProductTour        = lazy(() => import("./components/ProductTour"));
const KeyboardShortcuts  = lazy(() => import("./components/KeyboardShortcuts"));
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ToastProvider } from "./contexts/ToastContext";
import { authFetch } from "./lib/api";
import { cn } from "./lib/utils";
import { safeDate } from "./lib/safe-date";

// All route surfaces are code-split. Initial bundle holds only the
// app shell + auth + command bar; pages stream in on demand.
const DashboardHome   = lazy(() => import("./components/DashboardHome"));
const TriageInbox     = lazy(() => import("./components/TriageInbox"));
const ContactProfile  = lazy(() => import("./components/ContactProfile"));
const InsightsView    = lazy(() => import("./components/InsightsView"));
const AgentTraining   = lazy(() => import("./components/AgentTraining"));
const AppointmentsView = lazy(() => import("./components/Appointments"));
const FleetSettings   = lazy(() => import("./components/FleetSettings"));
const OutboundDialer  = lazy(() => import("./components/OutboundDialer"));
const AdminSettings   = lazy(() => import("./components/AdminSettings"));
const Integrations    = lazy(() => import("./components/Integrations"));
const CallLogs        = lazy(() => import("./components/CallLogs"));
const EmailInbox      = lazy(() => import("./components/EmailInbox"));
const KnowledgeBaseManager = lazy(() => import("./components/KnowledgeBaseManager"));
const LiveMonitor     = lazy(() => import("./components/LiveMonitor"));
const DncManager      = lazy(() => import("./components/DncManager"));
const AuditLog        = lazy(() => import("./components/AuditLog"));

type NavItem = {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  badge?: number;
  dataTour?: string;
  /**
   * Additional pathnames (or path prefixes) that should mark this rail
   * item as active. Used for hub entries (Training covers /train and
   * /knowledge; Channels covers /logs, /outbound, /inbox, /appointments;
   * Settings covers /admin, /dnc, /audit) so the rail stays in sync
   * with the operator's location across deep-linked sub-pages.
   */
  matches?: string[];
};



function AuroraBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <motion.div
        className="absolute -top-[20%] -left-[10%] w-[85vw] h-[85vw] rounded-full"
        style={{ background: "radial-gradient(circle at center, rgba(10,200,212,0.09), transparent 58%)" }}
        animate={{ x: [0, 50, 0], y: [0, -40, 0] }}
        transition={{ duration: 24, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-[20%] -right-[10%] w-[75vw] h-[75vw] rounded-full"
        style={{ background: "radial-gradient(circle at center, rgba(224,64,192,0.07), transparent 58%)" }}
        animate={{ x: [0, -40, 0], y: [0, 50, 0] }}
        transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-[40%] left-[40%] w-[60vw] h-[60vw] rounded-full"
        style={{ background: "radial-gradient(circle at center, rgba(155,89,245,0.07), transparent 58%)" }}
        animate={{ x: [0, 70, -30, 0], y: [0, -50, 40, 0] }}
        transition={{ duration: 35, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
//  FloatingRail — the navigation re-imagined as a free-floating glass dock.
//
//  Wall-attached sidebars belong to desktop OS chrome. Wireline is a
//  carrier-grade control surface, so the rail behaves more like a HUD
//  element: it floats with margins from the edges, runs in icon-only
//  mode by default to give the page its full breathing room, expands
//  on demand for power users, and surfaces labels via fade-in tooltips
//  when hovered. Active item gets the aurora gradient pill — the same
//  layoutId animation flows between routes.
// ────────────────────────────────────────────────────────────────────────
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  // Heavy-consolidated 8-item rail. Live Monitor merged into Dashboard's
  // Live tab. Knowledge folded under Training (HubTabs at the top of
  // /train + /knowledge cross-link them). Logs/Outbound/Email/Appointments
  // become "Channels" — same HubTabs treatment. DNC + Audit folded under
  // Settings. Existing deep-link URLs keep working unchanged.
  {
    label: "Workspace",
    items: [
      { label: "Dashboard", path: "/",        icon: Activity,   dataTour: "dashboard", matches: ["/live"] },
      { label: "Triage",    path: "/triage",  icon: Inbox },
      { label: "Insights",  path: "/insights",icon: BarChart3,  dataTour: "insights" },
    ],
  },
  {
    label: "Fleet",
    items: [
      { label: "Agents",   path: "/agents",  icon: Users,         dataTour: "agents" },
      { label: "Training", path: "/train",   icon: MessageSquare, dataTour: "training", matches: ["/knowledge"] },
    ],
  },
  {
    label: "Channels",
    items: [
      { label: "Channels", path: "/logs",  icon: Radio,
        matches: ["/outbound", "/inbox", "/appointments"] },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Integrations", path: "/integrations", icon: PlugZap },
      { label: "Settings",     path: "/admin",        icon: ServerCog,
        matches: ["/dnc", "/audit"] },
    ],
  },
];

const RAIL_PINNED_KEY = "wireline.rail.pinned";

function FloatingRail({ open, setOpen, onShowShortcuts }: { open: boolean; setOpen: (open: boolean) => void; onShowShortcuts: () => void }) {
  const location = useLocation();
  const { user, signOut } = useAuth();
  // A rail item is active when the current pathname matches its path or
  // any of its `matches` (used by hub entries that own multiple URLs —
  // e.g. Channels owns /logs + /outbound + /inbox + /appointments).
  const isActive = (item: NavItem) => {
    if (location.pathname === item.path) return true;
    if (!item.matches) return false;
    return item.matches.some(m => location.pathname === m || location.pathname.startsWith(`${m}/`));
  };

  // Pin = persistent expanded state (label visible). Persists across reloads.
  const [pinned, setPinned] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    // Default to expanded (pinned) for new users — labels are easier to learn.
    // We only consider the rail collapsed when the user has explicitly
    // collapsed it, which we record as "0" in localStorage.
    try { return window.localStorage.getItem(RAIL_PINNED_KEY) !== "0"; } catch { return true; }
  });
  const togglePin = () => {
    setPinned(p => {
      const next = !p;
      try { window.localStorage.setItem(RAIL_PINNED_KEY, next ? "1" : "0"); } catch {}
      return next;
    });
  };

  // On mobile, the rail is always "expanded" inside the drawer for
  // touch-friendly tap targets. On desktop, expansion follows `pinned`.
  // We render labels iff expanded.
  const expanded = pinned;

  // Live badge counts — poll a lightweight endpoint every 2 minutes.
  const [navBadges, setNavBadges] = useState<Record<string, number>>({});
  useEffect(() => {
    let cancelled = false;
    const fetchCounts = async () => {
      try {
        const r = await authFetch("/api/nav-counts");
        if (!cancelled && r.ok) {
          const d = await r.json();
          setNavBadges(d as Record<string, number>);
        }
      } catch (e) {
        console.debug("[nav-badges] fetch failed:", e);
      }
    };
    fetchCounts();
    const interval = setInterval(fetchCounts, 120_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const renderRailItem = (item: NavItem) => {
    const active = isActive(item);
    // Sum badge counts for this entry's primary path AND every owned
    // sub-path. Without this, post-consolidation hub entries (Channels
    // owns /logs+/outbound+/inbox+/appointments; Settings owns /admin
    // +/dnc+/audit) would silently drop attention indicators that
    // /api/nav-counts still reports against the original sub-paths.
    const badge = (navBadges[item.path] ?? 0)
      + (item.matches?.reduce((sum, m) => sum + (navBadges[m] ?? 0), 0) ?? 0);
    return (
      <Link
        key={item.label}
        to={item.path}
        onClick={() => setOpen(false)}
        {...(item.dataTour ? { "data-tour": item.dataTour } : {})}
        className={cn(
          "group relative flex items-center rounded-xl transition-colors h-11",
          // Collapsed: center the icon. Expanded: padded with label.
          expanded ? "px-2.5 gap-3" : "justify-center",
          // Mobile drawer is always expanded.
          "max-lg:px-2.5 max-lg:gap-3 max-lg:justify-start",
          active ? "text-paper" : "text-ink/65 hover:text-ink"
        )}
        aria-label={`Go to ${item.label}`}
        aria-current={active ? "page" : undefined}
      >
        {active && (
          <motion.div
            layoutId="rail-active"
            className="absolute inset-0 rounded-xl nav-active-bg"
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
          />
        )}
        <div className={cn(
          "relative z-10 w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all",
          active ? "bg-white/20" : "group-hover:bg-white/8"
        )}>
          <item.icon
            className={cn("w-4 h-4", active ? "text-paper" : "text-ink/60 group-hover:text-ink")}
            strokeWidth={active ? 2.5 : 1.75}
          />
        </div>

        {/* Label — visible inline when expanded; otherwise floats out as a
            hover-revealed tooltip to the right of the rail. The tooltip is
            CSS-only (group-hover) so it costs zero JS per item. */}
        <span className={cn(
          "relative z-10 text-[12px] leading-none tracking-wide truncate min-w-0",
          expanded ? "flex-1 max-lg:flex-1" : "hidden max-lg:inline-block max-lg:flex-1",
          active ? "font-semibold" : "font-normal"
        )}>
          {item.label}
        </span>

        {/* Hover tooltip (collapsed desktop only). aria-hidden so screen
            readers use the aria-label on the link instead. */}
        {!expanded && (
          <span
            aria-hidden="true"
            className="hidden lg:flex pointer-events-none absolute left-[calc(100%+10px)] top-1/2 -translate-y-1/2 items-center h-8 px-3 rounded-lg glass-strong border border-black/8 text-[11px] tracking-wide text-ink whitespace-nowrap shadow-md opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 group-focus-visible:opacity-100 group-focus-visible:translate-x-0 transition-all duration-150 z-50"
          >
            {item.label}
            {badge > 0 && (
              <span className="ml-2 px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[9px] font-mono leading-none">
                {badge}
              </span>
            )}
          </span>
        )}

        {badge > 0 && (
          <span
            aria-label={`${badge} item${badge === 1 ? "" : "s"} need attention`}
            className={cn(
              "relative z-10 shrink-0 min-w-[18px] h-[18px] px-1.5 rounded-full text-[9px] font-mono leading-none flex items-center justify-center",
              // In collapsed mode the badge becomes a small dot indicator
              // anchored to the icon corner — keeps the rail tidy.
              !expanded && "absolute top-1.5 right-1.5 max-lg:relative max-lg:top-auto max-lg:right-auto min-w-[10px] h-[10px] p-0",
              active ? "bg-white/25 text-paper" : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
            )}>
            {expanded ? badge : <span className="max-lg:inline hidden">{badge}</span>}
          </span>
        )}
      </Link>
    );
  };

  return (
    <>
      {/* Mobile backdrop */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-xl z-[60] lg:hidden"
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Visually-hidden live region announces badge count changes to
          screen readers without disrupting the current reading context. */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {Object.entries(navBadges)
          .filter(([, n]) => n > 0)
          .map(([path, n]) => `${n} item${n === 1 ? "" : "s"} need attention in ${path.replace("/", "")}`)
          .join("; ")}
      </div>

      {/* The rail — fixed-floating on desktop with tasteful margin from the
          viewport edges. On mobile it slides in as a drawer. */}
      <aside
        aria-label="Main navigation"
        className={cn(
          // Desktop: fixed-floating, in flow via a sibling spacer below.
          "fixed top-3 bottom-3 left-3 z-[70] flex flex-col transition-[width,transform] duration-300 ease-out",
          // Mobile width when open
          "w-[260px]",
          // Desktop width — collapsed vs expanded
          expanded ? "lg:w-[228px]" : "lg:w-[68px]",
          // Open/closed transform (mobile only — desktop is always visible).
          open ? "translate-x-0" : "-translate-x-[calc(100%+0.75rem)] lg:translate-x-0"
        )}
        // Honor iOS safe-area when the drawer extends to the device edge.
        style={{
          paddingTop: "max(0px, env(safe-area-inset-top, 0))",
          paddingBottom: "max(0px, env(safe-area-inset-bottom, 0))",
        }}
      >
        {/* Floating glass card */}
        <div
          className="absolute inset-0 rounded-3xl glass-strong border border-black/8"
          style={{
            boxShadow:
              "0 1px 0 rgba(255,255,255,0.80) inset, " +
              "0 0 0 1px rgba(10,200,212,0.04), " +
              "0 24px 60px -28px rgba(0,0,0,0.30), " +
              "0 8px 24px -8px rgba(10,200,212,0.10)",
          }}
        />
        {/* Aurora-tinted vertical accent on the trailing edge — purely decorative */}
        <div
          aria-hidden="true"
          className="absolute top-6 bottom-6 right-0 w-px rounded-full pointer-events-none opacity-60"
          style={{ background: "linear-gradient(to bottom, transparent, rgba(10,200,212,0.45) 30%, rgba(155,89,245,0.38) 70%, transparent)" }}
        />

        {/* Inner content — overflow hidden so corners stay smooth */}
        <div className="relative z-10 flex flex-col h-full p-2.5 overflow-hidden">
          {/* ── Brand row ─────────────────────────────────── */}
          <div className={cn(
            "flex items-center gap-2.5 mb-3",
            expanded ? "px-1.5" : "justify-center",
            "max-lg:justify-start max-lg:px-1.5"
          )}>
            <Link
              to="/"
              onClick={() => setOpen(false)}
              className="relative flex items-center gap-2.5 group min-w-0"
              aria-label="Wireline home"
            >
              <motion.div
                whileHover={{ rotate: 8, scale: 1.06 }}
                whileTap={{ scale: 0.96 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                className="relative w-10 h-10 rounded-2xl flex items-center justify-center overflow-hidden shrink-0"
                style={{
                  background: "linear-gradient(135deg, #0AC8D4 0%, #9B59F5 50%, #E040C0 100%)",
                  boxShadow: "0 6px 20px -8px rgba(10,200,212,0.65), 0 0 0 1px rgba(255,255,255,0.22) inset",
                }}
              >
                <Waves className="w-5 h-5 text-paper relative z-10" strokeWidth={2.5} />
                <div className="absolute inset-0 bg-gradient-to-tr from-white/30 to-transparent" />
              </motion.div>
              {/* Wordmark only when expanded (desktop) or always on mobile drawer. */}
              <div className={cn(
                "min-w-0 leading-none",
                expanded ? "flex flex-col gap-1" : "hidden",
                "max-lg:flex max-lg:flex-col max-lg:gap-1"
              )}>
                <span className="brand-wordmark text-[17px] leading-none">WIRELINE</span>
                <span className="text-[8px] tracking-[0.38em] uppercase text-muted/70 leading-none">Carrier OS</span>
              </div>
            </Link>

            {/* Mobile close — only inside the drawer */}
            <button
              onClick={() => setOpen(false)}
              className="lg:hidden ml-auto w-9 h-9 rounded-lg flex items-center justify-center text-ink/60 hover:text-ink hover:bg-white/5 transition-colors"
              aria-label="Close navigation"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* ── Navigation ────────────────────────────────── */}
          <nav className="flex-1 min-h-0 overflow-y-auto panel-scroll -mx-0.5 px-0.5 py-1 space-y-2.5">
            {NAV_GROUPS.map((group, gIdx) => (
              <div key={group.label}>
                {/* Group label — shown inline only when expanded; collapsed
                    state uses a thin gradient hairline as a separator instead. */}
                <div className={cn(
                  expanded ? "block max-lg:block" : "hidden max-lg:block",
                  "px-3 mb-1 flex items-center gap-2"
                )}>
                  {gIdx === 0 ? null : <span className="h-px flex-1 bg-black/8" />}
                  <span className="text-[7.5px] font-semibold uppercase tracking-[0.48em] text-muted/55 whitespace-nowrap">
                    {group.label}
                  </span>
                  <span className="h-px flex-1 bg-black/8" />
                </div>
                {gIdx > 0 && !expanded && (
                  <div className={cn(
                    "max-lg:hidden mx-3 my-2 h-px opacity-50",
                    "bg-gradient-to-r from-transparent via-black/12 to-transparent"
                  )} aria-hidden="true" />
                )}
                <div className="space-y-0.5">
                  {group.items.map(renderRailItem)}
                </div>
              </div>
            ))}
          </nav>

          {/* ── Footer cluster ────────────────────────────── */}
          <div className={cn(
            "shrink-0 mt-2 pt-2.5 space-y-1.5 border-t border-black/8",
            expanded ? "" : "flex flex-col items-center max-lg:items-stretch"
          )}>
            {/* Status badge — always shown; the component's own internals
                handle compact rendering. Only label-bearing rendering is
                in expanded mode. */}
            {(expanded) && (
              <div className="px-1.5 max-lg:block">
                <SystemStatusBadge />
              </div>
            )}
            <div className={cn("max-lg:hidden", !expanded && "block", expanded && "hidden")}>
              {/* Collapsed: a small status dot with hover tooltip. */}
              <button
                type="button"
                onClick={togglePin}
                className="group relative w-11 h-11 rounded-xl flex items-center justify-center hover:bg-white/5 transition-colors"
                aria-label="Expand navigation rail"
                title="Expand"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500" style={{ boxShadow: "0 0 8px rgba(77,255,196,0.7)" }} />
                <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 -translate-y-1/2 h-8 px-3 rounded-lg glass-strong border border-black/8 text-[11px] tracking-wide text-ink whitespace-nowrap shadow-md opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 flex items-center gap-2 z-50">
                  System healthy
                  <span className="text-[9px] uppercase tracking-[0.3em] text-muted">Expand →</span>
                </span>
              </button>
            </div>

            {/* Shortcuts trigger */}
            <button
              onClick={onShowShortcuts}
              className={cn(
                "group relative h-11 rounded-xl text-muted/65 hover:text-ink hover:bg-white/5 transition-colors flex items-center",
                expanded ? "px-2.5 gap-3" : "justify-center w-11",
                "max-lg:px-2.5 max-lg:gap-3 max-lg:w-full max-lg:justify-start"
              )}
              aria-label="Show keyboard shortcuts"
            >
              <Keyboard className="w-4 h-4 shrink-0" />
              <span className={cn(
                "text-[10px] uppercase tracking-[0.3em] flex-1 text-left",
                expanded ? "block" : "hidden",
                "max-lg:block"
              )}>
                Shortcuts
              </span>
              <kbd className={cn(
                "text-[8px] glass border border-black/10 px-1.5 py-0.5 rounded font-mono text-muted/70 group-hover:border-brand/25 group-hover:text-brand transition-all",
                expanded ? "block" : "hidden",
                "max-lg:block"
              )}>
                ?
              </kbd>
              {!expanded && (
                <span aria-hidden="true" className="hidden lg:flex pointer-events-none absolute left-[calc(100%+10px)] top-1/2 -translate-y-1/2 items-center h-8 px-3 rounded-lg glass-strong border border-black/8 text-[11px] tracking-wide text-ink whitespace-nowrap shadow-md opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 z-50">
                  Shortcuts <kbd className="ml-2 text-[9px] glass border border-black/10 px-1.5 py-0.5 rounded font-mono text-muted/70">?</kbd>
                </span>
              )}
            </button>

            {/* User cluster — always interactive, shows email when expanded. */}
            <div className={cn(
              "rounded-xl border border-black/8 glass overflow-hidden",
              expanded ? "p-2 max-lg:p-2" : "p-1.5 max-lg:p-2"
            )}>
              <div className={cn(
                "flex items-center gap-2.5",
                expanded ? "" : "flex-col gap-2 max-lg:flex-row max-lg:gap-2.5"
              )}>
                <div className="relative shrink-0">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white font-medium text-sm"
                    style={{ background: "linear-gradient(135deg, #0AC8D4, #9B59F5)" }}
                    aria-hidden="true"
                  >
                    {user?.email?.slice(0, 1).toUpperCase() ?? "?"}
                  </div>
                  <span
                    className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 bg-emerald-500"
                    style={{ borderColor: "#F5F0E8" }}
                    aria-hidden="true"
                  />
                </div>
                <div className={cn(
                  "min-w-0 flex-1",
                  expanded ? "block" : "hidden",
                  "max-lg:block"
                )}>
                  <p className="text-[11px] font-medium text-ink truncate leading-none mb-0.5">
                    {user?.email?.split("@")[0]}
                  </p>
                  <p className="text-[8px] tracking-[0.28em] uppercase text-muted truncate">
                    {user?.email?.split("@")[1]}
                  </p>
                </div>
                <button
                  onClick={() => signOut()}
                  title="Sign out"
                  aria-label="Sign out"
                  className={cn(
                    "shrink-0 rounded-lg flex items-center justify-center text-ink/40 hover:text-rose-600 hover:bg-rose-500/8 border border-black/7 hover:border-rose-500/35 transition-colors",
                    expanded ? "w-7 h-7" : "w-7 h-7"
                  )}
                >
                  <LogOut className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Pin/expand toggle (desktop only) — bottom of the rail */}
            <button
              type="button"
              onClick={togglePin}
              className="hidden lg:flex w-full h-7 items-center justify-center rounded-lg text-[8px] uppercase tracking-[0.32em] text-muted/55 hover:text-ink hover:bg-white/5 transition-colors"
              aria-label={expanded ? "Collapse navigation" : "Expand navigation"}
              title={expanded ? "Collapse" : "Expand"}
            >
              <ChevronRight className={cn("w-3 h-3 transition-transform", expanded && "rotate-180")} />
            </button>
          </div>
        </div>
      </aside>

      {/* Layout spacer — fills the same width as the floating rail so the
          main column lays out correctly without absolute positioning gymnastics.
          Visible only on lg; mobile is overlay-style. Width tracks rail state. */}
      <div
        aria-hidden="true"
        className={cn(
          "hidden lg:block shrink-0 transition-[width] duration-300 ease-out",
          expanded ? "w-[244px]" : "w-[84px]"
        )}
      />
    </>
  );
}

function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center gap-6 text-center px-6">
      <div className="font-display italic text-aurora text-[8rem] md:text-[12rem] leading-none">404</div>
      <p className="text-[10px] uppercase tracking-[0.6em] text-muted">Page not found</p>
      <p className="text-ink/55 max-w-md text-sm leading-relaxed">
        This page doesn't exist. Use ⌘K to jump anywhere, or head back to the dashboard.
      </p>
      <Link to="/" className="brutal-btn !py-3 !px-6 !text-[11px] !tracking-[0.3em]">
        <Activity className="w-3.5 h-3.5" /> Back to Dashboard <ChevronRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}

// Route loading state. The previous big-centered-spinner caused a visible
// "empty page" jump on every navigation. This skeleton mirrors PageShell's
// layout (eyebrow, title, separator, body grid) so the new route slots in
// without a layout shift, and the gradient progress strip + body shimmer
// signal motion. Stays subtle when the chunk loads in <100ms (the most
// common case after warmup), and doesn't feel jarring when it takes longer.
function RouteFallback() {
  return (
    <div className="h-full w-full flex flex-col" aria-live="polite" aria-busy="true">
      {/* Top progress strip — animated gradient that reads as "loading"
          without the user having to look anywhere specific. */}
      <div className="shrink-0 h-px relative overflow-hidden mb-5" aria-hidden="true">
        <div
          className="absolute inset-y-0 -left-1/3 w-1/3 rounded-full"
          style={{
            background: "linear-gradient(90deg, transparent, rgba(10,200,212,0.95) 40%, rgba(155,89,245,0.85) 60%, transparent)",
            animation: "route-progress-sweep 1.1s cubic-bezier(0.4, 0, 0.2, 1) infinite",
          }}
        />
      </div>

      {/* Eyebrow placeholder */}
      <div className="shrink-0 mb-2.5 h-2 w-32 rounded-full bg-black/8 overflow-hidden relative" aria-hidden="true">
        <div className="absolute inset-0 skeleton-shimmer" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)" }} />
      </div>

      {/* Title placeholder — matches the clamp(1.6rem, 6vw, 3.25rem) height */}
      <div className="shrink-0 h-12 md:h-14 w-2/3 max-w-md rounded-xl bg-black/6 overflow-hidden relative mb-3" aria-hidden="true">
        <div className="absolute inset-0 skeleton-shimmer" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)" }} />
      </div>

      {/* Subtitle placeholder */}
      <div className="shrink-0 h-3 w-1/2 max-w-sm rounded-full bg-black/5 mb-4" aria-hidden="true" />

      {/* Header separator (matches PageShell's gradient line) */}
      <div className="shrink-0 h-px mb-6" style={{
        background: "linear-gradient(90deg, rgba(10,200,212,0.20) 0%, rgba(155,89,245,0.15) 40%, rgba(224,64,192,0.10) 70%, transparent 100%)"
      }} aria-hidden="true" />

      {/* Body card shimmer */}
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 content-start">
        {[0, 1, 2, 3, 4, 5].map(i => (
          <div
            key={i}
            className="rounded-2xl glass border border-black/8 h-32 overflow-hidden relative"
            aria-hidden="true"
          >
            <div className="absolute inset-0 skeleton-shimmer" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)" }} />
          </div>
        ))}
      </div>

      <span className="sr-only">Loading page…</span>
    </div>
  );
}

function TrialBanner() {
  const [daysLeft, setDaysLeft] = useState<number | null>(null);

  useEffect(() => {
    authFetch("/api/billing/status")
      .then(r => r.json())
      .then(d => {
        const sub = d.subscription;
        if (sub?.status === "trialing" && sub?.current_period_end) {
          const periodEnd = safeDate(sub.current_period_end);
          if (periodEnd) {
            const ms = periodEnd.getTime() - Date.now();
            setDaysLeft(Math.max(0, Math.ceil(ms / 86_400_000)));
          }
        }
      })
      .catch(() => {});
  }, []);

  if (daysLeft === null) return null;

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      className="bg-amber-500/10 border-b border-amber-500/30 px-6 py-2.5 flex items-center justify-between gap-4 flex-wrap"
    >
      <div className="flex items-center gap-2.5 text-amber-300 text-xs">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span>
          Your free trial ends in <strong>{daysLeft} day{daysLeft !== 1 ? "s" : ""}</strong>.
          Add a payment method before it expires to keep your agents running.
        </span>
      </div>
      <Link
        to="/admin"
        className="shrink-0 px-3 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] uppercase tracking-[0.3em] hover:bg-amber-500/30 transition-all"
      >
        Add Card
      </Link>
    </motion.div>
  );
}

function PageTransition({ children }: { children: React.ReactNode }) {
  // Tightened from 550ms+blur(10px) → 220ms opacity+y. The blur filter
  // forced a full-layer repaint on every frame and the wait+exit pairing
  // (mode="wait" on AnimatePresence) compounded into ~1.1s of perceived
  // navigation lag. The new transition is short enough to feel snappy
  // without losing the soft "settle" cue between pages.
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="h-full"
    >
      {children}
    </motion.div>
  );
}

const PAGE_TITLES: Record<string, string> = {
  "/":             "Dashboard",
  "/triage":        "Triage",
  "/appointments":  "Appointments",
  "/logs":          "Call Logs",
  "/inbox":         "Email",
  "/outbound":      "Outbound",
  "/insights":      "Insights",
  "/live":          "Live Monitor",
  "/train":         "Training",
  "/knowledge":     "Knowledge",
  "/agents":        "Agents",
  "/integrations":  "Integrations",
  "/admin":         "Settings",
};

/**
 * Each route gets a tonal accent — a 2-color gradient that surfaces in
 * the top page-accent strip. The accents pull from the brand palette
 * (cyan/purple/magenta/emerald/amber) so they always feel native to
 * the design, just shifted in weight per surface. Unknown routes fall
 * back to the full aurora.
 */
const ROUTE_ACCENTS: Record<string, [string, string]> = {
  "/":             ["#0AC8D4", "#9B59F5"],
  "/triage":        ["#FFC07D", "#E040C0"],
  "/live":          ["#0AC8D4", "#10B981"],
  "/insights":      ["#9B59F5", "#E040C0"],
  "/logs":          ["#0AC8D4", "#9B59F5"],
  "/inbox":         ["#9B59F5", "#0AC8D4"],
  "/outbound":      ["#E040C0", "#FFC07D"],
  "/appointments":  ["#10B981", "#0AC8D4"],
  "/agents":        ["#0AC8D4", "#9B59F5"],
  "/train":         ["#9B59F5", "#0AC8D4"],
  "/knowledge":     ["#10B981", "#9B59F5"],
  "/integrations":  ["#0AC8D4", "#10B981"],
  "/admin":         ["#9B59F5", "#0AC8D4"],
  "/dnc":           ["#E040C0", "#FF6B6B"],
  "/audit":         ["#9B59F5", "#FFC07D"],
};
function getRouteAccent(pathname: string): [string, string] {
  if (ROUTE_ACCENTS[pathname]) return ROUTE_ACCENTS[pathname];
  // Match prefix routes like /contact/:number
  const prefix = "/" + pathname.split("/")[1];
  return ROUTE_ACCENTS[prefix] ?? ["#0AC8D4", "#E040C0"];
}

/**
 * Thin animated accent strip at the top of the page area — a subtle
 * tonal cue for "where you are" that recolors when the route changes.
 * 2px tall, full content width, fades-in on route change.
 */
function RouteAccentStrip() {
  const location = useLocation();
  const [from, to] = getRouteAccent(location.pathname);
  return (
    <div className="relative h-px shrink-0">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, scaleX: 0 }}
        animate={{ opacity: 1, scaleX: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="absolute inset-0 origin-left"
        style={{ background: `linear-gradient(90deg, transparent 0%, ${from} 18%, ${to} 78%, transparent 100%)` }}
        aria-hidden="true"
      />
    </div>
  );
}

function AppContent() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;

    let lastKey = '';
    let lastKeyTime = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return;

      const now = Date.now();
      const key = e.key.toUpperCase();

      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShowShortcuts(prev => !prev);
        return;
      }

      if (lastKey === 'G' && now - lastKeyTime < 1500) {
        e.preventDefault();
        const routes: Record<string, string> = {
          D: '/',
          L: '/logs',
          T: '/triage',
          I: '/insights',
          A: '/agents',
          R: '/train',
          O: '/outbound',
          S: '/admin',
        };
        if (routes[key]) {
          navigate(routes[key]);
        }
        lastKey = '';
        return;
      }

      lastKey = key;
      lastKeyTime = now;
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [user, navigate]);

  useEffect(() => {
    const label =
      PAGE_TITLES[location.pathname] ??
      (location.pathname.startsWith("/contact/") ? "Contact Profile" : null);
    document.title = label ? `${label} — Wireline` : "Wireline";
  }, [location.pathname]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-12 text-center relative overflow-hidden">
        <AuroraBackdrop />
        <div className="scanline" />

        <motion.div
          animate={{
            rotate: [0, 360],
          }}
          transition={{ repeat: Infinity, duration: 16, ease: "linear" }}
          className="relative w-44 h-44 mb-12"
        >
          <div className="absolute inset-0 rounded-full" style={{
            background: "conic-gradient(from 0deg, #0AC8D4, #9B59F5, #E040C0, #10B981, #0AC8D4)",
            filter: "blur(2px)"
          }} />
          <div className="absolute inset-2 rounded-full bg-paper" />
          <div className="absolute inset-4 rounded-full glass flex items-center justify-center">
            <motion.div
              animate={{ scale: [1, 1.1, 1], opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              <Waves className="w-16 h-16 text-aurora" strokeWidth={1.5} />
            </motion.div>
          </div>
        </motion.div>

        <div className="space-y-4 relative z-10">
          <h1 className="brand-wordmark text-5xl md:text-7xl leading-[0.85]">
            WIRELINE
          </h1>
          <p className="text-[10px] uppercase tracking-[0.6em] text-muted">Initializing</p>
          <div className="flex items-center justify-center gap-1.5 pt-4">
            {[0, 1, 2].map(i => (
              <motion.span
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-brand"
                animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.2, 0.8] }}
                transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.2 }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Legal pages are public — accessible before auth.
  if (location.pathname === "/privacy") return <PrivacyPolicy />;
  if (location.pathname === "/terms")   return <TermsOfService />;

  if (!user) {
    return <AuthPortal />;
  }

  return (
    <div className="flex h-screen text-ink font-sans overflow-hidden relative">
      <AuroraBackdrop />
      <div className="scanline" />
      {/* All four are visually inert until the user invokes them, so
          a null Suspense fallback is fine — nothing flickers when their
          chunks resolve. KeyboardShortcuts is gated on showShortcuts so
          its chunk is only fetched the first time the user presses ?.
          Wrapped in an ErrorBoundary with a null fallback so a chunk-load
          rejection (stale deploy, transient network) silently drops these
          non-critical surfaces instead of unmounting the whole shell —
          Suspense doesn't catch errors, only the suspended state. */}
      <ErrorBoundary fallback={null}>
        <Suspense fallback={null}>
          <CommandBar />
          <PersonaWizard />
          <ProductTour />
          {showShortcuts && (
            <KeyboardShortcuts open={showShortcuts} onClose={() => setShowShortcuts(false)} />
          )}
        </Suspense>
      </ErrorBoundary>
      <FloatingRail open={sidebarOpen} setOpen={setSidebarOpen} onShowShortcuts={() => setShowShortcuts(true)} />

      <main className="flex-1 overflow-hidden relative flex flex-col z-10">
         {/* Mobile Header — re-styled as a floating glass bar with rounded
             corners (matches the floating rail). Uses safe-area-inset so
             nothing hides under iOS notches / Dynamic Island. */}
         <div
           className="lg:hidden sticky top-0 z-30 px-3 pt-3 pb-2 shrink-0"
           style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top, 0))" }}
         >
           <div className="flex items-center justify-between gap-2 px-2 py-2 rounded-2xl glass-strong border border-black/8 shadow-md"
             style={{ boxShadow: "0 1px 0 rgba(255,255,255,0.80) inset, 0 8px 24px -10px rgba(0,0,0,0.20), 0 3px 12px -4px rgba(10,200,212,0.08)" }}
           >
             <button
               onClick={() => setSidebarOpen(true)}
               aria-label="Open navigation menu"
               aria-expanded={sidebarOpen}
               // 44x44 hit target (WCAG 2.5.5 / Apple HIG minimum).
               className="w-11 h-11 rounded-xl flex items-center justify-center hover:bg-white/5 active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
             >
               <Menu className="w-5 h-5 text-ink" />
             </button>
             <Link to="/" className="flex items-center gap-2.5 min-w-0">
               <div className="w-8 h-8 rounded-xl flex items-center justify-center shadow-sm shrink-0" style={{ background: "linear-gradient(135deg, #0AC8D4, #9B59F5, #E040C0)" }}>
                 <Waves className="w-4 h-4 text-white" strokeWidth={2.5} />
               </div>
               <span className="brand-wordmark text-lg leading-none truncate">WIRELINE</span>
             </Link>
             <button
               onClick={() => navigate('/admin')}
               aria-label="Open settings"
               className="w-11 h-11 rounded-xl flex items-center justify-center hover:bg-white/5 active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
             >
               <User className="w-5 h-5 text-ink/70" />
             </button>
           </div>
         </div>

         {/* Tonal route accent — recolors with the active page so the
             page area gets a subtle "where you are" cue without the
             full header chrome of a desktop app. */}
         <RouteAccentStrip />

         <TrialBanner />

         <div className="flex-1 relative flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 overflow-hidden relative z-10 min-h-0">
              <div className="h-full max-w-[1920px] mx-auto px-4 md:px-6 lg:px-8 xl:px-10 py-4 md:py-5 lg:py-6 flex flex-col">
                {/* No mode="wait" — letting the new page mount in parallel
                    with the old one's exit cuts ~250ms of perceived
                    navigation lag. The PageTransition's short opacity
                    fade still gives a clean visual handoff.

                    The outer ErrorBoundary catches lazy-route chunk-load
                    failures (stale deploy, transient network) that happen
                    BEFORE the per-route ErrorBoundary inside each <Route>
                    has a chance to mount. Without it, a single failed
                    chunk fetch blanks the whole content area and the
                    inner boundaries never run. */}
                <ErrorBoundary>
                <AnimatePresence>
                  <Suspense fallback={<RouteFallback />}>
                    <Routes>
                      <Route path="/" element={<PageTransition><ErrorBoundary><DashboardHome /></ErrorBoundary></PageTransition>} />
                      <Route path="/live" element={<PageTransition><ErrorBoundary><LiveMonitor /></ErrorBoundary></PageTransition>} />
                      <Route path="/triage" element={<PageTransition><ErrorBoundary><TriageInbox /></ErrorBoundary></PageTransition>} />
                      <Route path="/insights" element={<PageTransition><ErrorBoundary><InsightsView /></ErrorBoundary></PageTransition>} />
                      <Route path="/contact/:number" element={<PageTransition><ErrorBoundary><ContactProfile /></ErrorBoundary></PageTransition>} />
                      <Route path="/logs" element={<PageTransition><ErrorBoundary><CallLogs /></ErrorBoundary></PageTransition>} />
                      <Route path="/inbox" element={<PageTransition><ErrorBoundary><EmailInbox /></ErrorBoundary></PageTransition>} />
                      <Route path="/outbound" element={<PageTransition><ErrorBoundary><OutboundDialer /></ErrorBoundary></PageTransition>} />
                      <Route path="/appointments" element={<PageTransition><ErrorBoundary><AppointmentsView /></ErrorBoundary></PageTransition>} />
                      <Route path="/train" element={<PageTransition><ErrorBoundary><AgentTraining /></ErrorBoundary></PageTransition>} />
                      <Route path="/knowledge" element={<PageTransition><ErrorBoundary><KnowledgeBaseManager /></ErrorBoundary></PageTransition>} />
                      <Route path="/agents" element={<PageTransition><ErrorBoundary><FleetSettings /></ErrorBoundary></PageTransition>} />
                      <Route path="/integrations" element={<PageTransition><ErrorBoundary><Integrations /></ErrorBoundary></PageTransition>} />
                      <Route path="/admin" element={<PageTransition><ErrorBoundary><AdminSettings /></ErrorBoundary></PageTransition>} />
                      <Route path="/dnc" element={<PageTransition><ErrorBoundary><DncManager /></ErrorBoundary></PageTransition>} />
                      <Route path="/audit" element={<PageTransition><ErrorBoundary><AuditLog /></ErrorBoundary></PageTransition>} />
                      <Route path="*" element={<PageTransition><NotFound /></PageTransition>} />
                    </Routes>
                  </Suspense>
                </AnimatePresence>
                </ErrorBoundary>
              </div>
            </div>
         </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    // reducedMotion="user" makes motion/react honor the OS-level
    // prefers-reduced-motion media query for every <motion.*> in the tree.
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <AppContent />
            <ToastStack />
            <CookieConsent />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </MotionConfig>
  );
}
