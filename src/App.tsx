import React, { useState, useEffect, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from "react-router-dom";
import { Users, Activity, MessageSquare, Calendar, PhoneOutgoing, ServerCog, PlugZap, History, Mail, Menu, X, LogOut, Shield, Database, Waves, Inbox, BarChart3, Loader2, AlertTriangle, Radio, Keyboard, ChevronRight, User } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import AuthPortal from "./components/AuthPortal";
import CommandBar from "./components/CommandBar";
import ErrorBoundary from "./components/ErrorBoundary";
import KeyboardShortcuts from "./components/KeyboardShortcuts";
import PersonaWizard from "./components/PersonaWizard";
import ProductTour from "./components/ProductTour";
import SystemStatusBadge from "./components/SystemStatusBadge";
import ToastStack from "./components/Toast";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ToastProvider } from "./contexts/ToastContext";
import { authFetch } from "./lib/api";
import { cn } from "./lib/utils";

// All route surfaces are code-split. Initial bundle holds only the
// app shell + auth + command bar; pages stream in on demand.
const DashboardHome   = lazy(() => import("./components/DashboardHome"));
const TriageInbox     = lazy(() => import("./components/TriageInbox"));
const ContactProfile  = lazy(() => import("./components/ContactProfile"));
const InsightsView    = lazy(() => import("./components/InsightsView"));
const AgentTraining   = lazy(() => import("./components/AgentTraining"));
const AppointmentsView = lazy(() => import("./components/Appointments"));
const FleetSettings   = lazy(() => import("./components/FleetSettings"));
const OutboundDialer  = lazy(() => import("./components/OutboundDialer"));
const AdminSettings   = lazy(() => import("./components/AdminSettings"));
const Integrations    = lazy(() => import("./components/Integrations"));
const CallLogs        = lazy(() => import("./components/CallLogs"));
const EmailInbox      = lazy(() => import("./components/EmailInbox"));
const KnowledgeBaseManager = lazy(() => import("./components/KnowledgeBaseManager"));
const LiveMonitor     = lazy(() => import("./components/LiveMonitor"));
const DncManager      = lazy(() => import("./components/DncManager"));
const AuditLog        = lazy(() => import("./components/AuditLog"));

type NavItem = {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  badge?: number;
  dataTour?: string;
};



function AuroraBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <motion.div
        className="absolute -top-[20%] -left-[10%] w-[85vw] h-[85vw] rounded-full"
        style={{ background: "radial-gradient(circle at center, rgba(10,200,212,0.09), transparent 58%)" }}
        animate={{ x: [0, 50, 0], y: [0, -40, 0] }}
        transition={{ duration: 24, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-[20%] -right-[10%] w-[75vw] h-[75vw] rounded-full"
        style={{ background: "radial-gradient(circle at center, rgba(224,64,192,0.07), transparent 58%)" }}
        animate={{ x: [0, -40, 0], y: [0, 50, 0] }}
        transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-[40%] left-[40%] w-[60vw] h-[60vw] rounded-full"
        style={{ background: "radial-gradient(circle at center, rgba(155,89,245,0.07), transparent 58%)" }}
        animate={{ x: [0, 70, -30, 0], y: [0, -50, 40, 0] }}
        transition={{ duration: 35, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

function Sidebar({ open, setOpen, onShowShortcuts }: { open: boolean; setOpen: (open: boolean) => void; onShowShortcuts: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const isActive = (path: string) => location.pathname === path;

  // Live badge counts — poll a lightweight endpoint every 2 minutes.
  const [navBadges, setNavBadges] = useState<Record<string, number>>({});
  useEffect(() => {
    let cancelled = false;
    const fetchCounts = async () => {
      try {
        const r = await authFetch("/api/nav-counts");
        if (!cancelled && r.ok) {
          const d = await r.json();
          setNavBadges(d as Record<string, number>);
        }
      } catch (e) {
        console.debug("[nav-badges] fetch failed:", e);
      }
    };
    fetchCounts();
    const interval = setInterval(fetchCounts, 120_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const renderNavItem = (item: NavItem) => {
    const active = isActive(item.path);
    const badge = navBadges[item.path] ?? 0;
    return (
      <Link
        key={item.label}
        to={item.path}
        onClick={() => setOpen(false)}
        {...(item.dataTour ? { "data-tour": item.dataTour } : {})}
        className={cn(
          "group relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all overflow-hidden",
          active ? "text-paper" : "text-ink/65 hover:text-ink hover:bg-white/5"
        )}
        aria-label={`Go to ${item.label}`}
      >
        {active && (
          <motion.div
            layoutId="nav-active"
            className="absolute inset-0 rounded-xl nav-active-bg"
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
          />
        )}
        <div className={cn(
          "relative z-10 w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all",
          active ? "bg-white/20" : "bg-white/5 group-hover:bg-white/10"
        )}>
          <item.icon
            className={cn("w-3.5 h-3.5", active ? "text-paper" : "text-ink/60 group-hover:text-ink")}
            strokeWidth={active ? 2.5 : 1.75}
          />
        </div>
        <span className={cn(
          "relative z-10 text-[12px] leading-none tracking-wide truncate flex-1",
          active ? "font-semibold" : "font-normal"
        )}>
          {item.label}
        </span>
        {badge > 0 && (
          <span className={cn(
            "relative z-10 shrink-0 min-w-[18px] h-[18px] px-1.5 rounded-full text-[9px] font-mono leading-none flex items-center justify-center",
            active ? "bg-white/25 text-paper" : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
          )}>
            {badge}
          </span>
        )}
      </Link>
    );
  };

  const NAV_GROUPS = [
    {
      label: "Command Center",
      items: [
        { label: "Dashboard",    path: "/",        icon: Activity,     dataTour: "dashboard" },
        { label: "Live Monitor", path: "/live",     icon: Radio },
        { label: "Triage",       path: "/triage",   icon: Inbox },
        { label: "Insights",     path: "/insights", icon: BarChart3,   dataTour: "insights" },
      ] as NavItem[],
    },
    {
      label: "Agent Fleet",
      items: [
        { label: "Agents",    path: "/agents",  icon: Users,        dataTour: "agents" },
        { label: "Training",  path: "/train",   icon: MessageSquare,dataTour: "training" },
        { label: "Knowledge", path: "/knowledge",icon: Database },
      ] as NavItem[],
    },
    {
      label: "Outreach",
      items: [
        { label: "Call Logs",    path: "/logs",          icon: History },
        { label: "Outbound",     path: "/outbound",      icon: PhoneOutgoing },
        { label: "Email",        path: "/inbox",          icon: Mail },
        { label: "Appointments", path: "/appointments",  icon: Calendar },
      ] as NavItem[],
    },
    {
      label: "System",
      items: [
        { label: "Integrations", path: "/integrations", icon: PlugZap },
        { label: "Settings",     path: "/admin",         icon: ServerCog },
        { label: "DNC List",     path: "/dnc",           icon: Shield },
        { label: "Audit Log",    path: "/audit",         icon: Shield },
      ] as NavItem[],
    },
  ];

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-xl z-[60] lg:hidden"
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      <aside className={cn(
        "fixed inset-y-0 left-0 w-64 xl:w-68 flex flex-col h-full z-[70] transition-transform duration-500 lg:relative lg:translate-x-0 lg:z-20",
        open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        {/* Background */}
        <div className="absolute inset-0 glass-strong" />
        {/* Right edge shimmer */}
        <div className="absolute top-0 right-0 w-px h-full"
          style={{ background: "linear-gradient(to bottom, transparent, rgba(10,200,212,0.22) 30%, rgba(155,89,245,0.18) 70%, transparent)" }}
        />

        <div className="relative z-10 flex flex-col h-full">
          {/* ── Brand header ─────────────────────────────── */}
          <div className="px-4 pt-5 pb-4 border-b border-black/7 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3 group min-w-0" onClick={() => setOpen(false)}>
              <motion.div
                whileHover={{ rotate: 10, scale: 1.08 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                className="relative w-9 h-9 rounded-xl flex items-center justify-center overflow-hidden shrink-0"
                style={{
                  background: "linear-gradient(135deg, #7DF9FF 0%, #C58BFF 50%, #FF6BD9 100%)",
                  boxShadow: "0 6px 20px -8px rgba(125,249,255,0.65), 0 0 0 1px rgba(255,255,255,0.22) inset"
                }}
              >
                <Waves className="w-4.5 h-4.5 text-paper relative z-10" strokeWidth={2.5} />
                <div className="absolute inset-0 bg-gradient-to-tr from-white/30 to-transparent" />
              </motion.div>
              <div className="min-w-0">
                <span className="brand-wordmark text-[18px] leading-none">WIRELINE</span>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"
                    style={{ boxShadow: "0 0 6px rgba(77,255,196,0.8)" }}
                  />
                  <span className="text-[8px] tracking-[0.38em] uppercase text-muted">Online</span>
                </div>
              </div>
            </Link>
            <button
              onClick={() => setOpen(false)}
              className="lg:hidden icon-btn"
              aria-label="Close navigation"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* ── User card ────────────────────────────────── */}
          <div className="px-3 py-3 border-b border-black/7">
            <div className="relative flex items-center gap-3 px-3 py-2.5 rounded-xl glass border border-black/8">
              <div className="relative shrink-0">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white font-medium text-sm"
                  style={{ background: "linear-gradient(135deg, #0AC8D4, #9B59F5)" }}
                >
                  {user?.email?.slice(0, 1).toUpperCase() ?? "?"}
                </div>
                <span
                  className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 bg-emerald-500"
                  style={{ borderColor: "#F5F0E8" }}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium text-ink truncate leading-none mb-0.5">
                  {user?.email?.split("@")[0]}
                </p>
                <p className="text-[8px] tracking-[0.28em] uppercase text-muted truncate">
                  {user?.email?.split("@")[1]}
                </p>
              </div>
              <button
                onClick={() => signOut()}
                title="Sign out"
                className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-ink/40 hover:text-rose-600 hover:bg-rose-500/8 border border-black/7 hover:border-rose-500/35 transition-all"
              >
                <LogOut className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* ── Navigation ───────────────────────────────── */}
          <nav
            className="flex-1 px-2 py-3 overflow-y-auto min-h-0 space-y-5 panel-scroll"
            aria-label="Main navigation"
          >
            {NAV_GROUPS.map(group => (
              <div key={group.label}>
                <div className="px-3 mb-1.5 flex items-center gap-2">
                  <span className="text-[7.5px] font-semibold uppercase tracking-[0.48em] text-muted/55 whitespace-nowrap">
                    {group.label}
                  </span>
                  <span className="h-px flex-1 bg-black/7" />
                </div>
                <div className="space-y-0.5">
                  {group.items.map(renderNavItem)}
                </div>
              </div>
            ))}
          </nav>

          {/* ── Footer ───────────────────────────────────── */}
          <div className="px-3 py-3 border-t border-black/7 space-y-2 shrink-0">
            <SystemStatusBadge />

            {/* Quick links */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => { navigate("/train"); setOpen(false); }}
                className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg glass border border-black/8 hover:border-brand/35 text-[9px] uppercase tracking-[0.24em] text-ink/55 hover:text-ink transition-all"
              >
                <MessageSquare className="w-3 h-3" />
                Train
              </button>
              <button
                onClick={() => { navigate("/live"); setOpen(false); }}
                className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg glass border border-black/8 hover:border-brand-3/35 text-[9px] uppercase tracking-[0.24em] text-ink/55 hover:text-ink transition-all"
              >
                <Radio className="w-3 h-3" />
                Live
              </button>
            </div>

            {/* Command shortcut */}
            <button
              onClick={onShowShortcuts}
              className="hidden lg:flex w-full items-center gap-2 px-3 py-2 rounded-xl glass border border-black/8 hover:border-brand/25 text-muted/65 hover:text-ink/80 transition-all group"
              aria-label="Show keyboard shortcuts"
            >
              <Keyboard className="w-3 h-3 shrink-0" />
              <span className="text-[9px] uppercase tracking-[0.3em] flex-1 text-left">Shortcuts</span>
              <kbd className="text-[8px] glass border border-black/10 px-1.5 py-0.5 rounded font-mono text-muted/70 group-hover:border-brand/25 group-hover:text-brand transition-all">
                ?
              </kbd>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center gap-6 text-center px-6">
      <div className="font-display italic text-aurora text-[8rem] md:text-[12rem] leading-none">404</div>
      <p className="text-[10px] uppercase tracking-[0.6em] text-muted">Page not found</p>
      <p className="text-ink/55 max-w-md text-sm leading-relaxed">
        This page doesn't exist. Use ⌘K to jump anywhere, or head back to the dashboard.
      </p>
      <Link to="/" className="brutal-btn !py-3 !px-6 !text-[11px] !tracking-[0.3em]">
        <Activity className="w-3.5 h-3.5" /> Back to Dashboard <ChevronRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}

function RouteFallback() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full" style={{ background: "conic-gradient(from 0deg, #0AC8D4, #9B59F5, #E040C0, #10B981, #0AC8D4)", filter: "blur(1px)", animation: "spin 4s linear infinite" }} />
        <div className="absolute inset-1 rounded-full bg-paper" />
        <div className="absolute inset-2 rounded-full glass flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-aurora animate-spin" />
        </div>
      </div>
      <p className="text-[10px] uppercase tracking-[0.5em] text-muted">Streaming</p>
    </div>
  );
}

function TrialBanner() {
  const [daysLeft, setDaysLeft] = useState<number | null>(null);

  useEffect(() => {
    authFetch("/api/billing/status")
      .then(r => r.json())
      .then(d => {
        const sub = d.subscription;
        if (sub?.status === "trialing" && sub?.current_period_end) {
          const ms = new Date(sub.current_period_end).getTime() - Date.now();
          setDaysLeft(Math.max(0, Math.ceil(ms / 86_400_000)));
        }
      })
      .catch(() => {});
  }, []);

  if (daysLeft === null) return null;

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      className="bg-amber-500/10 border-b border-amber-500/30 px-6 py-2.5 flex items-center justify-between gap-4 flex-wrap"
    >
      <div className="flex items-center gap-2.5 text-amber-300 text-xs">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span>
          Your free trial ends in <strong>{daysLeft} day{daysLeft !== 1 ? "s" : ""}</strong>.
          Add a payment method before it expires to keep your agents running.
        </span>
      </div>
      <Link
        to="/admin"
        className="shrink-0 px-3 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] uppercase tracking-[0.3em] hover:bg-amber-500/30 transition-all"
      >
        Add Card
      </Link>
    </motion.div>
  );
}

function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, filter: "blur(10px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -12, filter: "blur(10px)" }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      className="h-full"
    >
      {children}
    </motion.div>
  );
}

const PAGE_TITLES: Record<string, string> = {
  "/":             "Dashboard",
  "/triage":        "Triage",
  "/appointments":  "Appointments",
  "/logs":          "Call Logs",
  "/inbox":         "Email",
  "/outbound":      "Outbound",
  "/insights":      "Insights",
  "/live":          "Live Monitor",
  "/train":         "Training",
  "/knowledge":     "Knowledge",
  "/agents":        "Agents",
  "/integrations":  "Integrations",
  "/admin":         "Settings",
};

function AppContent() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const { user, loading } = useAuth();
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

        <motion.div
          animate={{
            rotate: [0, 360],
          }}
          transition={{ repeat: Infinity, duration: 16, ease: "linear" }}
          className="relative w-44 h-44 mb-12"
        >
          <div className="absolute inset-0 rounded-full" style={{
            background: "conic-gradient(from 0deg, #0AC8D4, #9B59F5, #E040C0, #10B981, #0AC8D4)",
            filter: "blur(2px)"
          }} />
          <div className="absolute inset-2 rounded-full bg-paper" />
          <div className="absolute inset-4 rounded-full glass flex items-center justify-center">
            <motion.div
              animate={{ scale: [1, 1.1, 1], opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              <Waves className="w-16 h-16 text-aurora" strokeWidth={1.5} />
            </motion.div>
          </div>
        </motion.div>

        <div className="space-y-4 relative z-10">
          <h1 className="brand-wordmark text-5xl md:text-7xl leading-[0.85]">
            WIRELINE
          </h1>
          <p className="text-[10px] uppercase tracking-[0.6em] text-muted">Initializing</p>
          <div className="flex items-center justify-center gap-1.5 pt-4">
            {[0, 1, 2].map(i => (
              <motion.span
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-brand"
                animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.2, 0.8] }}
                transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.2 }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPortal />;
  }

  return (
    <div className="flex h-screen text-ink font-sans overflow-hidden relative">
      <AuroraBackdrop />
      <div className="scanline" />
      <CommandBar />
      <PersonaWizard />
      <ProductTour />
      <KeyboardShortcuts open={showShortcuts} onClose={() => setShowShortcuts(false)} />
      <Sidebar open={sidebarOpen} setOpen={setSidebarOpen} onShowShortcuts={() => setShowShortcuts(true)} />

      <main className="flex-1 overflow-hidden relative flex flex-col z-10">
         {/* Mobile Header */}
         <div className="lg:hidden p-4 flex items-center justify-between z-30 sticky top-0 glass-strong border-b border-black/8 shrink-0 shadow-sm">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={sidebarOpen}
              className="w-10 h-10 rounded-xl glass border border-black/10 flex items-center justify-center hover:border-brand/40 transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
            >
              <Menu className="w-5 h-5 text-ink" />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shadow-sm" style={{ background: "linear-gradient(135deg, #0AC8D4, #9B59F5, #E040C0)" }}>
                <Waves className="w-4 h-4 text-white" strokeWidth={2.5} />
              </div>
              <span className="brand-wordmark text-xl leading-none">WIRELINE</span>
            </div>
            <button
              onClick={() => navigate('/admin')}
              aria-label="Open settings"
              className="w-10 h-10 rounded-xl glass border border-black/10 flex items-center justify-center hover:border-brand/40 transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
            >
              <User className="w-5 h-5 text-ink/70" />
            </button>
         </div>

         <TrialBanner />

         <div className="flex-1 relative flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 overflow-hidden relative z-10 min-h-0">
              <div className="h-full max-w-[1920px] mx-auto px-4 md:px-6 lg:px-8 xl:px-10 py-4 md:py-5 lg:py-6 flex flex-col">
                <AnimatePresence mode="wait">
                  <Suspense fallback={<RouteFallback />}>
                    <Routes>
                      <Route path="/" element={<PageTransition><ErrorBoundary><DashboardHome /></ErrorBoundary></PageTransition>} />
                      <Route path="/live" element={<PageTransition><ErrorBoundary><LiveMonitor /></ErrorBoundary></PageTransition>} />
                      <Route path="/triage" element={<PageTransition><ErrorBoundary><TriageInbox /></ErrorBoundary></PageTransition>} />
                      <Route path="/insights" element={<PageTransition><ErrorBoundary><InsightsView /></ErrorBoundary></PageTransition>} />
                      <Route path="/contact/:number" element={<PageTransition><ErrorBoundary><ContactProfile /></ErrorBoundary></PageTransition>} />
                      <Route path="/logs" element={<PageTransition><ErrorBoundary><CallLogs /></ErrorBoundary></PageTransition>} />
                      <Route path="/inbox" element={<PageTransition><ErrorBoundary><EmailInbox /></ErrorBoundary></PageTransition>} />
                      <Route path="/outbound" element={<PageTransition><ErrorBoundary><OutboundDialer /></ErrorBoundary></PageTransition>} />
                      <Route path="/appointments" element={<PageTransition><ErrorBoundary><AppointmentsView /></ErrorBoundary></PageTransition>} />
                      <Route path="/train" element={<PageTransition><ErrorBoundary><AgentTraining /></ErrorBoundary></PageTransition>} />
                      <Route path="/knowledge" element={<PageTransition><ErrorBoundary><KnowledgeBaseManager /></ErrorBoundary></PageTransition>} />
                      <Route path="/agents" element={<PageTransition><ErrorBoundary><FleetSettings /></ErrorBoundary></PageTransition>} />
                      <Route path="/integrations" element={<PageTransition><ErrorBoundary><Integrations /></ErrorBoundary></PageTransition>} />
                      <Route path="/admin" element={<PageTransition><ErrorBoundary><AdminSettings /></ErrorBoundary></PageTransition>} />
                      <Route path="/dnc" element={<PageTransition><ErrorBoundary><DncManager /></ErrorBoundary></PageTransition>} />
                      <Route path="/audit" element={<PageTransition><ErrorBoundary><AuditLog /></ErrorBoundary></PageTransition>} />
                      <Route path="*" element={<PageTransition><NotFound /></PageTransition>} />
                    </Routes>
                  </Suspense>
                </AnimatePresence>
              </div>
            </div>
         </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppContent />
          <ToastStack />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
