import React, { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { Activity, ListChecks } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { authFetch, readApiJson } from "../../lib/api";
import WirelineMark from "../WirelineMark";
import ErrorBoundary from "../ErrorBoundary";
import AuroraBackdrop from "./AuroraBackdrop";
import TopBar from "./TopBar";
import Sidebar from "./Sidebar";
import RouteAccentStrip from "./RouteAccentStrip";
import TrialBanner from "./TrialBanner";
import EmailVerifyBanner from "./EmailVerifyBanner";
import AppRoutes from "../../routes/AppRoutes";
import {
  getRouteAccentFromLocation,
  NAV_GROUPS,
  PAGE_TITLES,
  APP_KEYBOARD_SHORTCUTS,
} from "../../constants/navigation";
import { useBranding } from "../../contexts/BrandingContext";
import { useViewTransitionRoute } from "../../hooks/useViewTransitionRoute";
import { useLivePresence } from "../../hooks/useLivePresence";

const CommandBar = lazy(() => import("../CommandBar"));
const ProductTour = lazy(() => import("../ProductTour"));
const TrialGateModal = lazy(() => import("../TrialGateModal"));
const KeyboardShortcuts = lazy(() => import("../KeyboardShortcuts"));

export default function AppShell() {
  const [showShortcuts, setShowShortcuts] = useState(false);
  // Lifted from TopBar so the left-edge swipe gesture can also open the drawer.
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Tracks the start point of a left-edge swipe gesture.
  const edgeSwipe = useRef<{ x: number; y: number } | null>(null);
  // Shared nav badge counts from a single polling source (TopBar + drawer).
  const [navBadges, setNavBadges] = useState<Record<string, number>>({});
  const { user, loading } = useAuth();
  const { branding } = useBranding();
  const location = useLocation();
  const navigate = useNavigate();
  useViewTransitionRoute();

  // Poll nav badge counts every 2 minutes — only when authenticated.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const fetchCounts = async () => {
      try {
        const r = await authFetch("/api/nav-counts");
        if (cancelled) return;
        const out = await readApiJson<Record<string, number>>(r);
        if (out.ok) setNavBadges(out.data);
      } catch {
        /* non-critical — stale counts are acceptable */
      }
    };
    fetchCounts();
    const interval = setInterval(fetchCounts, 120_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user]);

  // Close the nav drawer on every route change.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!user) return;

    let lastKey = "";
    let lastKeyTime = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable)
        return;

      const now = Date.now();
      const key = e.key.toUpperCase();

      if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShowShortcuts((prev) => !prev);
        return;
      }

      if (lastKey === "G" && now - lastKeyTime < 1500) {
        e.preventDefault();
        const dest = APP_KEYBOARD_SHORTCUTS[key];
        if (dest) navigate(dest);
        lastKey = "";
        return;
      }

      lastKey = key;
      lastKeyTime = now;
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [user, navigate]);

  useEffect(() => {
    const label =
      PAGE_TITLES[location.pathname] ??
      (location.pathname.startsWith("/contact/") ? "Contact Profile" : null);
    document.title = label ? `${label} — ${branding.brand_name}` : branding.brand_name;
  }, [location.pathname, branding.brand_name]);

  if (loading) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-12 text-center relative overflow-hidden">
        <AuroraBackdrop />
        <div className="scanline" />

        <div className="relative w-44 h-44 mb-12 animate-spin-slow">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: "conic-gradient(from 0deg, #4F1E7B, #4F1E7B, #4F1E7B, #10B981, #4F1E7B)",
              filter: "blur(2px)",
            }}
          />
          <div className="absolute inset-2 rounded-full bg-paper" />
          <div className="absolute inset-4 rounded-full glass flex items-center justify-center">
            <div className="animate-pulse">
              <WirelineMark className="w-16 h-16 text-brand" strokeWidth={90} />
            </div>
          </div>
        </div>

        <div className="space-y-4 relative z-10">
          <h1 className="brand-wordmark text-5xl md:text-7xl leading-[0.85]">
            {branding.brand_name.toUpperCase()}
          </h1>
          <p className="text-eyebrow tracking-[0.4em]">Growth Engine Initializing</p>
          <div className="flex items-center justify-center gap-1.5 pt-4">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-brand animate-bounce"
                style={{ animationDelay: `${i * 0.2}s` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-dvh text-ink font-sans overflow-hidden relative">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-brand focus:text-on-brand focus:text-sm focus:font-medium focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-brand/40"
      >
        Skip to main content
      </a>
      <AuroraBackdrop />
      <div className="scanline" />

      <ErrorBoundary fallback={null}>
        <Suspense fallback={null}>
          <CommandBar />
          <ProductTour />
          {/* Listens for the global trial-gate 402 event from authFetch
              and renders the upgrade tier picker. Mounted once for the
              lifetime of the shell so it works regardless of which page
              fired the 402. */}
          <TrialGateModal />
          {showShortcuts && (
            <KeyboardShortcuts open={showShortcuts} onClose={() => setShowShortcuts(false)} />
          )}
        </Suspense>
      </ErrorBoundary>

      {/* Left-edge swipe zone — 20px invisible strip that detects the iOS
          "swipe from left to open drawer" gesture. Always rendered (never
          conditionally unmounted) so pointer capture is never released
          mid-gesture. pointer-events:none disables it while the drawer is
          open. z-45 keeps it below TopBar (z-50). */}
      <div
        className="md:hidden fixed top-0 left-0 bottom-0 w-5 z-[45]"
        aria-hidden="true"
        style={{
          touchAction: "pan-y",
          pointerEvents: drawerOpen ? "none" : "auto",
        }}
        onPointerDown={(e) => {
          edgeSwipe.current = { x: e.clientX, y: e.clientY };
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!edgeSwipe.current) return;
          const dx = e.clientX - edgeSwipe.current.x;
          const dy = Math.abs(e.clientY - edgeSwipe.current.y);
          // Open when rightward movement > 48px AND more horizontal than vertical.
          if (dx > 48 && dy < dx * 0.55) {
            setDrawerOpen(true);
            edgeSwipe.current = null;
          }
        }}
        onPointerUp={() => {
          edgeSwipe.current = null;
        }}
        onPointerCancel={() => {
          edgeSwipe.current = null;
        }}
      />

      {/* TopBar — visible on phone + tablet ONLY (< lg). On desktop the
          Aurora rail carries brand, nav, search, and avatar — no purple
          top strip needed. Removing the topbar on lg+ reclaims 44 px of
          vertical viewport for content. */}
      <TopBar
        onShowShortcuts={() => setShowShortcuts(true)}
        drawerOpen={drawerOpen}
        onDrawerChange={setDrawerOpen}
        navBadges={navBadges}
      />

      {/* Aurora Rail — vertical primary nav, lg+ only. The rail publishes
          its committed width to --wireline-rail-w (CSS custom property)
          so the main column below reserves *exactly* the right space and
          never gets overlapped. Hover-peek does NOT push content (overlay
          only) — only explicit toggle / auto-expand updates the variable. */}
      <Sidebar navBadges={navBadges} />

      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 overflow-hidden relative flex flex-col z-10 focus:outline-none lg:pl-[var(--wireline-rail-w,56px)] transition-[padding-left] duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
      >
        <RouteAccentStrip />
        <EmailVerifyBanner />
        <TrialBanner />
        <DesktopContextBar
          pathname={location.pathname}
          search={location.search}
          navBadges={navBadges}
          userEmail={user?.email}
          onShowShortcuts={() => setShowShortcuts(true)}
        />

        <div className="flex-1 relative flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-hidden relative z-10 min-h-0">
            <div className="app-surface max-w-[1600px] mx-auto px-3 md:px-4 lg:px-5 pt-2 md:pt-4 pb-0 md:pb-4 flex flex-col h-full min-h-0 mobile-page-canvas">
              <ErrorBoundary key={location.pathname}>
                <AppRoutes />
              </ErrorBoundary>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function getDesktopBreadcrumb(
  pathname: string,
  search = "",
): {
  eyebrow?: string;
  title: string;
  subtitle?: string;
} {
  const params = new URLSearchParams(search);
  const phoneTab = params.get("tab");

  const exactTitle = PAGE_TITLES[pathname];
  if (exactTitle) {
    for (const group of NAV_GROUPS) {
      const match = group.items.find(
        (item) =>
          item.path === pathname ||
          item.matches?.some((m) => pathname === m || pathname.startsWith(`${m}/`)),
      );
      if (match) {
        if (pathname === "/phone") {
          if (phoneTab === "outbound") {
            return {
              eyebrow: group.label,
              title: "Outbound",
              subtitle: "Campaigns, dispatch & lead queue",
            };
          }
          if (phoneTab === "appointments") {
            return {
              eyebrow: group.label,
              title: "Appointments",
              subtitle: "Scheduled by your agents",
            };
          }
          return { eyebrow: group.label, title: "Phone", subtitle: ROUTE_SUBTITLES["/phone"] };
        }
        if (pathname === "/ops") {
          const opsTab = params.get("tab");
          if (opsTab === "intel") {
            return {
              eyebrow: group.label,
              title: "Live Ops",
              subtitle: "Pending actions & follow-ups",
            };
          }
          if (opsTab === "analytics") {
            return {
              eyebrow: group.label,
              title: "Live Ops",
              subtitle: "Sentiment & unit economics",
            };
          }
          return { eyebrow: group.label, title: "Live Ops", subtitle: ROUTE_SUBTITLES["/ops"] };
        }
        if (pathname === "/admin") {
          const adminTab = params.get("tab");
          const tabMeta: Record<string, { title: string; subtitle: string }> = {
            subscription: { title: "Billing", subtitle: "Plan, usage & payment" },
            team: { title: "Team", subtitle: "Members & invitations" },
            branding: { title: "Branding", subtitle: "Logo, colors & white-label" },
            carrier: { title: "Carrier", subtitle: "Numbers, routing & voice network" },
            flywheel: { title: "Growth", subtitle: "Prospecting & autonomous outreach" },
            system: { title: "System", subtitle: "Platform health & dependencies" },
            activity: { title: "Activity", subtitle: "Recent configuration changes" },
          };
          if (adminTab && tabMeta[adminTab]) {
            return { eyebrow: group.label, ...tabMeta[adminTab] };
          }
          return { eyebrow: group.label, title: "Settings", subtitle: ROUTE_SUBTITLES["/admin"] };
        }
        if (pathname === "/agents") {
          return { eyebrow: group.label, title: "Agents", subtitle: ROUTE_SUBTITLES["/agents"] };
        }
        return { eyebrow: group.label, title: exactTitle, subtitle: ROUTE_SUBTITLES[pathname] };
      }
    }
    if (pathname === "/phone") {
      if (phoneTab === "outbound") {
        return { title: "Outbound", subtitle: "Campaigns, dispatch & lead queue" };
      }
      if (phoneTab === "appointments") {
        return { title: "Appointments", subtitle: "Scheduled by your agents" };
      }
    }
    return { title: exactTitle, subtitle: ROUTE_SUBTITLES[pathname] };
  }
  if (pathname.startsWith("/contact/")) {
    return {
      eyebrow: "Activity",
      title: "Contact Profile",
      subtitle: "Timeline, calls & appointments",
    };
  }
  const prefix = `/${pathname.split("/").filter(Boolean)[0] || ""}`;
  return { title: PAGE_TITLES[prefix] || "Workspace" };
}

const ROUTE_SUBTITLES: Record<string, string> = {
  "/phone": "Call history, outbound campaigns & appointments",
  "/email": "Manage threads, drafts & automated responses",
  "/sms": "Two-way conversations & automated follow-ups",
  "/training": "Teach, tune & refine your agents",
  "/ops": "Live callers, supervisor tools & fleet pulse",
  "/triage": "Flagged conversations needing review",
  "/insights": "Performance analytics & trend discovery",
  "/pipeline": "Leads across the funnel",
  "/admin": "Account configuration & integrations",
  "/agents": "Deploy, configure & manage your fleet",
  "/integrations": "Email, CRM & third-party connections",
  "/dnc": "Do-not-call list & TCPA compliance",
  "/audit": "Security events & compliance ledger",
};

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Burning the midnight oil";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 22) return "Good evening";
  return "Working late";
}

