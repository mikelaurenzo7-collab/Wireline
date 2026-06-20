import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { AccountProvider } from "./contexts/AccountContext";
import { BrandingProvider } from "./contexts/BrandingContext";
import { ToastProvider } from "./contexts/ToastContext";
import { AgentsProvider } from "./contexts/AgentsContext";
import { ThemeProvider } from "./contexts/ThemeContext";

const PublicMarketingWorkspace = lazy(() => import("./PublicMarketingWorkspace"));
const AppShell = lazy(() => import("./components/layout/AppShell"));
const FigmaAuthPortal = lazy(() => import("./FigmaAuthPortal"));
const OAuthComplete = lazy(() => import("./pages/OAuthComplete"));
const OnboardingSelection = lazy(() => import("./components/onboarding/OnboardingSelection"));

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="studio-route-loading">Loading Wireline…</div>;
  if (!user) return <Navigate to={`/signin?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  return <>{children}</>;
}

const MARKETING_PATHS = ["/", "/features", "/pricing", "/showcase", "/developers", "/compare", "/about", "/blog", "/terms", "/privacy"] as const;

function AppRouter() {
  return (
    <Suspense fallback={null}>
      <Routes>
        {MARKETING_PATHS.map((path) => <Route key={path} path={path} element={<PublicMarketingWorkspace />} />)}
        <Route path="/signin/*" element={<FigmaAuthPortal />} />
        <Route path="/signup/*" element={<FigmaAuthPortal />} />
        <Route path="/get-started" element={<FigmaAuthPortal />} />
        <Route path="/auth" element={<FigmaAuthPortal />} />
        <Route path="/login" element={<Navigate to="/signin" replace />} />
        <Route path="/reset" element={<Navigate to="/signin" replace />} />
        <Route path="/auth/oauth-complete" element={<OAuthComplete />} />
        <Route path="/oauth-complete" element={<OAuthComplete />} />
        <Route path="/onboarding" element={<RequireAuth><OnboardingSelection /></RequireAuth>} />
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
                  <AgentsProvider><AppRouter /></AgentsProvider>
                </AccountProvider>
              </BrandingProvider>
            </ToastProvider>
          </ThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}
