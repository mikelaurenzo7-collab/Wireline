import React, { useEffect } from "react";
import { BrowserRouter, useLocation, useNavigate } from "react-router-dom";
import AuthPortal from "./components/AuthPortal";
import { PrivacyPolicy, TermsOfService } from "./components/LegalPage";
import CookieConsent from "./components/CookieConsent";
import ToastStack from "./components/Toast";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ToastProvider } from "./contexts/ToastContext";
import AppShell from "./components/layout/AppShell";
import CommandPalette from "./components/CommandPalette";
import { BrandingProvider } from "./contexts/BrandingContext";

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

  // Legal pages are public — accessible before auth.
  if (location.pathname === "/privacy") return <PrivacyPolicy />;
  if (location.pathname === "/terms") return <TermsOfService />;

  if (!user) {
    return <AuthPortal />;
  }

  return (
    <>
      <AppShell />
      <CommandPalette />
    </>
  );
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
