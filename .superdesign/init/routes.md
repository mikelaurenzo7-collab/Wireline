# Wireline Route Map

## Router architecture

- src/App.tsx is the public and authentication router. Unknown routes hand off to the authenticated shell when a session exists.
- src/routes/AppRoutes.tsx is the authenticated router rendered inside AppShell.
- Public pages share MarketingPageFrame or MarketingChrome. Authenticated pages share AppShell and WorkspacePageFrame.

## Public routes

| URL | Component | Shared layout |
| --- | --- | --- |
| / | src/pages/LandingPage.tsx | MarketingPageFrame |
| /features | src/pages/Features.tsx | MarketingPageFrame |
| /pricing | src/pages/Pricing.tsx | MarketingPageFrame |
| /showcase | src/pages/Showcase.tsx | MarketingPageFrame |
| /compare | src/pages/Compare.tsx | MarketingPageFrame |
| /solutions/:wedge | src/pages/SolutionsPage.tsx | MarketingPageFrame |
| /for/:vertical | src/pages/VerticalLanding.tsx | MarketingPageFrame |
| /about, /blog, /developers | matching src/pages files | MarketingPageFrame |
| /security, /trust, /trust/:vertical | Security or TrustPackPage | MarketingChrome/PageFrame |
| /status, /support, /contact | src/components public pages | MarketingPageFrame |
| /privacy, /terms | legal page components | MarketingPageFrame |
| /signin/*, /signup/*, /get-started, /auth | AuthPortalRoute | precision auth surface |
| /reset-password, /accept-invite, /auth/oauth-complete | matching auth page | focused auth surface |

## Authenticated routes

| URL | Component | Shared layout |
| --- | --- | --- |
| /overview | src/pages/OverviewPage.tsx | AppShell + WorkspacePageFrame |
| /studio/* | src/pages/AgentStudioHome.tsx | AppShell + StudioPageShell |
| /templates | src/pages/TemplatesPage.tsx | AppShell + WorkspacePageFrame |
| /knowledge | src/pages/KnowledgePage.tsx | AppShell + WorkspacePageFrame |
| /connections/* | ConnectionsPage or provider page | AppShell + WorkspacePageFrame |
| /phone | src/pages/PhonePage.tsx | AppShell + WorkspacePageFrame |
| /insights | src/pages/InsightsPage.tsx | AppShell + WorkspacePageFrame |
| /inbox | src/pages/EmailPage.tsx | AppShell + WorkspacePageFrame |
| /approvals | src/pages/ApprovalsPage.tsx | AppShell + WorkspacePageFrame |
| /apps | src/pages/ClientAppsPage.tsx | AppShell + WorkspacePageFrame |
| /settings/* | focused settings pages | AppShell + WorkspacePageFrame |
| /admin/* | src/pages/AdminWorkspace.tsx | AppShell + AdminHubViewport |

## Complete public router source

~~~tsx
import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
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
      <TransitionSurface eyebrow="Wireline" title="Loading" busyLabel="Loading" />
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
~~~

## Complete authenticated router source

~~~tsx
import { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import RouteFallback from "../components/layout/RouteFallback";
import WorkspaceShell from "../components/WorkspaceShell";
import NotFound from "../components/layout/NotFound";

const AgentStudioHome = lazy(() => import("../pages/AgentStudioHome"));
const BrowserHandoffBridge = lazy(() => import("../pages/BrowserHandoffBridge"));
const SettingsPage = lazy(() => import("../pages/SettingsPage"));
const AdminSettings = lazy(() => import("../components/AdminSettings"));
const OverviewPage = lazy(() => import("../pages/OverviewPage"));
const TemplatesPage = lazy(() => import("../pages/TemplatesPage"));
const KnowledgePage = lazy(() => import("../pages/KnowledgePage"));
const ConnectionsPage = lazy(() => import("../pages/ConnectionsPage"));
const SalesforceIntegrationPage = lazy(() => import("../pages/SalesforceIntegrationPage"));
const PhonePage = lazy(() => import("../pages/PhonePage"));
const InsightsPage = lazy(() => import("../pages/InsightsPage"));
const EmailPage = lazy(() => import("../pages/EmailPage"));
const ApprovalsPage = lazy(() => import("../pages/ApprovalsPage"));
const ClientAppsPage = lazy(() => import("../pages/ClientAppsPage"));
const BrowserCommandInstallPage = lazy(() => import("../pages/BrowserCommandInstallPage"));
const BillingSettings = lazy(() => import("../pages/BillingSettings"));
const PhoneSettings = lazy(() => import("../pages/PhoneSettings"));
const TeamSettings = lazy(() => import("../pages/TeamSettings"));
const ComplianceCenterPage = lazy(() => import("../pages/ComplianceCenterPage"));
const CustomizationSettings = lazy(() => import("../pages/CustomizationSettings"));

const loading = <RouteFallback />;

/** Preserve query/hash when legacy /agents deep-links redirect into Studio. */
function AgentsToStudioRedirect() {
  const location = useLocation();
  return <Navigate to={`/studio${location.search}${location.hash}`} replace />;
}

