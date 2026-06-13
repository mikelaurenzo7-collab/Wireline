import React, { useEffect, lazy, Suspense } from "react";
import { BrowserRouter, useLocation, useNavigate, Navigate } from "react-router-dom";
import AuthPortal from "./components/AuthPortal";

const LandingPage = lazy(() => import("./pages/LandingPage"));

import CookieConsent from "./components/CookieConsent";
import ToastStack from "./components/Toast";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ToastProvider } from "./contexts/ToastContext";
import { AgentsProvider } from "./contexts/AgentsContext";
import { AccountProvider } from "./contexts/AccountContext";
import AppShell from "./components/layout/AppShell";
import NotFound from "./components/layout/NotFound";
import MarketingRouteFallback from "./components/layout/MarketingRouteFallback";
import MarketingChrome from "./components/marketing/MarketingChrome";
import ErrorBoundary from "./components/ErrorBoundary";
import { BrandingProvider } from "./contexts/BrandingContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { MotionConfig } from "motion/react";
import { isMarketingHomePath, isSessionOptionalPublicPath } from "./lib/public-routes";

const Pricing = lazy(() => import("./pages/Pricing"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const OAuthComplete = lazy(() => import("./pages/OAuthComplete"));
const VerticalLanding = lazy(() => import("./pages/VerticalLanding"));
const Compare = lazy(() => import("./pages/Compare"));
const About = lazy(() => import("./pages/About"));
const Showcase = lazy(() => import("./pages/Showcase"));
const Developers = lazy(() => import("./pages/Developers"));
const Blog = lazy(() => import("./pages/Blog"));
const BlogPost = lazy(() => import("./pages/BlogPost"));
const Status = lazy(() => import("./components/Status"));
const PublicChangelog = lazy(() => import("./components/PublicChangelog"));
const Security = lazy(() => import("./components/Security"));
const Contact = lazy(() =>
  import("./components/ContactPage").then((m) => ({ default: m.ContactPage })),
);

const PrivacyPolicy = lazy(() =>
  import("./components/LegalPage").then((m) => ({ default: m.PrivacyPolicy })),
);
const TermsOfService = lazy(() =>
  import("./components/LegalPage").then((m) => ({ default: m.TermsOfService })),
);
const DataDeletion = lazy(() =>
  import("./components/LegalPage").then((m) => ({ default: m.DataDeletion })),
);
const ZoomDocs = lazy(() =>
  import("./components/LegalPage").then((m) => ({ default: m.ZoomDocs })),
);
const SupportPage = lazy(() =>
  import("./components/SupportPage").then((m) => ({ default: m.SupportPage })),
);

function PublicNotFound() {
  return (
    <MarketingChrome stickyCta={false}>
      <NotFound mode="public" />
    </MarketingChrome>
  );
}

function AppContent() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Redirect authenticated users away from auth-only pages to Live Ops.
  useEffect(() => {
    if (!user) return;
    const path = location.pathname;
    if (
      path === "/login" ||
      path === "/signin" ||
      path === "/signup" ||
      path === "/auth" ||
      path.startsWith("/auth/")
    ) {
      navigate("/ops", { replace: true });
    }
  }, [user, location.pathname, navigate]);

  // Fail open: logged-in users who land on `/` after session hydrates go to the console.
  useEffect(() => {
    if (loading || !user) return;
    if (isMarketingHomePath(location.pathname)) {
      navigate("/ops", { replace: true });
    }
  }, [loading, user, location.pathname, navigate]);

  // Public pages — accessible before auth.
  if (location.pathname === "/privacy") {
    return (
      <Suspense fallback={<MarketingRouteFallback />}>
        <PrivacyPolicy />
      </Suspense>
    );
  }
  if (location.pathname === "/terms") {
    return (
      <Suspense fallback={<MarketingRouteFallback />}>
        <TermsOfService />
      </Suspense>
    );
  }
  if (location.pathname === "/legal/data-deletion") {
    return (
      <Suspense fallback={<MarketingRouteFallback />}>
        <DataDeletion />
      </Suspense>
    );
  }
  // Integration-specific docs pages — required for marketplace review on
  // platforms like Zoom that demand a vendor-hosted setup guide.
  if (location.pathname === "/docs/zoom") {
    return (
      <Suspense fallback={<MarketingRouteFallback />}>
        <ZoomDocs />
      </Suspense>
    );
  }
  if (location.pathname === "/support") {
    return (
      <Suspense fallback={<MarketingRouteFallback />}>
        <SupportPage />
      </Suspense>
    );
  }
  // Public contact surface — sales / partnership / press / general. Renders
  // BEFORE the auth guard so signed-out prospects (and inbound marketing/sales
  // links) get a real page instead of being bounced to the sign-in form. The
  // authenticated /contact/:number CRM profile route lives in AppRoutes.tsx and
  // is unaffected (different path).
  if (location.pathname === "/contact") {
    return (
      <Suspense fallback={<MarketingRouteFallback />}>
        <Contact />
      </Suspense>
    );
  }

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
        <Suspense fallback={<MarketingRouteFallback />}>
          <div className="marketing-surface min-h-dvh">
            <VerticalLanding slug={slug} />
          </div>
        </Suspense>
      );
    }
  }
  if (location.pathname === "/pricing") {
    return (
      <Suspense fallback={<MarketingRouteFallback />}>
        <div className="marketing-surface min-h-dvh">
          <Pricing />
        </div>
      </Suspense>
    );
  }
  if (location.pathname === "/compare") {
    return (
      <Suspense fallback={<MarketingRouteFallback />}>
        <Compare />
      </Suspense>
    );
  }
  if (location.pathname === "/about") {
    return (
      <Suspense fallback={<MarketingRouteFallback />}>
        <About />
      </Suspense>
    );
  }
  if (location.pathname === "/developers") {
    return (
      <Suspense fallback={<MarketingRouteFallback />}>
        <div className="marketing-surface min-h-dvh">
          <Developers />
        </div>
      </Suspense>
    );
  }
  if (location.pathname === "/blog") {
    return (
      <Suspense fallback={<MarketingRouteFallback />}>
        <div className="marketing-surface min-h-dvh">
          <Blog />
        </div>
      </Suspense>
    );
  }
  if (location.pathname.startsWith("/blog/")) {
    return (
      <Suspense fallback={<MarketingRouteFallback />}>
        <div className="marketing-surface min-h-dvh">
          <BlogPost />
        </div>
      </Suspense>
    );
  }
  // /showcase — playable agent templates (singing receptionist + future
  // fun demos). Renders BEFORE the auth guard so anonymous prospects
  // can audition personas without signing in.
  if (location.pathname === "/showcase") {
    return (
      <Suspense fallback={<MarketingRouteFallback />}>
        <div className="marketing-surface min-h-dvh">
          <Showcase />
        </div>
      </Suspense>
    );
  }
  // /reset-password lands here from the password-reset email. Must
  // render BEFORE the auth guard below so a signed-out user can use it.
  if (location.pathname === "/reset-password") {
    return (
      <Suspense fallback={<div className="min-h-dvh" />}>
        <ErrorBoundary>
          <ResetPassword />
        </ErrorBoundary>
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
        <ErrorBoundary>
          <OAuthComplete />
        </ErrorBoundary>
      </Suspense>
    );
  }
  // /status — public uptime page. Renders BEFORE the auth guard so
  // anyone (including external monitors and skeptical prospects) can
  // verify the system is up without an account.
  if (location.pathname === "/status") {
    return (
      <Suspense fallback={<MarketingRouteFallback />}>
        <ErrorBoundary>
          <Status />
        </ErrorBoundary>
      </Suspense>
    );
  }
  // /changelog — public shipping log. Same pattern as /status —
  // pre-auth so it serves as both a trust signal AND a discoverable
  // record for prospects evaluating velocity.
  if (location.pathname === "/changelog") {
    return (
      <Suspense fallback={<MarketingRouteFallback />}>
        <ErrorBoundary>
          <PublicChangelog />
        </ErrorBoundary>
      </Suspense>
    );
  }
  // /security — public security & compliance posture. Linked from
  // TrustSignals + footer. Honest, in-detail, never fabricated.
  if (location.pathname === "/security") {
    return (
      <Suspense fallback={<MarketingRouteFallback />}>
        <ErrorBoundary>
          <Security />
        </ErrorBoundary>
      </Suspense>
    );
  }
  // Explicit public 404 route — used by marketing emails, error redirects, etc.
  // Renders the friendly NotFound with public CTAs (demo line, pricing, home)
  // instead of bouncing into the sign-in form.
  if (location.pathname === "/not-found" || location.pathname === "/404") {
    return (
      <Suspense fallback={<MarketingRouteFallback />}>
        <PublicNotFound />
      </Suspense>
    );
  }

  // Session-optional public routes — render without blocking on auth hydration.
  if (!user && isSessionOptionalPublicPath(location.pathname)) {
    if (location.pathname === "/auth" || location.pathname.startsWith("/auth/")) {
      const legacySub = location.pathname.slice("/auth".length);
      const authTarget = legacySub === "/signup" ? "/signup" : "/signin";
      return <Navigate to={`${authTarget}${location.search}`} replace />;
    }
    if (location.pathname === "/login") {
      return <Navigate to={`/signin${location.search}`} replace />;
    }
    if (isMarketingHomePath(location.pathname)) {
      return (
        <Suspense fallback={<MarketingRouteFallback />}>
          <div className="marketing-surface min-h-dvh">
            <LandingPage />
          </div>
        </Suspense>
      );
    }
    if (location.pathname === "/signup" || location.pathname === "/signin") {
      return (
        <ErrorBoundary>
          <AuthPortal />
        </ErrorBoundary>
      );
    }
  }

  if (loading) {
    return <MarketingRouteFallback />;
  }

  // Legacy /auth/* aliases — old links and e2e specs; canonical gate is /signin.
  if (location.pathname === "/auth" || location.pathname.startsWith("/auth/")) {
    if (user) {
      return <Navigate to="/ops" replace />;
    }
    const legacySub = location.pathname.slice("/auth".length);
    const authTarget = legacySub === "/signup" ? "/signup" : "/signin";
    return <Navigate to={`${authTarget}${location.search}`} replace />;
  }

  if (!user) {
    const path = location.pathname;
    if (path === "/" || path === "") {
      return (
        <Suspense fallback={<MarketingRouteFallback />}>
          <div className="marketing-surface min-h-dvh">
            <LandingPage />
          </div>
        </Suspense>
      );
    }
    if (path === "/login") {
      return <Navigate to={`/signin${location.search}`} replace />;
    }
    if (path === "/signup" || path === "/signin") {
      return (
        <ErrorBoundary>
          <AuthPortal />
        </ErrorBoundary>
      );
    }
    // /help is an authenticated, in-app surface (HelpCenter). For signed-out
    // visitors, the public help equivalent is /support — send them there
    // instead of bouncing to the sign-in form.
    if (path === "/help") {
      return <Navigate to="/support" replace />;
    }
    const redirect = encodeURIComponent(path + location.search);
    return <Navigate to={`/signin?redirect=${redirect}`} replace />;
  }

  // AppShell already renders the ⌘K CommandBar — don't double-mount.
  return (
    <AgentsProvider>
      <AccountProvider>
        <AppShell />
      </AccountProvider>
    </AgentsProvider>
  );
}

export default function App() {
  return (
    // reducedMotion="user" tells motion to honor the OS-level
    // prefers-reduced-motion media query. Users with vestibular disorders
    // (or anyone who flipped the system toggle) now get static UI instead
    // of decorative glow/scale animations.
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <BrandingProvider>
              <ToastProvider>
                <AppContent />
                <ToastStack />
                <CookieConsent />
              </ToastProvider>
            </BrandingProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </MotionConfig>
  );
}
