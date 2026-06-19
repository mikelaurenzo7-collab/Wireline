/**
 * App.tsx — single root router for Wireline.
 *
 * The 2026 consumer pivot collapses what used to be four parallel
 * surface-switched workspaces (PersonalWorkspace, BusinessWorkspace,
 * AgentStudioWorkspace, FigmaOverhaul) into one shell: the wired
 * `AppShell` + `AppRoutes` tree. The same console scales from a single
 * agent answering the pharmacy to a business front desk — `accountType`
 * filters which sidebar items the user sees, not which app they run.
 *
 * Three top-level surfaces:
 *   1. Public marketing  — `/`, `/features`, `/pricing`, …
 *   2. Auth + onboarding — `/signin`, `/signup`, `/get-started`,
 *                          `/onboarding`, `/oauth-complete`
 *   3. Authenticated app — everything else, mounted via `AppShell`.
 */
import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";

import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { AccountProvider } from "./contexts/AccountContext";
import { BrandingProvider } from "./contexts/BrandingContext";
import { ToastProvider } from "./contexts/ToastContext";
import { AgentsProvider } from "./contexts/AgentsContext";
import { ThemeProvider } from "./contexts/ThemeContext";

import "./studio-hotfix.css";

// Lazy so the marketing visit + auth flow don't pay for the full app shell.
const PublicMarketingWorkspace = lazy(() => import("./PublicMarketingWorkspace"));
const AppShell = lazy(() => import("./components/layout/AppShell"));
const FigmaAuthPortal = lazy(() => import("./FigmaAuthPortal"));
const OAuthComplete = lazy(() => import("./pages/OAuthComplete"));
const OnboardingSelection = lazy(() => import("./components/onboarding/OnboardingSelection"));

/** Auth-gate inline so /onboarding stays a top-level route without dragging
 *  a 1.8 KLOC prototype workspace along just to provide the helper. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background text-foreground">
        <div className="text-sm text-foreground/55">Loading Wireline…</div>
      </div>
    );
  }
  if (!user) {
    return <Navigate to={`/signin?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }
  return <>{children}</>;
}

/** Paths that belong to the marketing surface. Anything else falls through to
 *  the auth shell — which auth-gates per page. */
const MARKETING_PATHS = [
  "/",
  "/features",
  "/pricing",
  "/showcase",
  "/developers",
  "/compare",
  "/about",
  "/blog",
  "/terms",
  "/privacy",
] as const;

function AppRouter() {
  return (
    <Suspense fallback={null}>
      <Routes>
        {/* Marketing surface — public, no shell */}
        {MARKETING_PATHS.map((path) => (
          <Route key={path} path={path} element={<PublicMarketingWorkspace />} />
        ))}

        {/* Auth flows — no shell */}
        <Route path="/signin/*" element={<FigmaAuthPortal />} />
        <Route path="/signup/*" element={<FigmaAuthPortal />} />
        <Route path="/get-started" element={<FigmaAuthPortal />} />
        <Route path="/auth" element={<FigmaAuthPortal />} />
        <Route path="/login" element={<Navigate to="/signin" replace />} />
        <Route path="/reset" element={<Navigate to="/signin" replace />} />
        <Route path="/auth/clerk-complete" element={<Navigate to="/signin" replace />} />
        <Route path="/auth/oauth-complete" element={<OAuthComplete />} />
        <Route path="/oauth-complete" element={<OAuthComplete />} />
        <Route
          path="/onboarding"
          element={
            <RequireAuth>
              <OnboardingSelection />
            </RequireAuth>
          }
        />

        {/* Authenticated app — single shell that hosts every other route via
            AppRoutes. Legacy `/app/personal/*` and `/app/business/*` paths
            are redirected inside AppRoutes for bookmark compatibility. */}
        <Route path="/*" element={<AppShell />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <div className="w-full max-w-[100vw] overflow-x-hidden">
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
