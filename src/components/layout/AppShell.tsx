import React, { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { authFetch } from "../../lib/api";
import WirelineMark from "../WirelineMark";
import ErrorBoundary from "../ErrorBoundary";
import AuroraBackdrop from "./AuroraBackdrop";
import TopBar from "./TopBar";
import BottomNavBar from "./BottomNavBar";
import RouteAccentStrip from "./RouteAccentStrip";
import TrialBanner from "./TrialBanner";
import EmailVerifyBanner from "./EmailVerifyBanner";
import AppRoutes from "../../routes/AppRoutes";
import { PAGE_TITLES } from "../../constants/navigation";
import { useBranding } from "../../contexts/BrandingContext";
import { useViewTransitionRoute } from "../../hooks/useViewTransitionRoute";

const CommandBar = lazy(() => import("../CommandBar"));
const PersonaWizard = lazy(() => import("../PersonaWizard"));
const ProductTour = lazy(() => import("../ProductTour"));
const TrialGateModal = lazy(() => import("../TrialGateModal"));
const KeyboardShortcuts = lazy(() => import("../KeyboardShortcuts"));

export default function AppShell() {
  const [showShortcuts, setShowShortcuts] = useState(false);
  // Lifted from TopBar so BottomNavBar can also open the nav drawer.
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Tracks the start point of a left-edge swipe gesture.
  const edgeSwipe = useRef<{ x: number; y: number } | null>(null);
  // Lifted from TopBar so both TopBar desktop nav and BottomNavBar share
  // the same badge data from a single polling source.
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
        if (!cancelled && r.ok) {
          const d = await r.json();
          setNavBadges(d as Record<string, number>);
        }
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
        const routes: Record<string, string> = {
          D: "/",
          L: "/logs",
          T: "/triage",
          I: "/insights",
          A: "/agents",
          R: "/train",
          O: "/outbound",
          S: "/admin",
        };
        if (routes[key]) {
          navigate(routes[key]);
        }
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
          <p className="text-[10px] uppercase tracking-[0.6em] text-muted">
            Growth Engine Initializing
          </p>
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
      <AuroraBackdrop />
      <div className="scanline" />

      <ErrorBoundary fallback={null}>
        <Suspense fallback={null}>
          <CommandBar />
          <PersonaWizard />
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

      <TopBar
        onShowShortcuts={() => setShowShortcuts(true)}
        drawerOpen={drawerOpen}
        onDrawerChange={setDrawerOpen}
        navBadges={navBadges}
      />

      <main className="flex-1 overflow-hidden relative flex flex-col z-10">
        <RouteAccentStrip />
        <EmailVerifyBanner />
        <TrialBanner />

        <div className="flex-1 relative flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-hidden relative z-10 min-h-0">
            <div className="max-w-[1920px] mx-auto px-3 md:px-4 lg:px-5 pt-2 md:pt-4 pb-0 md:pb-4 flex flex-col h-full min-h-0 mobile-page-canvas">
              <ErrorBoundary>
                <AppRoutes />
              </ErrorBoundary>
            </div>
          </div>

          {/* Spacer for the fixed BottomNavBar — reserves exactly the bar
              height + home indicator clearance so the last row of content
              is never obscured on mobile. Invisible on md+. */}
          <div
            className="md:hidden shrink-0"
            aria-hidden="true"
            style={{ height: "calc(49px + env(safe-area-inset-bottom))" }}
          />
        </div>
      </main>

      {/* iOS-style fixed bottom navigation — primary 4 destinations + More */}
      <BottomNavBar onOpenMenu={() => setDrawerOpen(true)} badges={navBadges} />
    </div>
  );
}
