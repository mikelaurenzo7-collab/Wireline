import { lazy, Suspense, useLayoutEffect, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { MotionConfig } from "motion/react";
import { AuthProvider } from "./contexts/AuthContext";
import { StudioSessionProvider } from "./contexts/StudioSessionContext";
import { ToastProvider } from "./contexts/ToastContext";
import { AgentsProvider } from "./contexts/AgentsContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { BrandingProvider } from "./contexts/BrandingContext";
import { AccountProvider } from "./contexts/AccountContext";
import RouteChangeA11y from "./components/RouteChangeA11y";
import { useAuth } from "./contexts/AuthContext";
import { isWorkspaceRoute, usesWorkspaceViewport } from "./lib/workspace-route-scope";

import ToastStack from "./components/Toast";
import CookieConsent from "./components/CookieConsent";
import { withVisualQaPage } from "./components/VisualQaMarker";

const LandingPage = lazy(() =>
  import("./pages/LandingPage").then((module) => withVisualQaPage(module, "home")),
);
const Features = lazy(() =>
  import("./pages/Features").then((module) => withVisualQaPage(module, "features")),
);
const Pricing = lazy(() =>
  import("./pages/Pricing").then((module) => withVisualQaPage(module, "pricing")),
);
const Showcase = lazy(() =>
  import("./pages/Showcase").then((module) => withVisualQaPage(module, "showcase")),
);
const Compare = lazy(() =>
  import("./pages/Compare").then((module) => withVisualQaPage(module, "compare")),
);
const About = lazy(() =>
  import("./pages/About").then((module) => withVisualQaPage(module, "about")),
);
const Blog = lazy(() => import("./pages/Blog").then((module) => withVisualQaPage(module, "blog")));
const Security = lazy(() =>
  import("./components/Security").then((module) =>
    withVisualQaPage(module, "trust-center", (location) =>
      location.pathname === "/security" ? "security" : "trust",
    ),
  ),
);
const TrustPackPage = lazy(() =>
  import("./components/TrustPackPage").then((module) =>
    withVisualQaPage(module, "trust-pack", (location) =>
      location.pathname.split("/").filter(Boolean).at(-1),
    ),
  ),
);
const SupportPage = lazy(() =>
  import("./components/SupportPage").then((module) =>
    withVisualQaPage({ default: module.SupportPage }, "support"),
  ),
);
const ContactPage = lazy(() =>
  import("./components/ContactPage").then((module) =>
    withVisualQaPage({ default: module.ContactPage }, "contact"),
  ),
);
const PrivacyPolicy = lazy(() =>
  import("./components/PrivacyPolicyPage").then((module) => withVisualQaPage(module, "privacy")),
);
const TermsOfService = lazy(() =>
  import("./components/LegalPage").then((module) =>
    withVisualQaPage({ default: module.TermsOfService }, "terms"),
  ),
);
const AppShell = lazy(() => import("./components/layout/AppShell"));
const AuthPortalRoute = lazy(() =>
  import("./AuthPortalRoute").then((module) =>
    withVisualQaPage(
      module,
      "auth-portal",
      (location) => location.pathname.split("/").filter(Boolean)[0] || "signin",
    ),
  ),
);
const OAuthComplete = lazy(() => import("./pages/OAuthComplete"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const AcceptInvite = lazy(() => import("./pages/AcceptInvite"));
const VoicePermissionPage = lazy(() => import("./pages/VoicePermissionPage"));
const SmsConsentPage = lazy(() => import("./pages/SmsConsentPage"));
const SolutionsPage = lazy(() =>
  import("./pages/SolutionsPage").then((module) =>
    withVisualQaPage(module, "solutions", (location) =>
      location.pathname.split("/").filter(Boolean).at(-1),
    ),
  ),
);
const VerticalLanding = lazy(() =>
  import("./pages/VerticalLanding").then((module) =>
    withVisualQaPage(module, "vertical", (_location, props) => props.slug),
  ),
);
const OnboardingFlow = lazy(() => import("./pages/OnboardingFlow"));
const Developers = lazy(() =>
  import("./pages/Developers").then((module) => withVisualQaPage(module, "developers")),
);
const PublicChangelog = lazy(() =>
  import("./components/PublicChangelog").then((module) => withVisualQaPage(module, "changelog")),
);
const PublicNotFound = lazy(() =>
  import("./pages/PublicNotFound").then((module) =>
    withVisualQaPage(module, "public-not-found", (location) =>
      location.pathname === "/404" ? "404" : "not-found",
    ),
  ),
);

function RouteLoading() {
  // A route chunk is materializing. Keep this minimal and non-blocking: a
  // full-screen takeover on every lazy navigation reads as a crash, not a
  // transition. A thin brand progress sweep plus a pulsing wordmark lets
  // the shell stay visible while the next page resolves.
  return (
    <div
      className="flex min-h-[100dvh] flex-col"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading page"
    >
      <div className="fixed inset-x-0 top-0 z-[9999] h-[2px] overflow-hidden" aria-hidden="true">
        <div className="route-progress-sweep-bar h-full w-1/3 rounded-full bg-primary" />
      </div>
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="sr-only">Loading</span>
          <span
            className="animate-pulse font-display text-xl font-semibold tracking-tight text-foreground"
            aria-hidden="true"
          >
            BotBound
          </span>
        </div>
      </div>
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
  const location = useLocation();
  const { user } = useAuth();
  return (
    <Suspense fallback={<RouteLoading />}>
      {/* Focus only after the lazy page commits. Workspace has its own boundary. */}
      {!usesWorkspaceViewport(location.pathname, Boolean(user)) && <RouteChangeA11y />}
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
        <Route path="/legal" element={<PreservingRedirect to="/terms" />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/sms-consent" element={<SmsConsentPage />} />
        <Route path="/docs" element={<PreservingRedirect to="/developers" />} />
        <Route path="/developers" element={<Developers />} />
        <Route path="/signin/*" element={<AuthPortalRoute />} />
        <Route path="/signup/*" element={<AuthPortalRoute />} />
        <Route path="/get-started" element={<AuthPortalRoute />} />
        <Route path="/auth" element={<AuthPortalRoute />} />
        <Route path="/login" element={<PreservingRedirect to="/signin" />} />
        <Route path="/reset" element={<PreservingRedirect to="/reset-password" />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/accept-invite" element={<AcceptInvite />} />
        <Route path="/voice-permission" element={<VoicePermissionPage />} />
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
          <StudioSessionProvider>
            <ViewportModeRoot>
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
          </StudioSessionProvider>
        </AuthProvider>
      </BrowserRouter>
    </MotionConfig>
  );
}
