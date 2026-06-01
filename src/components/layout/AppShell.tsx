import React, { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
import { useVisualViewport } from "../../hooks/useVisualViewport";

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
  const vv = useVisualViewport();

  useEffect(() => {
    if (vv.height == null) return;
    document.documentElement.style.setProperty("--vv-height", `${vv.height}px`);
    document.documentElement.style.setProperty("--vv-offset-top", `${vv.offsetTop}px`);
    return () => {
      document.documentElement.style.removeProperty("--vv-height");
      document.documentElement.style.removeProperty("--vv-offset-top");
    };
  }, [vv.height, vv.offsetTop]);

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
              background: `conic-gradient(from 0deg, ${BRAND.purple}, ${BRAND.purpleDeep}, ${BRAND.purpleLight}, ${BRAND.purpleDeep}, ${BRAND.purple})`,
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

        {/* Mobile/tablet page heading — condenses the desktop page context
            into a compact one-line bar visible below the TopBar. The desktop
            breadcrumb block above (`hidden lg:block`) carries the full
            eyebrow + italic title + subtitle; this one provides the same
            title on viewports where that block is invisible. */}
        <div className="lg:hidden shrink-0 bg-background/35 backdrop-blur-md px-3 py-1.5 border-b border-black/[0.05] dark:border-white/[0.04]">
          <div className="flex items-center gap-1.5 min-w-0">
            {pageCtx.eyebrow && (
              <>
                <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-brand/60 shrink-0">
                  {pageCtx.eyebrow}
                </span>
                <span aria-hidden="true" className="text-brand/30 text-[10px]">
                  ·
                </span>
              </>
            )}
            <h1 className="font-display italic text-sm leading-none text-foreground tracking-tight truncate">
              {pageCtx.title}
            </h1>
          </div>
        </div>

        <div className="flex-1 relative flex flex-col min-h-0 overflow-hidden">
          <div className="workspace-stage flex-1 overflow-hidden relative z-10 min-h-0 px-3 pb-2 md:px-3 md:pb-3 lg:px-4 lg:pb-4">
            <div className="app-surface max-w-[1840px] mx-auto px-2.5 md:px-3 lg:px-4 pt-1.5 md:pt-2.5 pb-0 md:pb-3 flex flex-col h-full min-h-0 mobile-page-canvas">
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
