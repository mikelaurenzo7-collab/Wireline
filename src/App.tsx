import React, { useState, useEffect, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from "react-router-dom";
import { Phone, Users, Settings, Activity, MessageSquare, Calendar, PhoneOutgoing, ServerCog, PlugZap, History, Mail, Menu, X, LogOut, User, Terminal, ChevronRight, Zap, Target, Shield, Signal, Globe, Box, LayoutPanelLeft, Database, Command, Sparkles, Waves, Inbox, BarChart3, Loader2, AlertTriangle, PhoneCall, Radio } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import AuthPortal from "./components/AuthPortal";
import CommandBar from "./components/CommandBar";
import ErrorBoundary from "./components/ErrorBoundary";
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

type NavItem = {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  badge?: number;
};

type NavGroup = { group: string; items: NavItem[] };

const NAV_ITEMS: NavGroup[] = [
  { group: "Control Center", items: [
    { label: "Command Atlas", path: "/", icon: Activity },
    { label: "Live Monitor",  path: "/live", icon: Radio },
    { label: "Triage Inbox", path: "/triage", icon: Inbox },
    { label: "Insights", path: "/insights", icon: BarChart3 },
  ]},
  { group: "Communications", items: [
    { label: "Voice Archive", path: "/logs", icon: History },
    { label: "Inbound Email", path: "/inbox", icon: Mail },
    { label: "Outbound Dialer", path: "/outbound", icon: PhoneOutgoing },
    { label: "Constellation", path: "/appointments", icon: Calendar },
  ]},
  { group: "Intelligence Layer", items: [
    { label: "Neural Atelier", path: "/train", icon: MessageSquare },
    { label: "Knowledge Atlas", path: "/knowledge", icon: Database },
    { label: "Agent Topology", path: "/agents", icon: Users },
  ]},
  { group: "Infrastructure", items: [
    { label: "Carrier Bridge", path: "/integrations", icon: PlugZap },
    { label: "Core Settings", path: "/admin", icon: ServerCog },
  ]}
];

function AuroraBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <motion.div
        className="absolute -top-[20%] -left-[10%] w-[85vw] h-[85vw] rounded-full"
        style={{ background: "radial-gradient(circle at center, rgba(125,249,255,0.24), transparent 58%)" }}
        animate={{ x: [0, 50, 0], y: [0, -40, 0] }}
        transition={{ duration: 24, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-[20%] -right-[10%] w-[75vw] h-[75vw] rounded-full"
        style={{ background: "radial-gradient(circle at center, rgba(255,107,217,0.20), transparent 58%)" }}
        animate={{ x: [0, -40, 0], y: [0, 50, 0] }}
        transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-[40%] left-[40%] w-[60vw] h-[60vw] rounded-full"
        style={{ background: "radial-gradient(circle at center, rgba(197,139,255,0.20), transparent 58%)" }}
        animate={{ x: [0, 70, -30, 0], y: [0, -50, 40, 0] }}
        transition={{ duration: 35, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

function Sidebar({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
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
        // Badges are non-critical; log at debug level so it's visible in devtools.
        console.debug("[nav-badges] fetch failed:", e);
      }
    };
    fetchCounts();
    const interval = setInterval(fetchCounts, 120_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

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
        "fixed inset-y-0 left-0 w-72 flex flex-col h-full z-[70] transition-transform duration-700 lg:relative lg:translate-x-0 lg:z-20 lg:w-64 xl:w-72",
        open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="absolute inset-0 glass-strong border-r border-white/8" />
        <div className="absolute top-0 right-0 w-px h-full bg-gradient-to-b from-transparent via-cyan-300/40 to-transparent" />

        <div className="relative z-10 flex flex-col h-full">
          {/* Header */}
          <div className="px-5 pt-6 pb-4 border-b border-white/8 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3 group min-w-0" onClick={() => setOpen(false)}>
              <motion.div
                whileHover={{ rotate: 12, scale: 1.06 }}
                className="relative w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden shrink-0"
                style={{
                  background: "linear-gradient(135deg, #7DF9FF 0%, #C58BFF 50%, #FF6BD9 100%)",
                  boxShadow: "0 8px 24px -10px rgba(125,249,255,0.65), 0 0 0 1px rgba(255,255,255,0.25) inset"
                }}
              >
                <Waves className="w-5 h-5 text-paper relative z-10" strokeWidth={2.5} />
                <div className="absolute inset-0 bg-gradient-to-tr from-white/35 to-transparent" />
              </motion.div>
              <div className="flex flex-col min-w-0">
                <span className="font-display italic lowercase text-xl text-ink leading-none tracking-tight truncate">wireline</span>
                <span className="text-[8px] tracking-[0.42em] uppercase text-muted mt-1 flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-brand indicator-glow" />
                  Aurora Relay
                </span>
              </div>
            </Link>
            <button onClick={() => setOpen(false)} className="lg:hidden w-9 h-9 rounded-full flex items-center justify-center text-ink/60 hover:text-ink hover:bg-white/8 transition-all shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* User Card */}
          <div className="mx-3 mt-4 relative aurora-ring rounded-xl">
            <div className="relative p-3.5 rounded-xl glass overflow-hidden">
              <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-35 blur-3xl" style={{ background: "radial-gradient(circle, #7DF9FF, transparent)" }} />
              <div className="relative z-10 flex items-center gap-3">
                <div className="relative shrink-0">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-paper" style={{ background: "linear-gradient(135deg, #7DF9FF, #C58BFF)" }}>
                    <User className="w-4 h-4" strokeWidth={2.5} />
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0F0E2D] bg-emerald-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-ink truncate">{user?.email?.split('@')[0]}</p>
                  <p className="text-[8px] tracking-[0.28em] uppercase text-muted">Signal Active</p>
                </div>
                <button
                  onClick={() => signOut()}
                  title="End session"
                  className="shrink-0 w-8 h-8 rounded-lg text-ink/60 hover:text-rose-500 hover:bg-rose-500/10 border border-white/8 hover:border-rose-500/40 transition-all flex items-center justify-center"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-2 mt-4 overflow-y-auto pb-3 scrollbar-hide space-y-4 min-h-0">
            {NAV_ITEMS.map((group) => (
              <div key={group.group}>
                <h3 className="px-3 text-[8px] font-semibold uppercase tracking-[0.42em] text-muted/80 mb-2 flex items-center gap-2">
                  <span className="h-px flex-1 bg-gradient-to-r from-white/0 via-white/20 to-white/0" />
                  {group.group}
                  <span className="h-px flex-1 bg-gradient-to-r from-white/0 via-white/20 to-white/0" />
                </h3>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = isActive(item.path);
                    return (
                      <Link
                        key={item.label}
                        to={item.path}
                        onClick={() => setOpen(false)}
                        className={cn(
                          "group relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all overflow-hidden",
                          active
                            ? "text-paper"
                            : "text-ink/70 hover:text-ink hover:bg-white/5"
                        )}
                      >
                        {active && (
                          <motion.div
                            layoutId="nav-active"
                            className="absolute inset-0 rounded-lg"
                            style={{
                              background: "linear-gradient(135deg, #7DF9FF 0%, #C58BFF 60%, #FF6BD9 100%)",
                              boxShadow: "0 6px 20px -10px rgba(125,249,255,0.55), 0 0 0 1px rgba(255,255,255,0.20) inset"
                            }}
                            transition={{ type: "spring", stiffness: 400, damping: 35 }}
                          />
                        )}
                        <item.icon className={cn("w-4 h-4 relative z-10 transition-transform shrink-0", active ? "" : "group-hover:translate-x-0.5")} strokeWidth={active ? 2.5 : 1.75} />
                        <span className={cn("text-[12px] lowercase tracking-wide relative z-10 truncate flex-1", active ? "font-medium" : "font-normal")}>
                          {item.label}
                        </span>
                        {(navBadges[item.path] ?? 0) > 0 && (
                          <span className={cn(
                            "relative z-10 shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-mono leading-none",
                            active ? "bg-white/20 text-paper" : "bg-brand/15 text-brand"
                          )}>
                            {navBadges[item.path]}
                          </span>
                        )}
                        {active && <ChevronRight className="ml-auto w-3.5 h-3.5 relative z-10 shrink-0" />}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Footer */}
          <div className="px-3 py-3 border-t border-white/8 relative space-y-2.5 shrink-0">
            <SystemStatusBadge />
            
            {/* Quick Actions */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => navigate('/train')}
                title="Quick Train"
                className="flex-1 px-3 py-2 rounded-lg glass border border-white/8 hover:border-brand/40 text-[10px] uppercase tracking-[0.28em] text-ink/70 hover:text-ink transition-all flex items-center justify-center gap-1.5"
              >
                <MessageSquare className="w-3 h-3" />
                <span>Train</span>
              </button>
              <button
                onClick={() => navigate('/')}
                title="Test Call"
                className="flex-1 px-3 py-2 rounded-lg glass border border-white/8 hover:border-brand/40 text-[10px] uppercase tracking-[0.28em] text-ink/70 hover:text-ink transition-all flex items-center justify-center gap-1.5"
              >
                <PhoneCall className="w-3 h-3" />
                <span>Test</span>
              </button>
            </div>
            
            <div className="flex items-center justify-between text-[8px] uppercase tracking-[0.38em] text-muted/70">
              <span className="font-display italic lowercase text-[11px] tracking-tight text-ink/70">v∞ · aurora</span>
              <span className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-emerald-500 indicator-glow" />
                Stable
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[8px] uppercase tracking-[0.32em] text-muted/60">
              <Terminal className="w-2.5 h-2.5" />
              <span>⌘K  Command</span>
            </div>
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
      <p className="text-[10px] uppercase tracking-[0.6em] text-muted">No signal at this coordinate</p>
      <p className="text-ink/55 max-w-md text-sm leading-relaxed">
        The page you're after doesn't exist on the relay. Use ⌘K to jump anywhere, or head back to the Atlas.
      </p>
      <Link to="/" className="brutal-btn !py-3 !px-6 !text-[11px] !tracking-[0.3em]">
        <Activity className="w-3.5 h-3.5" /> Back to Atlas <ChevronRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}

function RouteFallback() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full" style={{ background: "conic-gradient(from 0deg, #7DF9FF, #C58BFF, #FF6BD9, #4DFFC4, #7DF9FF)", filter: "blur(1px)", animation: "spin 4s linear infinite" }} />
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
  "/":             "Command Atlas",
  "/triage":        "Triage Inbox",
  "/appointments":  "Constellation",
  "/logs":          "Voice Archive",
  "/inbox":         "Inbound Email",
  "/outbound":      "Outbound Dialer",
  "/insights":      "Insights",
  "/live":          "Live Monitor",
  "/train":         "Neural Atelier",
  "/knowledge":     "Knowledge Atlas",
  "/agents":        "Agent Topology",
  "/integrations":  "Carrier Bridge",
  "/admin":         "Core Settings",
};

function AppContent() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

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
            background: "conic-gradient(from 0deg, #7DF9FF, #C58BFF, #FF6BD9, #4DFFC4, #7DF9FF)",
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
          <h1 className="text-6xl md:text-8xl font-display italic lowercase text-aurora leading-[0.85] tracking-tight">
            wireline
          </h1>
          <p className="text-[10px] uppercase tracking-[0.6em] text-muted">Awakening the Aurora Relay</p>
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
      <Sidebar open={sidebarOpen} setOpen={setSidebarOpen} />

      <main className="flex-1 overflow-hidden relative flex flex-col z-10">
         {/* Mobile Header */}
         <div className="lg:hidden p-4 flex items-center justify-between z-30 sticky top-0 glass-strong border-b border-white/10 shrink-0 shadow-lg">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={sidebarOpen}
              className="w-10 h-10 rounded-xl glass border border-white/12 flex items-center justify-center hover:border-brand/50 transition-all active:scale-95"
            >
              <Menu className="w-5 h-5 text-ink" />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shadow-lg" style={{ background: "linear-gradient(135deg, #7DF9FF, #C58BFF, #FF6BD9)" }}>
                <Waves className="w-4 h-4 text-paper" strokeWidth={2.5} />
              </div>
              <span className="font-display italic lowercase text-xl text-ink leading-none tracking-tight">wireline</span>
            </div>
            <button
              onClick={() => navigate('/admin')}
              className="w-10 h-10 rounded-xl glass border border-white/12 flex items-center justify-center hover:border-brand/50 transition-all active:scale-95"
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
