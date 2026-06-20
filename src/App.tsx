import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ToastProvider } from "./contexts/ToastContext";
import { AgentsProvider } from "./contexts/AgentsContext";
import { ThemeProvider } from "./contexts/ThemeContext";

const LandingPage = lazy(() => import("./pages/LandingPage"));
const Features = lazy(() => import("./pages/Features"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Showcase = lazy(() => import("./pages/Showcase"));
const Compare = lazy(() => import("./pages/Compare"));
const About = lazy(() => import("./pages/About"));
const Blog = lazy(() => import("./pages/Blog"));
const Security = lazy(() => import("./components/Security"));
const Status = lazy(() => import("./components/Status"));
const SupportPage = lazy(() => import("./components/SupportPage").then((module) => ({ default: module.SupportPage })));
const PrivacyPolicy = lazy(() => import("./components/LegalPage").then((module) => ({ default: module.PrivacyPolicy })));
const TermsOfService = lazy(() => import("./components/LegalPage").then((module) => ({ default: module.TermsOfService })));
const AppShell = lazy(() => import("./components/layout/AppShell"));
const FigmaAuthPortal = lazy(() => import("./FigmaAuthPortal"));
const OAuthComplete = lazy(() => import("./pages/OAuthComplete"));

function AppRouter() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/features" element={<Features />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/showcase" element={<Showcase />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="/about" element={<About />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/security" element={<Security />} />
        <Route path="/status" element={<Status />} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/developers" element={<Navigate to="/features" replace />} />
        <Route path="/training" element={<Navigate to="/agents" replace />} />
        <Route path="/signin/*" element={<FigmaAuthPortal />} />
        <Route path="/signup/*" element={<FigmaAuthPortal />} />
        <Route path="/get-started" element={<FigmaAuthPortal />} />
        <Route path="/auth" element={<FigmaAuthPortal />} />
        <Route path="/login" element={<Navigate to="/signin" replace />} />
        <Route path="/reset" element={<Navigate to="/signin" replace />} />
        <Route path="/auth/oauth-complete" element={<OAuthComplete />} />
        <Route path="/oauth-complete" element={<OAuthComplete />} />
        <Route path="/onboarding" element={<Navigate to="/agents" replace />} />
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
              <AgentsProvider>
                <AppRouter />
              </AgentsProvider>
            </ToastProvider>
          </ThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}