function firstName(email?: string): string | null {
  if (!email) return null;
  const handle = email.split("@")[0]?.split(/[._-]/)[0];
  if (!handle) return null;
  return handle.charAt(0).toUpperCase() + handle.slice(1);
}

function DesktopContextBar({
  pathname,
  search,
  navBadges,
  userEmail,
  onShowShortcuts,
}: {
  pathname: string;
  search: string;
  navBadges: Record<string, number>;
  userEmail?: string;
  onShowShortcuts: () => void;
}) {
  const breadcrumb = getDesktopBreadcrumb(pathname, search);
  const [from, to] = getRouteAccentFromLocation(pathname, search);
  const liveCalls = useLivePresence();
  // Cross-cutting "needs a human" signal — flagged conversations awaiting
  // review. Surfaced globally so it follows the operator across every page,
  // not just when they happen to be on /triage. Hidden when the queue is clean.
  const triageCount = navBadges["/triage"] ?? 0;
  const onOps = pathname === "/ops";
  const onTriage = pathname === "/triage";
  const name = firstName(userEmail);

  return (
    <div className="hidden lg:flex shrink-0 items-center justify-between gap-4 border-b border-ink/[0.06] bg-paper/72 px-5 py-3 backdrop-blur-xl relative overflow-hidden">
      {/* Ambient route-accent wash — a faint right-anchored gradient in the
          current page's identity colors. Ties the context bar into the same
          accent vocabulary as RouteAccentStrip + the rail's per-group hues,
          so the whole chrome shifts mood per destination. Re-keys on route
          change to gently cross-fade. */}
      <AnimatePresence mode="wait">
        <motion.div
          key={pathname}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.5 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-1/2"
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${from}0c 55%, ${to}1f 100%)`,
          }}
        />
      </AnimatePresence>

      <div className="min-w-0 relative z-10">
        {breadcrumb.eyebrow && (
          <p
            className="text-eyebrow mb-0.5 inline-block pb-0.5"
            style={{
              borderBottom: "1px solid transparent",
              borderImage: `linear-gradient(90deg, ${from}, ${to}) 1`,
            }}
          >
            {breadcrumb.eyebrow}
          </p>
        )}
        <div className="flex items-baseline gap-3">
          <h1 className="font-display italic text-[1.35rem] sm:text-[22px] leading-tight text-ink truncate">
            {breadcrumb.title}
          </h1>
          {breadcrumb.subtitle && (
            <p className="hidden xl:block text-[12px] text-muted truncate max-w-sm">
              {breadcrumb.subtitle}
            </p>
          )}
        </div>
      </div>

      {/* ── Right cluster: live operational pulse + greeting + shortcuts ── */}
      <div className="relative z-10 flex items-center gap-2.5 shrink-0">
        {/* Time-aware greeting — quiet, personal, only on very wide viewports
            where there's room to spare. */}
        {name && (
          <span className="hidden 2xl:inline text-[12px] text-muted whitespace-nowrap pr-1">
            {timeGreeting()}, <span className="text-ink/70 font-medium">{name}</span>
          </span>
        )}

        {/* Live calls pulse — the floor's heartbeat. Animates when calls are
            in flight; links straight to Live Ops. Suppressed (as a link) when
            already on /ops so it reads as a status, not a redundant jump. */}
        <PulsePill
          to={onOps ? undefined : "/ops"}
          live={liveCalls > 0}
          icon={Activity}
          label={liveCalls > 0 ? `${liveCalls} live` : "Floor quiet"}
          tone="emerald"
          title={
            liveCalls > 0
              ? `${liveCalls} active call${liveCalls === 1 ? "" : "s"} — open Live Ops`
              : "No active calls right now"
          }
        />

        {/* Needs-review pulse — only appears when the triage queue is non-empty
            and you're not already looking at it. */}
        <AnimatePresence>
          {triageCount > 0 && !onTriage && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, width: 0 }}
              animate={{ opacity: 1, scale: 1, width: "auto" }}
              exit={{ opacity: 0, scale: 0.9, width: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              <PulsePill
                to="/triage"
                live
                icon={ListChecks}
                label={`${triageCount > 99 ? "99+" : triageCount} to review`}
                tone="amber"
                title={`${triageCount} conversation${triageCount === 1 ? "" : "s"} flagged for review`}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <span className="hidden xl:block w-px h-5 bg-ink/[0.08]" aria-hidden="true" />

        <button
          type="button"
          onClick={onShowShortcuts}
          className="inline-flex min-h-11 h-11 items-center gap-2 rounded-full border border-ink/[0.08] bg-white/40 px-3.5 text-eyebrow transition-colors hover:border-brand/25 hover:text-brand"
          aria-label="Open keyboard shortcuts"
        >
          <kbd className="font-mono text-[10px]">?</kbd>
          <span className="hidden xl:inline">Shortcuts</span>
        </button>
      </div>
    </div>
  );
}

/**
 * PulsePill — a compact live-status chip used in the desktop context bar.
 * Renders as a Link when `to` is supplied (navigable status) or a static
 * pill otherwise. A breathing dot animates while `live` is true.
 */
function PulsePill({
  to,
  live,
  icon: Icon,
  label,
  tone,
  title,
}: {
  to?: string;
  live: boolean;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  tone: "emerald" | "amber";
  title: string;
}) {
  const palette =
    tone === "emerald"
      ? {
          dot: "#10B981",
          text: "text-emerald-700",
          ring: "ring-emerald-500/20",
          bg: "bg-emerald-500/8",
        }
      : {
          dot: "#F59E0B",
          text: "text-amber-700",
          ring: "ring-amber-500/25",
          bg: "bg-amber-500/10",
        };

  const inner = (
    <>
      <span className="relative inline-flex w-2 h-2 items-center justify-center shrink-0">
        {live && (
          <span
            className="absolute inset-0 rounded-full animate-ping"
            style={{ background: palette.dot, opacity: 0.5 }}
          />
        )}
        <span
          className="relative w-1.5 h-1.5 rounded-full"
          style={{
            background: live ? palette.dot : "rgba(20,0,32,0.22)",
            boxShadow: live ? `0 0 8px ${palette.dot}aa` : undefined,
          }}
        />
      </span>
      <Icon className="w-3.5 h-3.5 shrink-0 opacity-70" strokeWidth={2} />
      <span className="text-[11px] font-medium whitespace-nowrap leading-none">{label}</span>
    </>
  );

  const cls = cnPill(live, palette);
  return to ? (
    <Link to={to} title={title} aria-label={title} className={cls}>
      {inner}
    </Link>
  ) : (
    <span title={title} className={cls}>
      {inner}
    </span>
  );
}

function cnPill(live: boolean, palette: { text: string; ring: string; bg: string }): string {
  const base =
    "inline-flex items-center gap-2 min-h-11 h-11 px-3.5 rounded-full ring-1 transition-all select-none";
  if (live) return `${base} ${palette.bg} ${palette.ring} ${palette.text} hover:brightness-95`;
  return `${base} bg-white/40 ring-ink/[0.08] text-muted hover:text-ink hover:ring-ink/15`;
}
