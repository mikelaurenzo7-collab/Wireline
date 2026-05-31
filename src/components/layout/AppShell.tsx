import React, { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { useAuth } from "../../contexts/AuthContext";
import { authFetch, readApiJson } from "../../lib/api";
import WirelineMark from "../WirelineMark";
import ErrorBoundary from "../ErrorBoundary";
import AuroraBackdrop from "./AuroraBackdrop";
import TopBar from "./TopBar";
import Sidebar from "./Sidebar";
import TrialBanner from "./TrialBanner";
import EmailVerifyBanner from "./EmailVerifyBanner";
import AppRoutes from "../../routes/AppRoutes";
import { NAV_GROUPS, PAGE_TITLES, APP_KEYBOARD_SHORTCUTS } from "../../constants/navigation";
import { BRAND } from "../../constants/brand-colors";
import { useBranding } from "../../contexts/BrandingContext";
import { useViewTransitionRoute } from "../../hooks/useViewTransitionRoute";

const CommandBar = lazy(() => import("../CommandBar"));
const ProductTour = lazy(() => import("../ProductTour"));
const TrialGateModal = lazy(() => import("../TrialGateModal"));
const KeyboardShortcuts = lazy(() => import("../KeyboardShortcuts"));

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

function getPageContext(
  pathname: string,
  search: string,
): { eyebrow?: string; title: string; subtitle?: string } {
  const exactTitle = PAGE_TITLES[pathname];
  const params = new URLSearchParams(search);
  const phoneTab = params.get("tab");
  const opsTab = params.get("tab");
  const adminTab = params.get("tab");

  if (exactTitle) {
    for (const group of NAV_GROUPS) {
      const match = group.items.find(
        (item) =>
          item.path === pathname ||
          item.matches?.some((m) => pathname === m || pathname.startsWith(`${m}/`)),
      );
      if (match) {
        if (pathname === "/phone") {
          if (phoneTab === "outbound")
            return {
              eyebrow: group.label,
              title: "Outbound",
              subtitle: "Campaigns, dispatch & lead queue",
            };
          if (phoneTab === "appointments")
            return {
              eyebrow: group.label,
              title: "Appointments",
              subtitle: "Scheduled by your agents",
            };
          return { eyebrow: group.label, title: "Phone", subtitle: ROUTE_SUBTITLES["/phone"] };
        }
        if (pathname === "/ops") {
          if (opsTab === "intel")
            return {
              eyebrow: group.label,
              title: "Live Ops",
              subtitle: "Pending actions & follow-ups",
            };
          if (opsTab === "analytics")
            return {
              eyebrow: group.label,
              title: "Live Ops",
              subtitle: "Sentiment & unit economics",
            };
          return { eyebrow: group.label, title: "Live Ops", subtitle: ROUTE_SUBTITLES["/ops"] };
        }
        if (pathname === "/admin") {
          const tabMeta: Record<string, { title: string; subtitle: string }> = {
            subscription: { title: "Billing", subtitle: "Plan, usage & payment" },
            team: { title: "Team", subtitle: "Members & invitations" },
            branding: { title: "Branding", subtitle: "Logo, colors & white-label" },
            carrier: { title: "Carrier", subtitle: "Numbers, routing & voice network" },
            flywheel: { title: "Growth", subtitle: "Prospecting & autonomous outreach" },
            system: { title: "System", subtitle: "Platform health & dependencies" },
            activity: { title: "Activity", subtitle: "Recent configuration changes" },
          };
          if (adminTab && tabMeta[adminTab]) return { eyebrow: group.label, ...tabMeta[adminTab] };
          return { eyebrow: group.label, title: "Settings", subtitle: ROUTE_SUBTITLES["/admin"] };
        }
        if (pathname === "/agents")
          return { eyebrow: group.label, title: "Agents", subtitle: ROUTE_SUBTITLES["/agents"] };
        return { eyebrow: group.label, title: exactTitle, subtitle: ROUTE_SUBTITLES[pathname] };
      }
    }
    return { title: exactTitle, subtitle: ROUTE_SUBTITLES[pathname] };
  }
  if (pathname.startsWith("/contact/"))
    return {
      eyebrow: "Activity",
      title: "Contact Profile",
      subtitle: "Timeline, calls & appointments",
    };
  const prefix = `/${pathname.split("/").filter(Boolean)[0] || ""}`;
  return { title: PAGE_TITLES[prefix] || "Workspace" };
}

export default function AppShell() {
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const edgeSwipe = useRef<{ x: number; y: number } | null>(null);
  const [navBadges, setNavBadges] = useState<Record<string, number>>({});
  const { user, loading } = useAuth();
  const { branding } = useBranding();
  const location = useLocation();
  const navigate = useNavigate();
  useViewTransitionRoute();

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
        /* non-critical */
      }
    };
    fetchCounts();
    const interval = setInterval(fetchCounts, 120_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user]);

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
              background: `conic-gradient(from 0deg, ${BRAND.purple}, ${BRAND.purpleLight}, ${BRAND.purpleDeep}, ${BRAND.purpleMuted}, ${BRAND.purple})`,
              filter: "blur(3px)",
            }}
          />
          <div className="absolute inset-2 rounded-full bg-paper" />
          <div className="absolute inset-4 rounded-full glass flex items-center justify-center">
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
            >
              <WirelineMark className="w-16 h-16 text-brand" strokeWidth={90} />
            </motion.div>
          </div>
        </div>
        <motion.div
          className="space-y-4 relative z-10"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <h1 className="brand-wordmark text-5xl md:text-7xl leading-[0.85]">
            {branding.brand_name.toUpperCase()}
          </h1>
          <p className="text-[10px] font-mono uppercase tracking-[0.4em] text-brand/60">
            Growth Engine Initializing
          </p>
          <div className="flex items-center justify-center gap-2 pt-6">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="w-2 h-2 rounded-full bg-brand/60"
                animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
                transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.25, ease: "easeInOut" }}
              />
            ))}
          </div>
        </motion.div>
      </div>
    );
  }

  const pageCtx = getPageContext(location.pathname, location.search);

  return (
    <div className="client-console flex flex-col min-h-dvh text-ink font-sans overflow-hidden relative">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-md focus:bg-primary focus:text-primary-foreground focus:text-sm focus:font-medium focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        Skip to main content
      </a>
      <AuroraBackdrop />
      <div className="scanline" />

      <ErrorBoundary fallback={null}>
        <Suspense fallback={null}>
          <CommandBar />
          <ProductTour />
          <TrialGateModal />
          {showShortcuts && (
            <KeyboardShortcuts open={showShortcuts} onClose={() => setShowShortcuts(false)} />
          )}
        </Suspense>
      </ErrorBoundary>

      {/* Left-edge swipe zone for mobile drawer */}
      <div
        className="md:hidden fixed top-0 left-0 bottom-0 w-5 z-[45]"
        aria-hidden="true"
        style={{ touchAction: "pan-y", pointerEvents: drawerOpen ? "none" : "auto" }}
        onPointerDown={(e) => {
          edgeSwipe.current = { x: e.clientX, y: e.clientY };
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!edgeSwipe.current) return;
          if (
            e.clientX - edgeSwipe.current.x > 48 &&
            Math.abs(e.clientY - edgeSwipe.current.y) < (e.clientX - edgeSwipe.current.x) * 0.55
          ) {
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

      <TopBar
        onShowShortcuts={() => setShowShortcuts(true)}
        drawerOpen={drawerOpen}
        onDrawerChange={setDrawerOpen}
        navBadges={navBadges}
      />
      <Sidebar navBadges={navBadges} />

      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 overflow-hidden relative flex flex-col z-10 focus:outline-none lg:pl-[var(--wireline-rail-w,56px)] transition-[padding-left] duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
      >
        <EmailVerifyBanner />
        <TrialBanner />

        {/* Clean page header — with subtle entrance animation */}
        <motion.div
          className="hidden lg:block shrink-0 bg-background/35 backdrop-blur-md px-6 py-2.5 relative overflow-hidden"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Subtle glowing radial aura behind title */}
          <div
            aria-hidden="true"
            className="absolute left-6 top-1/2 -translate-y-1/2 w-40 h-8 pointer-events-none opacity-16 dark:opacity-24 blur-xl"
            style={{
              background: "radial-gradient(circle, var(--color-brand) 0%, transparent 70%)",
            }}
            data-circular
          />
          <div className="flex items-baseline justify-between gap-4 relative z-10">
            <div className="flex items-baseline gap-2.5 min-w-0">
              {pageCtx.eyebrow && (
                <>
                  <span className="text-[9px] font-mono uppercase tracking-[0.22em] text-brand/70">
                    {pageCtx.eyebrow}
                  </span>
                  <span aria-hidden="true" className="text-brand/30 text-xs">
                    ·
                  </span>
                </>
              )}
              <h1 className="font-display italic text-xl leading-none text-foreground tracking-tight">
                {pageCtx.title}
              </h1>
              {pageCtx.subtitle && (
                <span className="hidden xl:inline text-[11px] text-muted-foreground/80 font-sans font-normal ml-1">
                  {pageCtx.subtitle}
                </span>
              )}
            </div>
          </div>
          {/* Custom fine-grain gradient divider */}
          <div
            aria-hidden="true"
            className="absolute bottom-0 left-0 right-0 h-px"
            style={{
              background:
                "linear-gradient(90deg, rgba(139,63,214,0.18) 0%, rgba(139,63,214,0.04) 50%, transparent 100%)",
            }}
          />
        </motion.div>

        <div className="flex-1 relative flex flex-col min-h-0 overflow-hidden">
          <div className="workspace-stage flex-1 overflow-hidden relative z-10 min-h-0 px-2 pb-2 md:px-3 md:pb-3 lg:px-4 lg:pb-4">
            <div className="app-surface max-w-[1840px] mx-auto px-2.5 md:px-3 lg:px-4 pt-1.5 md:pt-2.5 pb-2 md:pb-3 flex flex-col h-full min-h-0 min-w-0 mobile-page-canvas">
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
