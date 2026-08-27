import { lazy, Suspense, useLayoutEffect, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { MotionConfig } from "motion/react";
import { AuthProvider } from "./contexts/AuthContext";
import { ToastProvider } from "./contexts/ToastContext";
import { AgentsProvider } from "./contexts/AgentsContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { BrandingProvider } from "./contexts/BrandingContext";
import { AccountProvider } from "./contexts/AccountContext";
import TransitionSurface from "./components/TransitionSurface";
import RouteChangeA11y from "./components/RouteChangeA11y";
import { useAuth } from "./contexts/AuthContext";
import { isWorkspaceRoute, usesWorkspaceViewport } from "./lib/workspace-route-scope";

import ToastStack from "./components/Toast";
import CookieConsent from "./components/CookieConsent";

const LandingPage = lazy(() => import("./pages/LandingPage"));
const Features = lazy(() => import("./pages/Features"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Showcase = lazy(() => import("./pages/Showcase"));
const Compare = lazy(() => import("./pages/Compare"));
const About = lazy(() => import("./pages/About"));
const Blog = lazy(() => import("./pages/Blog"));
const Security = lazy(() => import("./components/Security"));
const TrustPackPage = lazy(() => import("./components/TrustPackPage"));
const SupportPage = lazy(() =>
  import("./components/SupportPage").then((module) => ({ default: module.SupportPage })),
);
const ContactPage = lazy(() =>
  import("./components/ContactPage").then((module) => ({ default: module.ContactPage })),
);
const PrivacyPolicy = lazy(() => import("./components/PrivacyPolicyPage"));
const TermsOfService = lazy(() =>
  import("./components/LegalPage").then((module) => ({ default: module.TermsOfService })),
);
const AppShell = lazy(() => import("./components/layout/AppShell"));
const AuthPortalRoute = lazy(() => import("./AuthPortalRoute"));
const OAuthComplete = lazy(() => import("./pages/OAuthComplete"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const AcceptInvite = lazy(() => import("./pages/AcceptInvite"));
const SolutionsPage = lazy(() => import("./pages/SolutionsPage"));
const VerticalLanding = lazy(() => import("./pages/VerticalLanding"));
const OnboardingFlow = lazy(() => import("./pages/OnboardingFlow"));
const Developers = lazy(() => import("./pages/Developers"));
const PublicChangelog = lazy(() => import("./components/PublicChangelog"));
const PublicNotFound = lazy(() => import("./pages/PublicNotFound"));

function RouteLoading() {
  return (
    <div className="fixed inset-0 z-[9999]">
      <TransitionSurface eyebrow="BotBound" title="Loading" busyLabel="Loading" />
    </div>
  );
}

function UnknownRoute() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();

  if (loading) return <RouteLoading />;
  if (isWorkspaceRoute(pathname)) return <AppShell />;
  return user ? <AppShell /> : <PublicNotFound />;
}

function PreservingRedirect({ to }: { to: string }) {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}${location.hash}`} replace />;
}

function ViewportModeRoot({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const mode = usesWorkspaceViewport(pathname, Boolean(user)) ? "workspace" : "document";

  useLayoutEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.dataset.wirelineViewport = mode;
    body.dataset.wirelineViewport = mode;

    return () => {
      if (html.dataset.wirelineViewport === mode) delete html.dataset.wirelineViewport;
      if (body.dataset.wirelineViewport === mode) delete body.dataset.wirelineViewport;
    };
  }, [mode]);

  return (
    <div className={`wl-ui-caps wl-ui-caps--${mode} w-full max-w-[100vw] overflow-x-hidden`}>
      {children}
    </div>
  );
}

function AppRouter() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/features" element={<Features />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/billing" element={<PreservingRedirect to="/settings/billing" />} />
        <Route path="/showcase" element={<Showcase />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="/solutions" element={<PreservingRedirect to="/solutions/support" />} />
        <Route path="/use-cases" element={<PreservingRedirect to="/solutions/support" />} />
        <Route path="/use-cases/*" element={<PreservingRedirect to="/solutions/support" />} />
        <Route path="/solutions/:wedge" element={<SolutionsPage />} />
        <Route
          path="/for/everyday"
          element={<VerticalLanding slug="personal" canonicalPath="/for/everyday" />}
        />
        <Route path="/for/personal" element={<PreservingRedirect to="/for/everyday" />} />
        <Route path="/for/home-services" element={<VerticalLanding slug="home-services" />} />
        <Route path="/for/medical" element={<VerticalLanding slug="medical" />} />
        <Route path="/for/legal" element={<VerticalLanding slug="legal" />} />
        <Route path="/for/real-estate" element={<VerticalLanding slug="real-estate" />} />
        <Route path="/for/insurance" element={<VerticalLanding slug="insurance" />} />
        <Route path="/for/restaurants" element={<VerticalLanding slug="restaurants" />} />
        <Route path="/for/sales" element={<VerticalLanding slug="sales" />} />
        <Route path="/for/*" element={<PreservingRedirect to="/for/everyday" />} />
        <Route path="/about" element={<About />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/blog/*" element={<PreservingRedirect to="/blog" />} />
        <Route path="/changelog" element={<PublicChangelog />} />
        <Route path="/security" element={<Security />} />
        <Route path="/trust" element={<Security />} />
        <Route path="/trust/:vertical" element={<TrustPackPage />} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/developers" element={<Developers />} />
        <Route path="/signin/*" element={<AuthPortalRoute />} />
        <Route path="/signup/*" element={<AuthPortalRoute />} />
        <Route path="/get-started" element={<AuthPortalRoute />} />
        <Route path="/auth" element={<AuthPortalRoute />} />
        <Route path="/login" element={<PreservingRedirect to="/signin" />} />
        <Route path="/reset" element={<PreservingRedirect to="/signin" />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/accept-invite" element={<AcceptInvite />} />
        <Route path="/auth/oauth-complete" element={<OAuthComplete />} />
        <Route path="/oauth-complete" element={<OAuthComplete />} />
        <Route path="/onboarding" element={<OnboardingFlow />} />
        <Route path="/404" element={<PublicNotFound />} />
        <Route path="/not-found" element={<PublicNotFound />} />
        <Route path="/*" element={<UnknownRoute />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <AuthProvider>
          <ViewportModeRoot>
            <RouteChangeA11y />
            <ThemeProvider>
              <ToastProvider>
                <BrandingProvider>
                  <AccountProvider>
                    <AgentsProvider>
                      <AppRouter />
                      <ToastStack />
                      <CookieConsent />
                    </AgentsProvider>
                  </AccountProvider>
                </BrandingProvider>
              </ToastProvider>
            </ThemeProvider>
          </ViewportModeRoot>
        </AuthProvider>
      </BrowserRouter>
    </MotionConfig>
  );
}
