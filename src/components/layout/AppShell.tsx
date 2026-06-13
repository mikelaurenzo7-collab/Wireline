import React, { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { authFetch, readApiJson } from "../../lib/api";
import WirelineMark from "../WirelineMark";
import ErrorBoundary from "../ErrorBoundary";
import AuthenticatedBackdrop from "./AuthenticatedBackdrop";
import TopBar from "./TopBar";
import Sidebar from "./Sidebar";
import WorkspaceTopBar from "./WorkspaceTopBar";
import { shouldShowAppPageContext } from "../../lib/wireline-app-chrome";
import TrialBanner from "./TrialBanner";
import EmailVerifyBanner from "./EmailVerifyBanner";
import AppRoutes from "../../routes/AppRoutes";
import {
  findNavItemForPath,
  NAV_GROUPS,
  PAGE_TITLES,
  APP_KEYBOARD_SHORTCUTS,
} from "../../constants/navigation";
import { cn } from "../../lib/utils";
import { useBranding } from "../../contexts/BrandingContext";
import { useViewTransitionRoute } from "../../hooks/useViewTransitionRoute";
import { useVisualViewport } from "../../hooks/useVisualViewport";

const CommandBar = lazy(() => import("../CommandBar"));
const PostSignupOnboarding = lazy(() => import("../PostSignupOnboarding"));
const ActivationNudge = lazy(() => import("../ActivationNudge"));
const TrialGateModal = lazy(() => import("../TrialGateModal"));
const KeyboardShortcuts = lazy(() => import("../KeyboardShortcuts"));

const ROUTE_SUBTITLES: Record<string, string> = {
  "/phone": "Call history, outbound campaigns & appointments",
  "/email": "Manage threads, drafts & automated responses",
  "/sms": "Two-way conversations & automated follow-ups",
  "/training": "Teach, tune & refine your agents",
  "/ops": "Live callers, supervisor tools & fleet pulse",
  "/insights": "Performance analytics, topics & trend discovery",
  "/pipeline": "Leads across the funnel — scored and staged",
  "/admin": "Account configuration & integrations",
  "/agents": "Build, voice & tune your agents",
  "/integrations": "Email, CRM & third-party connections",
  "/dnc": "Do-not-call list & TCPA compliance",
  "/audit": "Security events & compliance ledger",
  "/chat": "Fleet coach — plan, coach agents, and approve from one thread",
  "/founder": "Owner command center, launch posture & growth controls",
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
            title: "Intelligence",
            subtitle: "Signal, sentiment & coaching insights",
          };
        return { eyebrow: section, title: exactTitle, subtitle: ROUTE_SUBTITLES[pathname] };
      }
      if (pathname === "/admin") {
        if (adminTab === "usage")
          return { eyebrow: section, title: "Usage", subtitle: "Minutes, spend & overage guardrails" };
        if (adminTab === "billing")
          return { eyebrow: section, title: "Billing", subtitle: "Plan, invoices & payment method" };
        return { eyebrow: section, title: exactTitle, subtitle: ROUTE_SUBTITLES[pathname] };
      }
      return { eyebrow: section, title: exactTitle, subtitle: ROUTE_SUBTITLES[pathname] };
    }
  }

  return { title: exactTitle ?? "Wireline", subtitle: exactTitle ? ROUTE_SUBTITLES[pathname] : undefined };
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [commandOpen, setCommandOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showActivation, setShowActivation] = useState(false);
  const [trialBlocked, setTrialBlocked] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const { primary, secondary } = useBranding();
  const { height: viewportHeight } = useVisualViewport();
  useViewTransitionRoute();

  const isChatRoute = location.pathname === "/chat";
  const pageContext = getPageContext(location.pathname, location.search);
  const showPageContext = shouldShowAppPageContext(location.pathname);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
        return;
      }

      if (!isTyping && event.altKey) {
        const shortcut = APP_KEYBOARD_SHORTCUTS.find((item) => item.key.toLowerCase() === event.key.toLowerCase());
        if (shortcut) {
          event.preventDefault();
          navigate(shortcut.to);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  useEffect(() => {
    const checkOnboarding = async () => {
      try {
        const res = await authFetch("/api/account/status");
        const data = await readApiJson(res);
        if (data?.needsOnboarding) setShowOnboarding(true);
        if (data?.needsActivation) setShowActivation(true);
        if (data?.trialBlocked) setTrialBlocked(true);
      } catch (error) {
        console.error("Failed to check onboarding status", error);
      }
    };
    if (user) void checkOnboarding();
  }, [user]);

  return (
    <div
      className="relative flex h-dvh max-h-dvh min-h-0 overflow-hidden bg-paper text-ink app-shell"
      data-brand-primary={primary}
      data-brand-secondary={secondary}
      data-visual-height={viewportHeight ? `${viewportHeight}px` : undefined}
    >
      <AuthenticatedBackdrop />
      <Sidebar />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <TopBar user={user} onLogout={logout} onOpenCommand={() => setCommandOpen(true)} />
        {showPageContext && (
          <WorkspaceTopBar
            eyebrow={pageContext.eyebrow}
            title={pageContext.title}
            subtitle={pageContext.subtitle}
            compact={isChatRoute}
          />
        )}
        <main
          ref={mainRef}
          id="main-content"
          tabIndex={-1}
          className={cn(
            "relative z-10 min-h-0 flex-1 overflow-hidden focus:outline-none",
            isChatRoute ? "" : "px-4 pb-4 lg:px-6 lg:pb-6",
          )}
        >
          <ErrorBoundary>
            <AppRoutes />
          </ErrorBoundary>
        </main>
      </div>
      <Suspense fallback={null}>
        <CommandBar open={commandOpen} onOpenChange={setCommandOpen} />
        {showOnboarding && <PostSignupOnboarding onClose={() => setShowOnboarding(false)} />}
        {showActivation && <ActivationNudge onClose={() => setShowActivation(false)} />}
        {trialBlocked && <TrialGateModal onClose={() => setTrialBlocked(false)} />}
        <KeyboardShortcuts />
      </Suspense>
    </div>
  );
}
