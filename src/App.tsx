import React, { useEffect, lazy, Suspense } from "react";
import { BrowserRouter, useLocation, useNavigate } from "react-router-dom";
import AuthPortal from "./components/AuthPortal";
import { PrivacyPolicy, TermsOfService, DataDeletion, ZoomDocs } from "./components/LegalPage";
import { ChangelogPage } from "./components/Changelog";
import { SupportPage } from "./components/SupportPage";
import CookieConsent from "./components/CookieConsent";
import ToastStack from "./components/Toast";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ToastProvider } from "./contexts/ToastContext";
import AppShell from "./components/layout/AppShell";
import NotFound from "./components/layout/NotFound";
import { BrandingProvider } from "./contexts/BrandingContext";
import { MotionConfig } from "motion/react";

const Pricing = lazy(() => import("./pages/Pricing"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const OAuthComplete = lazy(() => import("./pages/OAuthComplete"));
const VerticalLanding = lazy(() => import("./pages/VerticalLanding"));
const Compare = lazy(() => import("./pages/Compare"));
const About = lazy(() => import("./pages/About"));
const Showcase = lazy(() => import("./pages/Showcase"));

function AppContent() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Redirect authenticated users away from auth-only pages to dashboard
  useEffect(() => {
    if (
      user &&
      (location.pathname === "/login" ||
        location.pathname === "/signin" ||
        location.pathname === "/signup")
    ) {
      navigate("/", { replace: true });
    }
  }, [user, location.pathname, navigate]);

  // Public pages — accessible before auth.
  if (location.pathname === "/privacy") return <PrivacyPolicy />;
  if (location.pathname === "/terms") return <TermsOfService />;
  if (location.pathname === "/legal/data-deletion") return <DataDeletion />;
  // Integration-specific docs pages — required for marketplace review on
  // platforms like Zoom that demand a vendor-hosted setup guide.
  if (location.pathname === "/docs/zoom") return <ZoomDocs />;
  // Public changelog — pre-launch trust signal and post-launch
  // transparency: every prospect can verify "yes they ship."
  if (location.pathname === "/changelog") return <ChangelogPage />;
  if (location.pathname === "/support") return <SupportPage />;

  // Vertical wedge pages — outbound DMs target these directly with
  // industry-specific copy, but the product behind them is the same
  // horizontal platform. /for/<slug> maps 1:1 to the WEDGES record
  // in VerticalLanding.tsx; new wedges land by adding a config entry.
  const verticalMatch = location.pathname.match(/^\/for\/([a-z-]+)$/);
  if (verticalMatch) {
    const slug = verticalMatch[1] as
      | "home-services"
      | "medical"
      | "legal"
      | "real-estate"
      | "personal"
      | "insurance"
      | "restaurants"
      | "sales";
    if (
      [
        "home-services",
        "medical",
        "legal",
        "real-estate",
        "personal",
        "insurance",
        "restaurants",
        "sales",
      ].includes(slug)
    ) {
      return (
        <Suspense fallback={<div className="min-h-dvh bg-paper" />}>
          <VerticalLanding slug={slug} />
        </Suspense>
      );
    }
  }
  if (location.pathname === "/pricing") {
    return (
      <Suspense fallback={<div className="min-h-dvh" />}>
        <Pricing />
      </Suspense>
    );
  }
  if (location.pathname === "/compare") {
    return (
      <Suspense fallback={<div className="min-h-dvh bg-paper" />}>
        <Compare />
      </Suspense>
    );
  }
  if (location.pathname === "/about") {
    return (
      <Suspense fallback={<div className="min-h-dvh bg-paper" />}>
        <About />
      </Suspense>
    );
  }
  // /showcase — playable agent templates (singing receptionist + future
  // fun demos). Renders BEFORE the auth guard so anonymous prospects
  // can audition personas without signing in.
  if (location.pathname === "/showcase") {
    return (
      <Suspense fallback={<div className="min-h-dvh bg-paper" />}>
        <Showcase />
      </Suspense>
    );
  }
  // /reset-password lands here from the password-reset email. Must
  // render BEFORE the auth guard below so a signed-out user can use it.
  if (location.pathname === "/reset-password") {
    return (
      <Suspense fallback={<div className="min-h-dvh" />}>
        <ResetPassword />
      </Suspense>
    );
  }
  // OAuth bridge — Google / Microsoft sign-in lands here with token in
  // the query string. The page reads the params, calls signIn(), and
  // redirects to /. Renders BEFORE the auth guard so an unauthenticated
  // user can complete the handshake.
  if (location.pathname === "/auth/oauth-complete") {
    return (
      <Suspense fallback={<div className="min-h-dvh" />}>
        <OAuthComplete />
      </Suspense>
    );
  }
  // Explicit public 404 route — used by marketing emails, error redirects, etc.
  // Renders the friendly NotFound with public CTAs (demo line, pricing, home)
  // instead of bouncing into the sign-in form.
  if (location.pathname === "/not-found" || location.pathname === "/404") {
    return (
      <div className="min-h-dvh relative bg-paper">
        <NotFound mode="public" />
      </div>
    );
  }

  if (!user) {
    // Unauthenticated home IS AuthPortal — the auth form on one side,
    // the live demo-agent grid + value props on the other. Mike's
    // call: kill the separate marketing LandingPage, the portal does
    // both jobs (sell + sign in) on one screen. Any deep-link to a
    // protected route also lands here so visitors sign in then
    // continue.
    return <AuthPortal />;
  }

  // AppShell already renders the ⌘K CommandBar — don't double-mount.
  return <AppShell />;
}

export default function App() {
  return (
    // reducedMotion="user" tells motion to honor the OS-level
    // prefers-reduced-motion media query. Users with vestibular disorders
    // (or anyone who flipped the system toggle) now get static UI instead
    // of aurora/glow/scale animations.
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <AuthProvider>
          <BrandingProvider>
            <ToastProvider>
              <AppContent />
              <ToastStack />
              <CookieConsent />
            </ToastProvider>
          </BrandingProvider>
        </AuthProvider>
      </BrowserRouter>
    </MotionConfig>
  );
}
