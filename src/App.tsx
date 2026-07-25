import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ToastProvider } from "./contexts/ToastContext";
import { AgentsProvider } from "./contexts/AgentsContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { BrandingProvider } from "./contexts/BrandingContext";
import { AccountProvider } from "./contexts/AccountContext";
import TransitionSurface from "./components/TransitionSurface";
import RouteChangeA11y from "./components/RouteChangeA11y";
import { useAuth } from "./contexts/AuthContext";
import { isWorkspaceRoute } from "./lib/workspace-route-scope";

import ToastStack from "./components/Toast";
// Static import, not lazy: the consent notice is a compliance surface and must
// render reliably on first paint of any route. It was previously never mounted
// anywhere, so the footer "Privacy choices" control dispatched an event with
// no listener and EU/UK visitors never saw a consent choice (leaving optional
// ad measurement permanently dark — the loader correctly defaults it off).
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
const Status = lazy(() => import("./components/Status"));
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
const SolutionsPage = lazy(() => import("./pages/SolutionsPage"));
const VerticalLanding = lazy(() => import("./pages/VerticalLanding"));
const OnboardingFlow = lazy(() => import("./pages/OnboardingFlow"));
const Developers = lazy(() => import("./pages/Developers"));
const PublicChangelog = lazy(() => import("./components/PublicChangelog"));
const PublicNotFound = lazy(() => import("./pages/PublicNotFound"));

function RouteLoading() {
  return (
    <div className="fixed inset-0 z-[9999]">
      <TransitionSurface eyebrow="Wireline" title="Loading" busyLabel="Loading" />
    </div>
  );
}

/**
 * Preserve the authenticated workspace wildcard without turning anonymous
 * typos into a sign-in prompt. Unknown routes probe the session once: signed-in
 * people keep the native workspace 404, while visitors get the public 404.
 */
function UnknownRoute() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();

  if (loading) return <RouteLoading />;
  if (isWorkspaceRoute(pathname)) return <AppShell />;
  return user ? <AppShell /> : <PublicNotFound />;
}

function AppRouter() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/features" element={<Features />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/billing" element={<Navigate to="/settings/billing" replace />} />
        <Route path="/showcase" element={<Showcase />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="/solutions" element={<Navigate to="/solutions/support" replace />} />
        <Route path="/use-cases" element={<Navigate to="/solutions/support" replace />} />
        <Route path="/use-cases/*" element={<Navigate to="/solutions/support" replace />} />
        <Route path="/solutions/:wedge" element={<SolutionsPage />} />
        <Route path="/for/personal" element={<VerticalLanding slug="personal" />} />
        <Route path="/for/home-services" element={<VerticalLanding slug="home-services" />} />
        <Route path="/for/medical" element={<VerticalLanding slug="medical" />} />
        <Route path="/for/legal" element={<VerticalLanding slug="legal" />} />
        <Route path="/for/real-estate" element={<VerticalLanding slug="real-estate" />} />
        <Route path="/for/insurance" element={<VerticalLanding slug="insurance" />} />
        <Route path="/for/restaurants" element={<VerticalLanding slug="restaurants" />} />
        <Route path="/for/sales" element={<VerticalLanding slug="sales" />} />
        <Route path="/for/*" element={<Navigate to="/for/personal" replace />} />
        <Route path="/about" element={<About />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/blog/*" element={<Navigate to="/blog" replace />} />
        <Route path="/changelog" element={<PublicChangelog />} />
        <Route path="/security" element={<Security />} />
        <Route path="/trust" element={<Security />} />
        {/* Vertical trust packs — linked from /security for regulated buyers. */}
        <Route path="/trust/:vertical" element={<TrustPackPage />} />
        <Route path="/status" element={<Status />} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/developers" element={<Developers />} />
        <Route path="/signin/*" element={<AuthPortalRoute />} />
        <Route path="/signup/*" element={<AuthPortalRoute />} />
        <Route path="/get-started" element={<AuthPortalRoute />} />
        <Route path="/auth" element={<AuthPortalRoute />} />
        <Route path="/login" element={<Navigate to="/signin" replace />} />
        <Route path="/reset" element={<Navigate to="/signin" replace />} />
        {/* Password-reset emails land here with ?token=… — must stay public. */}
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/auth/oauth-complete" element={<OAuthComplete />} />
        <Route path="/oauth-complete" element={<OAuthComplete />} />
        <Route path="/onboarding" element={<OnboardingFlow />} />
        <Route path="/404" element={<PublicNotFound />} />
        <Route path="/not-found" element={<PublicNotFound />} />
        {/* All other paths under AppShell (authenticated workspace). Inside AppShell/AppRoutes,
            authenticated visitors retain the workspace 404; anonymous visitors see the public 404. */}
        <Route path="/*" element={<UnknownRoute />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <div className="wl-ui-caps w-full max-w-[100vw] overflow-x-hidden safe-area-insets">
      <BrowserRouter>
        <RouteChangeA11y />
        <AuthProvider>
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
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}
