import React, { useState, useEffect, lazy, Suspense } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import WirelineMark from "../WirelineMark";
import ErrorBoundary from "../ErrorBoundary";
import AuroraBackdrop from "./AuroraBackdrop";
import TopBar from "./TopBar";
import RouteAccentStrip from "./RouteAccentStrip";
import TrialBanner from "./TrialBanner";
import AppRoutes from "../../routes/AppRoutes";
import { PAGE_TITLES } from "../../constants/navigation";
import { useBranding } from "../../contexts/BrandingContext";

const CommandBar = lazy(() => import("../CommandBar"));
const PersonaWizard = lazy(() => import("../PersonaWizard"));
const ProductTour = lazy(() => import("../ProductTour"));
const TrialGateModal = lazy(() => import("../TrialGateModal"));
const KeyboardShortcuts = lazy(() => import("../KeyboardShortcuts"));

export default function AppShell() {
  const [showShortcuts, setShowShortcuts] = useState(false);
  const { user, loading } = useAuth();
  const { branding } = useBranding();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;

    let lastKey = "";
    let lastKeyTime = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable)
        return;

      const now = Date.now();
      const key = e.key.toUpperCase();

      if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShowShortcuts((prev) => !prev);
        return;
      }

      if (lastKey === "G" && now - lastKeyTime < 1500) {
        e.preventDefault();
        const routes: Record<string, string> = {
          D: "/",
          L: "/logs",
          T: "/triage",
          I: "/insights",
          A: "/agents",
          R: "/train",
          O: "/outbound",
          S: "/admin",
        };
        if (routes[key]) {
          navigate(routes[key]);
        }
        lastKey = "";
        return;
      }

      lastKey = key;
      lastKeyTime = now;
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [user, navigate]);

  useEffect(() => {
    const label =
      PAGE_TITLES[location.pathname] ??
      (location.pathname.startsWith("/contact/") ? "Contact Profile" : null);
    document.title = label ? `${label} — ${branding.brand_name}` : branding.brand_name;
  }, [location.pathname, branding.brand_name]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-12 text-center relative overflow-hidden">
        <AuroraBackdrop />
        <div className="scanline" />

        <div className="relative w-44 h-44 mb-12 animate-spin-slow">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: "conic-gradient(from 0deg, #4F1E7B, #4F1E7B, #4F1E7B, #10B981, #4F1E7B)",
              filter: "blur(2px)",
            }}
          />
          <div className="absolute inset-2 rounded-full bg-paper" />
          <div className="absolute inset-4 rounded-full glass flex items-center justify-center">
            <div className="animate-pulse">
              <WirelineMark className="w-16 h-16 text-brand" strokeWidth={90} />
            </div>
          </div>
        </div>

        <div className="space-y-4 relative z-10">
          <h1 className="brand-wordmark text-5xl md:text-7xl leading-[0.85]">
            {branding.brand_name.toUpperCase()}
          </h1>
          <p className="text-[10px] uppercase tracking-[0.6em] text-muted">
            Growth Engine Initializing
          </p>
          <div className="flex items-center justify-center gap-1.5 pt-4">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-brand animate-bounce"
                style={{ animationDelay: `${i * 0.2}s` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen text-ink font-sans overflow-hidden relative">
      <AuroraBackdrop />
      <div className="scanline" />

      <ErrorBoundary fallback={null}>
        <Suspense fallback={null}>
          <CommandBar />
          <PersonaWizard />
          <ProductTour />
          {/* Listens for the global trial-gate 402 event from authFetch
              and renders the upgrade tier picker. Mounted once for the
              lifetime of the shell so it works regardless of which page
              fired the 402. */}
          <TrialGateModal />
          {showShortcuts && (
            <KeyboardShortcuts open={showShortcuts} onClose={() => setShowShortcuts(false)} />
          )}
        </Suspense>
      </ErrorBoundary>

      <TopBar onShowShortcuts={() => setShowShortcuts(true)} />

      <main className="flex-1 overflow-hidden relative flex flex-col z-10">
        <RouteAccentStrip />
        <TrialBanner />

        <div className="flex-1 relative flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-hidden relative z-10 min-h-0">
            <div className="max-w-[1920px] mx-auto px-2 md:px-4 lg:px-6 py-1 md:py-2 flex flex-col h-full min-h-0">
              <ErrorBoundary>
                <AppRoutes />
              </ErrorBoundary>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
