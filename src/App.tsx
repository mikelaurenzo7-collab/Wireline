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
import { MotionConfig } from "motion/react";

const Pricing = lazy(() => import("./pages/Pricing"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const OAuthComplete = lazy(() => import("./pages/OAuthComplete"));

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
  // /reset-password lands here from the password-reset email. Must
  // render BEFORE the auth guard below so a signed-out user can use it.
  if (location.pathname === "/reset-password") {
    return (
      <Suspense fallback={<div className="min-h-screen" />}>
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
      <Suspense fallback={<div className="min-h-screen" />}>
        <OAuthComplete />
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
