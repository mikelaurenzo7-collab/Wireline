import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ToastProvider } from "./contexts/ToastContext";
import { AgentsProvider } from "./contexts/AgentsContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { BrandingProvider } from "./contexts/BrandingContext";
import { AccountProvider } from "./contexts/AccountContext";

const LandingPage = lazy(() => import("./pages/LandingPage"));
const Features = lazy(() => import("./pages/Features"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Showcase = lazy(() => import("./pages/Showcase"));
const Compare = lazy(() => import("./pages/Compare"));
const About = lazy(() => import("./pages/About"));
const Blog = lazy(() => import("./pages/Blog"));
const Security = lazy(() => import("./components/Security"));
const Status = lazy(() => import("./components/Status"));
const SupportPage = lazy(() =>
  import("./components/SupportPage").then((module) => ({ default: module.SupportPage })),
);
const ContactPage = lazy(() =>
  import("./components/ContactPage").then((module) => ({ default: module.ContactPage })),
);
const PrivacyPolicy = lazy(() =>
  import("./components/LegalPage").then((module) => ({ default: module.PrivacyPolicy })),
);
const TermsOfService = lazy(() =>
  import("./components/LegalPage").then((module) => ({ default: module.TermsOfService })),
);
const AppShell = lazy(() => import("./components/layout/AppShell"));
const AuthPortalRoute = lazy(() => import("./AuthPortalRoute"));
const OAuthComplete = lazy(() => import("./pages/OAuthComplete"));
const SolutionsPage = lazy(() => import("./pages/SolutionsPage"));
const VerticalLanding = lazy(() => import("./pages/VerticalLanding"));
const OnboardingFlow = lazy(() => import("./pages/OnboardingFlow"));

function RouteLoading() {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[var(--wireline-color-canvas-default)]">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-[var(--wireline-color-border-default)] border-t-[var(--wireline-color-action-primary-default)]" />
        <span
          className="font-medium font-sans tracking-wide"
          style={{
            fontSize: "var(--wireline-typography-caption-size)",
            color: "var(--wireline-color-text-secondary)",
          }}
        >
          Loading Wireline...
        </span>
      </div>
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
        <Route path="/showcase" element={<Showcase />} />
        <Route path="/compare" element={<Compare />} />
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
        <Route path="/security" element={<Security />} />
        <Route path="/status" element={<Status />} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/developers" element={<Navigate to="/features" replace />} />
        <Route path="/signin/*" element={<AuthPortalRoute />} />
        <Route path="/signup/*" element={<AuthPortalRoute />} />
        <Route path="/get-started" element={<AuthPortalRoute />} />
        <Route path="/auth" element={<AuthPortalRoute />} />
        <Route path="/login" element={<Navigate to="/signin" replace />} />
        <Route path="/reset" element={<Navigate to="/signin" replace />} />
        <Route path="/auth/oauth-complete" element={<OAuthComplete />} />
        <Route path="/oauth-complete" element={<OAuthComplete />} />
        <Route path="/onboarding" element={<OnboardingFlow />} />
        {/* All other paths under AppShell (authenticated workspace). Inside AppShell/AppRoutes,
            unauthenticated -> signin with redirect; authenticated default to /overview (Home). */}
        <Route path="/*" element={<AppShell />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <div className="wl-ui-caps w-full max-w-[100vw] overflow-x-hidden">
      <BrowserRouter>
        <AuthProvider>
          <ThemeProvider>
            <ToastProvider>
              <BrandingProvider>
                <AccountProvider>
                  <AgentsProvider>
                    <AppRouter />
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