/** Preserve historical email deep-link state while Inbox remains canonical. */
function EmailToInboxRedirect() {
  const location = useLocation();
  return <Navigate to={`/inbox${location.search}${location.hash}`} replace />;
}

function AuthNotFound() {
  return (
    <WorkspaceShell>
      <NotFound />
    </WorkspaceShell>
  );
}

/** Admin panels predate the workspace rail — give them the shared shell so
 *  /admin sits inside the same chrome and rhythm as every other surface. */
function AdminWorkspace() {
  return (
    <WorkspaceShell fullBleed contentClassName="px-4 pt-4 pb-6 sm:px-6 lg:px-8">
      <AdminSettings />
    </WorkspaceShell>
  );
}

export default function AppRoutes() {
  return (
    <Suspense fallback={loading}>
      <Routes>
        <Route path="/" element={<Navigate to="/overview" replace />} />

        <Route path="/overview" element={<OverviewPage />} />
        <Route path="/studio/handoff" element={<BrowserHandoffBridge />} />
        <Route path="/studio" element={<AgentStudioHome />} />
        <Route path="/studio/*" element={<AgentStudioHome />} />
        <Route path="/agents" element={<AgentsToStudioRedirect />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/knowledge" element={<KnowledgePage />} />

        <Route path="/connections" element={<ConnectionsPage />} />
        <Route path="/connections/salesforce" element={<SalesforceIntegrationPage />} />
        <Route path="/connections/*" element={<ConnectionsPage />} />
        <Route path="/call-logs" element={<Navigate to="/phone?tab=logs" replace />} />
        <Route path="/logs" element={<Navigate to="/phone?tab=logs" replace />} />
        <Route path="/phone" element={<PhonePage />} />
        <Route path="/insights" element={<InsightsPage />} />
        <Route path="/inbox" element={<EmailPage />} />
        <Route path="/email" element={<EmailToInboxRedirect />} />
        <Route path="/approvals" element={<ApprovalsPage />} />
        <Route path="/apps" element={<ClientAppsPage />} />
        <Route path="/apps/command" element={<BrowserCommandInstallPage />} />
        <Route path="/settings/apps/command" element={<BrowserCommandInstallPage />} />

        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/billing" element={<BillingSettings />} />
        <Route path="/settings/phone" element={<PhoneSettings />} />
        <Route path="/settings/team" element={<TeamSettings />} />
        <Route path="/settings/customization" element={<CustomizationSettings />} />
        <Route path="/settings/compliance" element={<ComplianceCenterPage />} />
        <Route path="/settings/apps" element={<ClientAppsPage />} />
        <Route path="/settings/*" element={<SettingsPage />} />
        <Route path="/dnc" element={<Navigate to="/settings/compliance" replace />} />
        <Route path="/audit" element={<Navigate to="/admin?tab=activity" replace />} />
        <Route path="/admin" element={<AdminWorkspace />} />
        <Route path="/admin/*" element={<AdminWorkspace />} />

        <Route path="*" element={<AuthNotFound />} />
      </Routes>
    </Suspense>
  );
}
~~~
