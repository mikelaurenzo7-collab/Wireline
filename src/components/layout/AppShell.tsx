import React, { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { authFetch, readApiJson } from "../../lib/api";
import WirelineMark from "../WirelineMark";
import ErrorBoundary from "../ErrorBoundary";
import AuroraBackdrop from "./AuroraBackdrop";
import TopBar from "./TopBar";
import Sidebar from "./Sidebar";
import DesktopPageContext from "./DesktopPageContext";
import AppChromeSubTabs from "./AppChromeSubTabs";
import ThemeToggle from "../ThemeToggle";
import { ShadButton } from "../ui/shadcn/ShadButton";
import { Keyboard } from "lucide-react";
import { shouldShowAppPageContext } from "../../lib/wireline-app-chrome";
import { WL_APP_CLASSES } from "../../lib/wireline-director-design";
import TrialBanner from "./TrialBanner";
import EmailVerifyBanner from "./EmailVerifyBanner";
import AppRoutes from "../../routes/AppRoutes";
import {
  findNavItemForPath,
  NAV_GROUPS,
  PAGE_TITLES,
  APP_KEYBOARD_SHORTCUTS,
} from "../../constants/navigation";
import { BRAND } from "../../constants/brand-colors";
import { cn } from "../../lib/utils";
import { useBranding } from "../../contexts/BrandingContext";
import { useViewTransitionRoute } from "../../hooks/useViewTransitionRoute";
import { useVisualViewport } from "../../hooks/useVisualViewport";

const CommandBar = lazy(() => import("../CommandBar"));
const PostSignupOnboarding = lazy(() => import("../PostSignupOnboarding"));
const TrialGateModal = lazy(() => import("../TrialGateModal"));
const KeyboardShortcuts = lazy(() => import("../KeyboardShortcuts"));

const ROUTE_SUBTITLES: Record<string, string> = {
  "/phone": "Call history, outbound campaigns & appointments",
  "/email": "Manage threads, drafts & automated responses",
  "/sms": "Two-way conversations & automated follow-ups",
  "/training": "Teach, tune & refine your agents",
  "/ops": "Live callers, supervisor tools & fleet pulse",
  "/triage": "Flagged conversations needing human review",
  "/insights": "Performance analytics, topics & trend discovery",
  "/pipeline": "Leads across the funnel — scored and staged",
  "/admin": "Account configuration & integrations",
  "/agents": "Deploy, configure & manage your fleet",
  "/integrations": "Email, CRM & third-party connections",
  "/dnc": "Do-not-call list & TCPA compliance",
  "/audit": "Security events & compliance ledger",
  "/chat": "Director wingman — plan, coach, and approve from one thread",
  "/help": "Team lines, demos & quick paths into the product",
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
    const navMatch = findNavItemForPath(pathname);
    const section = navMatch?.section;
    if (navMatch) {
      if (pathname === "/phone") {
        if (phoneTab === "outbound")
          return {
            eyebrow: section,
            title: "Outbound",
            subtitle: "Campaigns, dispatch & lead queue",
          };
        if (phoneTab === "appointments")
          return {
            eyebrow: section,
            title: "Appointments",
            subtitle: "Scheduled by your agents",
          };
        return { eyebrow: section, title: "Phone", subtitle: ROUTE_SUBTITLES["/phone"] };
      }
      if (pathname === "/ops") {
        if (opsTab === "intel")
          return {
            eyebrow: section,
            title: "Live Ops",
            subtitle: "Pending actions & follow-ups",
          };
        if (opsTab === "analytics")
          return {
            eyebrow: section,
            title: "Live Ops",
            subtitle: "Sentiment & unit economics",
          };
        return { eyebrow: section, title: "Live Ops", subtitle: ROUTE_SUBTITLES["/ops"] };
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
        if (adminTab && tabMeta[adminTab]) return { eyebrow: "Admin", ...tabMeta[adminTab] };
        return { eyebrow: "Admin", title: "Settings", subtitle: ROUTE_SUBTITLES["/admin"] };
      }
      if (pathname === "/agents") {
        const agentsTab = params.get("tab");
        if (agentsTab === "fleet")
          return {
            eyebrow: section ?? "Fleet",
            title: "My Fleet",
            subtitle: "Configure and manage deployed agents",
          };
        return {
          eyebrow: section ?? "Fleet",
          title: "Agents",
          subtitle: ROUTE_SUBTITLES["/agents"],
        };
      }
      return {
        eyebrow: section,
        title: exactTitle,
        subtitle: ROUTE_SUBTITLES[pathname],
      };
    }
    for (const group of NAV_GROUPS) {
      const match = group.items.find(
        (item) =>
          item.path === pathname ||
          item.matches?.some((m) => pathname === m || pathname.startsWith(`${m}/`)),
      );
      if (match) {
        return {
          eyebrow: match.section ?? group.label,
          title: exactTitle,
          subtitle: ROUTE_SUBTITLES[pathname],
        };
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
        <div className="relative w-36 h-36 md:w-44 md:h-44 mb-10 md:mb-12 animate-spin-slow">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `conic-gradient(from 0deg, ${BRAND.purple}, ${BRAND.purpleDeep}, ${BRAND.purpleLight}, ${BRAND.purpleDeep}, ${BRAND.purple})`,
              filter: "blur(3px)",
            }}
          />
          <div className="absolute inset-2 rounded-full bg-paper" />
          <div className="absolute inset-4 rounded-full wl-panel flex items-center justify-center">
            <div className="animate-pulse">
              <WirelineMark className="w-14 h-14 md:w-16 md:h-16 text-brand" strokeWidth={90} />
            </div>
          </div>
        </div>
        <div className="space-y-4 relative z-10">
          <h1 className="brand-wordmark text-4xl md:text-6xl lg:text-7xl leading-[0.85] hero-headline-glow">
            {branding.brand_name.toUpperCase()}
          </h1>
          <p className="text-eyebrow tracking-[0.4em] text-muted/60">Growth Engine Initializing</p>
          <div className="wl-loading-dots justify-center pt-4">
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>
    );
  }

  const pageCtx = getPageContext(location.pathname, location.search);
  const showPageContext = shouldShowAppPageContext(location.pathname);

  return (
    <div
      data-testid="client-console"
      className="client-console flex flex-col min-h-dvh md:h-dvh md:max-h-dvh md:min-h-0 text-ink font-sans overflow-x-hidden overflow-y-auto md:overflow-hidden relative"
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-md focus:bg-primary focus:text-primary-foreground focus:text-sm focus:font-medium focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        Skip to main content
      </a>
      <AuroraBackdrop />

      <ErrorBoundary fallback={null}>
        <Suspense fallback={null}>
          <CommandBar />
          <PostSignupOnboarding />
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
        className="client-console__main flex-1 min-h-0 overflow-x-hidden overflow-y-auto md:overflow-hidden overscroll-y-contain relative flex flex-col z-10 focus:outline-none lg:pl-[var(--wireline-rail-w,56px)] transition-[padding-left] duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
      >
        <EmailVerifyBanner />
        <TrialBanner />

        {showPageContext && (
          <DesktopPageContext
            eyebrow={pageCtx.eyebrow}
            title={pageCtx.title}
            subtitle={pageCtx.subtitle}
            onShowShortcuts={() => setShowShortcuts(true)}
          />
        )}

        {/* Mobile/tablet route context — title strip + tools (theme moved off sidebar). */}
        {showPageContext && (
          <div
            className={cn(
              "lg:hidden shrink-0 px-3 sm:px-4 py-2.5",
              WL_APP_CLASSES.mobileContextBar,
            )}
          >
            <div
              className={cn(
                "flex items-start justify-between gap-2",
                WL_APP_CLASSES.mobileContextAccent,
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  {pageCtx.eyebrow && (
                    <>
                      <span className="wl-label text-brand/65 shrink-0">{pageCtx.eyebrow}</span>
                      <span aria-hidden="true" className="text-brand/25 text-[10px]">
                        ·
                      </span>
                    </>
                  )}
                  <p className="font-display italic text-sm leading-none text-foreground tracking-tight truncate">
                    {pageCtx.title}
                  </p>
                </div>
                {pageCtx.subtitle && (
                  <p className="mt-1 text-[11px] leading-snug text-muted line-clamp-2 text-pretty">
                    {pageCtx.subtitle}
                  </p>
                )}
              </div>
              <div className={cn(WL_APP_CLASSES.chromeToolbar, "shrink-0")}>
                <ShadButton
                  type="button"
                  variant="ghost"
                  size="icon"
                  disableAnimations
                  onClick={() => setShowShortcuts(true)}
                  className="h-8 w-8 rounded-md text-muted hover:text-ink"
                  aria-label="Keyboard shortcuts"
                  title="Shortcuts (?)"
                >
                  <Keyboard className="w-4 h-4" strokeWidth={1.75} />
                </ShadButton>
                <ThemeToggle variant="default" compact className="rounded-md" />
              </div>
            </div>
          </div>
        )}

        {showPageContext && <AppChromeSubTabs className="pb-1 lg:pb-0" />}

        <div className="client-console__stage-wrap flex-1 relative flex flex-col min-h-0">
          <div className="client-console__stage workspace-stage flex-1 overflow-x-hidden overflow-y-auto md:overflow-hidden relative z-10 min-h-0 px-3 pb-2 md:px-3 md:pb-3 lg:px-4 lg:pb-4">
            <div
              className={cn(
                "app-surface max-w-[1840px] mx-auto w-full px-2.5 md:px-3 lg:px-4 pb-0 md:pb-3 flex flex-col flex-1 min-h-0 mobile-page-canvas",
                showPageContext ? "pt-1.5 md:pt-2.5" : "pt-1 md:pt-1.5",
              )}
            >
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
