import React, { useState, useEffect, lazy, Suspense } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, User, Waves } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import ErrorBoundary from "../ErrorBoundary";
import AuroraBackdrop from "./AuroraBackdrop";
import FloatingRail from "./FloatingRail";
import RouteAccentStrip from "./RouteAccentStrip";
import TrialBanner from "./TrialBanner";
import AppRoutes from "../../routes/AppRoutes";
import { PAGE_TITLES } from "../../constants/navigation";

const CommandBar         = lazy(() => import("../CommandBar"));
const PersonaWizard      = lazy(() => import("../PersonaWizard"));
const ProductTour        = lazy(() => import("../ProductTour"));
const KeyboardShortcuts  = lazy(() => import("../KeyboardShortcuts"));

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const { user, loading, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;

    let lastKey = '';
    let lastKeyTime = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return;

      const now = Date.now();
      const key = e.key.toUpperCase();

      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShowShortcuts(prev => !prev);
        return;
      }

      if (lastKey === 'G' && now - lastKeyTime < 1500) {
        e.preventDefault();
        const routes: Record<string, string> = {
          D: '/',
          L: '/logs',
          T: '/triage',
          I: '/insights',
          A: '/agents',
          R: '/train',
          O: '/outbound',
          S: '/admin',
        };
        if (routes[key]) {
          navigate(routes[key]);
        }
        lastKey = '';
        return;
      }

      lastKey = key;
      lastKeyTime = now;
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [user, navigate]);

  useEffect(() => {
    const label =
      PAGE_TITLES[location.pathname] ??
      (location.pathname.startsWith("/contact/") ? "Contact Profile" : null);
    document.title = label ? `${label} — Wireline` : "Wireline";
  }, [location.pathname]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-12 text-center relative overflow-hidden">
        <AuroraBackdrop />
        <div className="scanline" />

        <div className="relative w-44 h-44 mb-12 animate-spin-slow">
          <div className="absolute inset-0 rounded-full" style={{
            background: "conic-gradient(from 0deg, #0AC8D4, #9B59F5, #E040C0, #10B981, #0AC8D4)",
            filter: "blur(2px)"
          }} />
          <div className="absolute inset-2 rounded-full bg-paper" />
          <div className="absolute inset-4 rounded-full glass flex items-center justify-center">
            <div className="animate-pulse">
              <Waves className="w-16 h-16 text-aurora" strokeWidth={1.5} />
            </div>
          </div>
        </div>

        <div className="space-y-4 relative z-10">
          <h1 className="brand-wordmark text-5xl md:text-7xl leading-[0.85]">
            WIRELINE
          </h1>
          <p className="text-[10px] uppercase tracking-[0.6em] text-muted">Initializing</p>
          <div className="flex items-center justify-center gap-1.5 pt-4">
            {[0, 1, 2].map(i => (
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
    <div className="flex h-screen text-ink font-sans overflow-hidden relative">
      <AuroraBackdrop />
      <div className="scanline" />
      
      <ErrorBoundary fallback={null}>
        <Suspense fallback={null}>
          <CommandBar />
          <PersonaWizard />
          <ProductTour />
          {showShortcuts && (
            <KeyboardShortcuts open={showShortcuts} onClose={() => setShowShortcuts(false)} />
          )}
        </Suspense>
      </ErrorBoundary>
      
      <FloatingRail open={sidebarOpen} setOpen={setSidebarOpen} onShowShortcuts={() => setShowShortcuts(true)} />

      <main className="flex-1 overflow-hidden relative flex flex-col z-10">
         <div
           className="lg:hidden sticky top-0 z-30 px-3 pt-3 pb-2 shrink-0"
           style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top, 0))" }}
         >
           <div className="flex items-center justify-between gap-2 px-2 py-2 rounded-2xl glass-strong border border-black/8 shadow-md"
             style={{ boxShadow: "0 1px 0 rgba(255,255,255,0.80) inset, 0 8px 24px -10px rgba(0,0,0,0.20), 0 3px 12px -4px rgba(10,200,212,0.08)" }}
           >
             <button
               onClick={() => setSidebarOpen(true)}
               className="w-11 h-11 rounded-xl flex items-center justify-center hover:bg-white/5 active:scale-95 transition-all"
             >
               <Menu className="w-5 h-5 text-ink" />
             </button>
             <Link to="/" className="flex items-center gap-2.5 min-w-0">
               <div className="w-8 h-8 rounded-xl flex items-center justify-center shadow-sm shrink-0" style={{ background: "linear-gradient(135deg, #0AC8D4, #9B59F5, #E040C0)" }}>
                 <Waves className="w-4 h-4 text-white" strokeWidth={2.5} />
               </div>
               <span className="brand-wordmark text-lg leading-none truncate">WIRELINE</span>
             </Link>
             <button
               onClick={() => navigate('/admin')}
               className="w-11 h-11 rounded-xl flex items-center justify-center hover:bg-white/5 active:scale-95 transition-all"
             >
               <User className="w-5 h-5 text-ink/70" />
             </button>
           </div>
         </div>

         <RouteAccentStrip />
         <TrialBanner />

         <div className="flex-1 relative flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 overflow-hidden relative z-10 min-h-0">
              <div className="h-full max-w-[1920px] mx-auto px-4 md:px-6 lg:px-8 xl:px-10 py-4 md:py-5 lg:py-6 flex flex-col">
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
