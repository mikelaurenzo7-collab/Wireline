import React, { useEffect, lazy, Suspense } from "react";
import { BrowserRouter, useLocation, useNavigate } from "react-router-dom";
import AuthPortal from "./components/AuthPortal";
import { PrivacyPolicy, TermsOfService } from "./components/LegalPage";
import CookieConsent from "./components/CookieConsent";
import ToastStack from "./components/Toast";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ToastProvider } from "./contexts/ToastContext";
import AppShell from "./components/layout/AppShell";
import NotFound from "./components/layout/NotFound";
import { BrandingProvider } from "./contexts/BrandingContext";

const Pricing = lazy(() => import("./pages/Pricing"));

function AppContent() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Redirect authenticated users away from auth-only pages to dashboard
  useEffect(() => {
    if (user && (location.pathname === "/login" || location.pathname === "/signup")) {
      navigate("/", { replace: true });
    }
  }, [user, location.pathname, navigate]);

  // Public pages — accessible before auth.
  if (location.pathname === "/privacy") return <PrivacyPolicy />;
  if (location.pathname === "/terms") return <TermsOfService />;
  if (location.pathname === "/pricing") {
    return (
      <Suspense fallback={<div className="min-h-screen" />}>
        <Pricing />
      </Suspense>
    );
  }
  // Explicit public 404 route — used by marketing emails, error redirects, etc.
  // Renders the friendly NotFound with public CTAs (demo line, pricing, home)
  // instead of bouncing into the sign-in form.
  if (location.pathname === "/not-found" || location.pathname === "/404") {
    return (
      <div className="min-h-screen relative bg-paper">
        <NotFound mode="public" />
      </div>
    );
  }

  if (!user) {
    return <AuthPortal />;
  }

  // AppShell already renders the ⌘K CommandBar — don't double-mount.
  return <AppShell />;
}

export default function App() {
  return (
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
  );
}
